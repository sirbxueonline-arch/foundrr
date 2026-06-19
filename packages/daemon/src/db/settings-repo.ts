/**
 * CRUD over the singleton `settings` table (id pinned to 1 via a CHECK).
 * Holds local-only preferences: whether anonymous global usage sharing is on,
 * the chosen model/agent key, and the watermark of already-reported usage
 * (last_tokens / last_cost) so a restart never double-counts a delta.
 *
 * Every read lazily materializes the row from schema defaults, so callers never
 * have to seed it. Writes are immutable from the caller's view: each setter
 * returns nothing and the next getX() reflects the new persisted value.
 */
import type Database from "better-sqlite3";

import { DEFAULT_MODEL } from "@mission-control/shared";

interface SettingsRow {
  telemetry_share: number;
  model: string | null;
  last_tokens: number;
  last_cost: number;
}

export interface Settings {
  readonly telemetryShare: boolean;
  readonly model: string;
  readonly lastTokens: number;
  readonly lastCost: number;
}

const DEFAULTS: Settings = {
  telemetryShare: true,
  model: DEFAULT_MODEL,
  lastTokens: 0,
  lastCost: 0,
};

/** Read the singleton settings row, falling back to schema defaults. */
export function getSettings(db: Database.Database): Settings {
  const row = db
    .prepare(
      "SELECT telemetry_share, model, last_tokens, last_cost FROM settings WHERE id = 1",
    )
    .get() as SettingsRow | undefined;
  if (!row) {
    return DEFAULTS;
  }
  return {
    telemetryShare: row.telemetry_share !== 0,
    model: row.model ?? DEFAULT_MODEL,
    lastTokens: row.last_tokens ?? 0,
    lastCost: row.last_cost ?? 0,
  };
}

/** Toggle anonymous global usage sharing on/off, preserving other fields. */
export function setTelemetryShare(db: Database.Database, share: boolean): void {
  db.prepare(
    `INSERT INTO settings (id, telemetry_share)
     VALUES (1, @share)
     ON CONFLICT(id) DO UPDATE SET telemetry_share = excluded.telemetry_share`,
  ).run({ share: share ? 1 : 0 });
}

/** Persist the chosen model/agent key, preserving other fields. */
export function setModel(db: Database.Database, model: string): void {
  db.prepare(
    `INSERT INTO settings (id, model)
     VALUES (1, @model)
     ON CONFLICT(id) DO UPDATE SET model = excluded.model`,
  ).run({ model });
}

/**
 * Advance the reported-usage watermark after a successful report. Stored so a
 * daemon restart resumes from the last reported totals instead of re-sending
 * the full lifetime usage as one giant delta.
 */
export function setUsageWatermark(
  db: Database.Database,
  lastTokens: number,
  lastCost: number,
): void {
  db.prepare(
    `INSERT INTO settings (id, last_tokens, last_cost)
     VALUES (1, @tokens, @cost)
     ON CONFLICT(id) DO UPDATE SET
       last_tokens = excluded.last_tokens,
       last_cost = excluded.last_cost`,
  ).run({ tokens: lastTokens, cost: lastCost });
}
