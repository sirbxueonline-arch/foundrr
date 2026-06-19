// Supabase REST client for live telemetry aggregates.
// The publishable (anon) key is public by design — it only grants read access
// to the aggregate views, never to raw rows.

export interface GlobalTotals {
  total_tokens: number;
  total_cost_usd: number;
  installs: number;
  events: number;
  models: number;
}

export interface LeaderboardRow {
  agent: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  installs: number;
  events: number;
  last_seen: string | null;
}

const DEFAULT_SUPABASE_URL = "https://hmnviltczxxxpzunpnlb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "sb_publishable_Ur8F6EIn7NuHu2Pe6pnuYA_2FbexIUw";

// Default to the literals so the page renders even if env is unset on Vercel.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const EMPTY_TOTALS: GlobalTotals = {
  total_tokens: 0,
  total_cost_usd: 0,
  installs: 0,
  events: 0,
  models: 0,
};

function restHeaders(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// `revalidate` is honored on the server (Next.js fetch cache). On the client
// it is ignored, so client polling drives freshness there.
type FetchOpts = { revalidate?: number; signal?: AbortSignal };

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTotals(raw: Partial<GlobalTotals> | undefined): GlobalTotals {
  if (!raw) return EMPTY_TOTALS;
  return {
    total_tokens: toNumber(raw.total_tokens),
    total_cost_usd: toNumber(raw.total_cost_usd),
    installs: toNumber(raw.installs),
    events: toNumber(raw.events),
    models: toNumber(raw.models),
  };
}

function normalizeRow(raw: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    agent: String(raw.agent ?? "unknown"),
    total_tokens: toNumber(raw.total_tokens),
    input_tokens: toNumber(raw.input_tokens),
    output_tokens: toNumber(raw.output_tokens),
    total_cost_usd: toNumber(raw.total_cost_usd),
    installs: toNumber(raw.installs),
    events: toNumber(raw.events),
    last_seen: raw.last_seen ?? null,
  };
}

export async function fetchGlobalTotals(
  opts: FetchOpts = {},
): Promise<GlobalTotals> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/global_totals?select=*`, {
      headers: restHeaders(),
      signal: opts.signal,
      ...(opts.revalidate !== undefined
        ? { next: { revalidate: opts.revalidate } }
        : {}),
    });
    if (!res.ok) return EMPTY_TOTALS;
    const rows = (await res.json()) as Partial<GlobalTotals>[];
    return normalizeTotals(Array.isArray(rows) ? rows[0] : undefined);
  } catch {
    return EMPTY_TOTALS;
  }
}

export async function fetchLeaderboard(
  opts: FetchOpts = {},
): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/model_leaderboard?select=*`,
      {
        headers: restHeaders(),
        signal: opts.signal,
        ...(opts.revalidate !== undefined
          ? { next: { revalidate: opts.revalidate } }
          : {}),
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Partial<LeaderboardRow>[];
    if (!Array.isArray(rows)) return [];
    return rows.map(normalizeRow);
  } catch {
    return [];
  }
}
