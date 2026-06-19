/**
 * CRUD over the `servers_registered` table. Registered servers carry a launch
 * command so they can be started/restarted, unlike merely-detected processes.
 */
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import type { RegisteredServer, RegisterServerBody } from "@mission-control/shared";

interface RegisteredRow {
  id: string;
  name: string;
  cwd: string;
  command: string;
  created_at: number;
  pid: number | null;
}

/** Map a DB row to the client-facing RegisteredServer shape. */
function rowToServer(row: RegisteredRow): RegisteredServer {
  const server: RegisteredServer = {
    id: row.id,
    name: row.name,
    cwd: row.cwd,
    command: row.command,
    createdAt: row.created_at,
  };
  return row.pid === null ? server : { ...server, pid: row.pid };
}

/** All registered servers, newest first. */
export function listRegistered(db: Database.Database): RegisteredServer[] {
  const rows = db
    .prepare(
      "SELECT id, name, cwd, command, created_at, pid FROM servers_registered ORDER BY created_at DESC",
    )
    .all() as RegisteredRow[];
  return rows.map(rowToServer);
}

/** A single registered server by id, or undefined. */
export function getRegistered(
  db: Database.Database,
  id: string,
): RegisteredServer | undefined {
  const row = db
    .prepare(
      "SELECT id, name, cwd, command, created_at, pid FROM servers_registered WHERE id = ?",
    )
    .get(id) as RegisteredRow | undefined;
  return row ? rowToServer(row) : undefined;
}

/** Create a registered server from a validated body. Generates the id + ts. */
export function createRegistered(
  db: Database.Database,
  body: RegisterServerBody,
): RegisteredServer {
  const server: RegisteredServer = {
    id: randomUUID(),
    name: body.name,
    cwd: body.cwd,
    command: body.command,
    createdAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO servers_registered (id, name, cwd, command, created_at, pid)
     VALUES (@id, @name, @cwd, @command, @created_at, NULL)`,
  ).run({
    id: server.id,
    name: server.name,
    cwd: server.cwd,
    command: server.command,
    created_at: server.createdAt,
  });
  return server;
}

/** Delete a registered server by id. */
export function deleteRegistered(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM servers_registered WHERE id = ?").run(id);
}

/** Record (or clear, with null) the last pid launched for a registered server. */
export function setPid(
  db: Database.Database,
  id: string,
  pid: number | null,
): void {
  db.prepare("UPDATE servers_registered SET pid = ? WHERE id = ?").run(pid, id);
}
