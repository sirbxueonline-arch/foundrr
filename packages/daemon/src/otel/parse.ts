/**
 * Pure parser for OTLP/JSON metrics bodies emitted by Claude Code's
 * OpenTelemetry exporter (OTEL_EXPORTER_OTLP_PROTOCOL=http/json).
 *
 * We only care about two counters:
 *   - claude_code.cost.usage  (USD spent)
 *   - claude_code.token.usage (tokens used)
 *
 * Both are delta-temporality sums by default, so each datapoint is an
 * INCREMENT to accumulate, not an absolute value. We bucket increments by the
 * `session.id` attribute (falling back to "unknown") and return per-session
 * sums for this single push. The caller accumulates across pushes.
 *
 * The envelope is walked entirely defensively — any level may be missing or
 * malformed. This function NEVER throws; on garbage it returns empty maps.
 */

const COST_METRIC = "claude_code.cost.usage";
const TOKEN_METRIC = "claude_code.token.usage";
const SESSION_ID_KEY = "session.id";
const UNKNOWN_SESSION = "unknown";

export interface ParsedMetrics {
  /** Per-session USD increments from this push. */
  readonly costBySession: Map<string, number>;
  /** Per-session token increments from this push. */
  readonly tokensBySession: Map<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Read the numeric value from an OTLP datapoint. Tolerates the protobuf-JSON
 * `asDouble` / `asInt` fields (where ints are serialized as strings) and a
 * plain `value` fallback. Returns 0 when nothing parseable is present.
 */
function readDataPointValue(dp: Record<string, unknown>): number {
  const candidates = [dp["asDouble"], dp["asInt"], dp["value"]];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

/** Pull `session.id` from a datapoint's attribute list; fallback "unknown". */
function readSessionId(dp: Record<string, unknown>): string {
  for (const attr of asArray(dp["attributes"])) {
    if (!isRecord(attr) || attr["key"] !== SESSION_ID_KEY) {
      continue;
    }
    const value = attr["value"];
    if (isRecord(value)) {
      const str = value["stringValue"];
      if (typeof str === "string" && str.length > 0) {
        return str;
      }
    }
  }
  return UNKNOWN_SESSION;
}

/** A metric may carry datapoints under `sum`, `gauge`, or directly. */
function dataPointsOf(metric: Record<string, unknown>): unknown[] {
  const sum = metric["sum"];
  if (isRecord(sum) && Array.isArray(sum["dataPoints"])) {
    return sum["dataPoints"];
  }
  const gauge = metric["gauge"];
  if (isRecord(gauge) && Array.isArray(gauge["dataPoints"])) {
    return gauge["dataPoints"];
  }
  if (Array.isArray(metric["dataPoints"])) {
    return metric["dataPoints"];
  }
  return [];
}

function addTo(map: Map<string, number>, key: string, amount: number): void {
  if (amount === 0) {
    return;
  }
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Walk one metric, bucketing its datapoints into the right map. */
function ingestMetric(
  metric: Record<string, unknown>,
  cost: Map<string, number>,
  tokens: Map<string, number>,
): void {
  const name = metric["name"];
  const target =
    name === COST_METRIC ? cost : name === TOKEN_METRIC ? tokens : undefined;
  if (!target) {
    return;
  }
  for (const dp of dataPointsOf(metric)) {
    if (!isRecord(dp)) {
      continue;
    }
    addTo(target, readSessionId(dp), readDataPointValue(dp));
  }
}

/**
 * Parse an OTLP/JSON metrics body into per-session cost/token increments.
 * Never throws — returns empty maps on anything unexpected.
 */
export function parseOtlpMetrics(body: unknown): ParsedMetrics {
  const costBySession = new Map<string, number>();
  const tokensBySession = new Map<string, number>();

  try {
    if (!isRecord(body)) {
      return { costBySession, tokensBySession };
    }
    for (const resourceMetric of asArray(body["resourceMetrics"])) {
      if (!isRecord(resourceMetric)) {
        continue;
      }
      for (const scopeMetric of asArray(resourceMetric["scopeMetrics"])) {
        if (!isRecord(scopeMetric)) {
          continue;
        }
        for (const metric of asArray(scopeMetric["metrics"])) {
          if (isRecord(metric)) {
            ingestMetric(metric, costBySession, tokensBySession);
          }
        }
      }
    }
  } catch {
    // Defensive: malformed envelope → empty maps rather than a throw.
    return { costBySession: new Map(), tokensBySession: new Map() };
  }

  return { costBySession, tokensBySession };
}
