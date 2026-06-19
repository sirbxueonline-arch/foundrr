/**
 * SQLite connection factory. Opens the database in WAL mode and runs migrations.
 */
import Database from "better-sqlite3";

import { runMigrations } from "./migrations.js";

/** Open (or create) the database at `path`, enable WAL, and run migrations. */
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}
