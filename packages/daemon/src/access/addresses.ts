/**
 * Enumerate and classify the machine's reachable IPv4 addresses for the
 * in-dashboard "Access from anywhere" panel.
 *
 * Each address becomes a tokenized dashboard URL the user can open from another
 * device. Classification drives the UI copy:
 *   - local     → 127.0.0.1 (this machine only)
 *   - tailscale → 100.64.0.0/10 (Tailscale CGNAT range — works from anywhere)
 *   - lan       → other RFC-1918 private ranges (same network only)
 *
 * Reachability is about the *bind host*, not the link: an address physically
 * exists, but the daemon only answers on it when bound to 0.0.0.0. When bound to
 * loopback we still list LAN/Tailscale addresses (so the panel can teach the
 * user to restart with HOST=0.0.0.0) but flag them reachable:false.
 */
import { networkInterfaces } from "node:os";

import { localDashboardUrl, tokenizedUrl } from "../cli/dashboard-url.js";

/** How an address can be reached. */
export type AddressScope = "local" | "lan" | "tailscale";

export interface AccessAddress {
  /** Human label for the UI (e.g. "Tailscale (works from anywhere)"). */
  readonly label: string;
  /** The bare host/IP (e.g. "192.168.10.171"). */
  readonly host: string;
  /** Full tokenized dashboard URL: http://<host>:<port>/?token=<token>. */
  readonly url: string;
  readonly scope: AddressScope;
  /** True when the daemon actually answers on this address right now. */
  readonly reachable: boolean;
}

export interface AccessAddresses {
  /** The host the daemon is bound to (config.host), e.g. "0.0.0.0". */
  readonly boundHost: string;
  readonly addresses: readonly AccessAddress[];
}

const LOOPBACK = "127.0.0.1";
const BIND_ALL = "0.0.0.0";

const LABELS: Record<AddressScope, string> = {
  local: "This machine",
  lan: "Local network",
  tailscale: "Tailscale (works from anywhere)",
};

type Octets = readonly [number, number, number, number];

/** Parse a dotted IPv4 string into its four octets, or null if malformed. */
function octets(address: string): Octets | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const [a, b, c, d] = parts.map((p) => Number.parseInt(p, 10));
  const nums = [a, b, c, d];
  if (nums.some((n) => n === undefined || Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return [a as number, b as number, c as number, d as number];
}

/** Tailscale assigns addresses from the 100.64.0.0/10 CGNAT block. */
function isTailscale([a, b]: Octets): boolean {
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * Classify a dotted IPv4 address. 100.64/10 → tailscale; everything else
 * non-loopback (RFC-1918 private ranges and any other reachable interface) → lan.
 */
function classify(address: string): AddressScope {
  if (address === LOOPBACK) {
    return "local";
  }
  const parts = octets(address);
  if (parts && isTailscale(parts)) {
    return "tailscale";
  }
  return "lan";
}

/** Build one AccessAddress for a host given the bind state. */
function toAddress(
  host: string,
  port: number,
  token: string,
  boundToAll: boolean,
): AccessAddress {
  const scope = classify(host);
  // localDashboardUrl maps 0.0.0.0 → loopback; here host is always concrete.
  const url =
    scope === "local"
      ? localDashboardUrl(host, port, token)
      : tokenizedUrl(`http://${host}:${port}`, token);
  // Loopback is always reachable; LAN/Tailscale only when bound to 0.0.0.0.
  const reachable = scope === "local" ? true : boundToAll;
  return { label: LABELS[scope], host, url, scope, reachable };
}

/**
 * List every classified IPv4 address the daemon could be reached on. Loopback
 * is always included first; external interfaces follow (skipping internal/down).
 */
export function listAddresses(
  boundHost: string,
  port: number,
  token: string,
): AccessAddresses {
  const boundToAll = boundHost === BIND_ALL;
  const addresses: AccessAddress[] = [
    toAddress(LOOPBACK, port, token, boundToAll),
  ];

  const seen = new Set<string>([LOOPBACK]);
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) {
      continue;
    }
    for (const info of list) {
      // node >=18 reports family as the string "IPv4".
      if (info.family !== "IPv4" || info.internal) {
        continue;
      }
      if (seen.has(info.address)) {
        continue;
      }
      seen.add(info.address);
      addresses.push(toAddress(info.address, port, token, boundToAll));
    }
  }

  return { boundHost, addresses };
}
