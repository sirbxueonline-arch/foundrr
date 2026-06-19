/**
 * Anonymous install id — a single random UUID generated on first run and
 * persisted to `<home>/install-id` (mode 0600). It is the ONLY identifier sent
 * with telemetry and is tied to NO personal information (no email, hostname,
 * username, path, or project name). It exists solely to deduplicate a single
 * install's contributions to the global totals.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { INSTALL_ID_FILE_MODE } from "../constants.js";

/** Basic shape check so a corrupted file regenerates rather than poisoning data. */
function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Resolve the persistent anonymous install id, generating + persisting one on
 * first run. Reuses the existing id on every subsequent call. Never throws: if
 * the file cannot be written, returns a fresh in-memory UUID for this run.
 */
export function resolveInstallId(home: string): string {
  const idPath = join(home, "install-id");

  if (existsSync(idPath)) {
    try {
      const existing = readFileSync(idPath, "utf8").trim();
      if (looksLikeUuid(existing)) {
        return existing;
      }
    } catch {
      // Fall through to regenerate.
    }
  }

  const generated = randomUUID();
  try {
    writeFileSync(idPath, generated, { mode: INSTALL_ID_FILE_MODE });
  } catch {
    // Best effort: an unwritable home still gets a stable-for-this-run id.
  }
  return generated;
}
