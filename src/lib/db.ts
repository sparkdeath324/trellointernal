import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * SQLite connection, schema bootstrap and first-run seed.
 *
 * The handle is cached on `globalThis` so Next's dev-server hot reloads reuse
 * one connection instead of opening a new file handle per module evaluation.
 */

const DB_PATH =
  process.env.CRM_DB_PATH ?? path.join(process.cwd(), "data", "crm.db");

type Conn = InstanceType<typeof Database>;

const globalForDb = globalThis as unknown as { __crmDb?: Conn };

function migrate(db: Conn) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      currency    TEXT NOT NULL DEFAULT 'USD',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stages (
      id                  TEXT PRIMARY KEY,
      board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name                TEXT NOT NULL,
      position            INTEGER NOT NULL,
      default_probability INTEGER NOT NULL DEFAULT 0,
      outcome             TEXT NOT NULL DEFAULT 'open',
      wip_limit           INTEGER,
      color               TEXT NOT NULL DEFAULT 'slate',
      created_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id                  TEXT PRIMARY KEY,
      board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      stage_id            TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      position            INTEGER NOT NULL,
      title               TEXT NOT NULL,
      company             TEXT NOT NULL DEFAULT '',
      contact_name        TEXT NOT NULL DEFAULT '',
      contact_email       TEXT NOT NULL DEFAULT '',
      contact_phone       TEXT NOT NULL DEFAULT '',
      value_cents         INTEGER NOT NULL DEFAULT 0,
      currency            TEXT NOT NULL DEFAULT 'USD',
      source              TEXT NOT NULL DEFAULT 'other',
      priority            TEXT NOT NULL DEFAULT 'medium',
      probability         INTEGER NOT NULL DEFAULT 0,
      expected_close_date TEXT,
      owner               TEXT NOT NULL DEFAULT '',
      tags                TEXT NOT NULL DEFAULT '[]',
      notes               TEXT NOT NULL DEFAULT '',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id         TEXT PRIMARY KEY,
      deal_id    TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      message    TEXT NOT NULL,
      actor      TEXT NOT NULL DEFAULT 'You',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stages_board ON stages(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_deals_stage  ON deals(stage_id, position);
    CREATE INDEX IF NOT EXISTS idx_deals_board  ON deals(board_id);
    CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id, created_at);
  `);
}

export function getDb(): Conn {
  if (globalForDb.__crmDb) return globalForDb.__crmDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  migrate(db);
  globalForDb.__crmDb = db;
  return db;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
