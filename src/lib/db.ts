import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

/**
 * libSQL connection, schema bootstrap and row helpers.
 *
 * One code path serves both environments:
 *   - Production (Vercel): TURSO_DATABASE_URL points at a Turso database over
 *     the network. Serverless instances have no durable filesystem, so the
 *     database has to live outside the function.
 *   - Local dev and containers: no TURSO_DATABASE_URL, so we open a plain
 *     SQLite file. Same SQL, same client, no branching in the query layer.
 *
 * The client and its migration run are memoised on `globalThis` so a warm
 * serverless instance (and Next's dev-server hot reload) reuses them instead of
 * re-running CREATE TABLE on every request.
 */

const SCHEMA = `
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
    color               TEXT NOT NULL DEFAULT 'ash',
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
`;

/**
 * Reads an env var, trimming whitespace and stripping a single pair of
 * surrounding quotes.
 *
 * Pasting a value into a dashboard commonly carries quotes along with it, and a
 * quoted token produces an `Authorization: Bearer "eyJ…"` header that Turso
 * rejects with a bare `HTTP 400` — not the 401 you would expect from a bad
 * credential, which makes it look like a protocol fault instead of a typo.
 */
function readEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  return unquoted || undefined;
}

/** Most recent failed HTTP response, used to explain otherwise opaque errors. */
let lastHttpFailure: { url: string; status: number; body: string } | undefined;

/**
 * Wraps fetch to retain the response body of failed requests. The libSQL client
 * discards it and surfaces only "Server returned HTTP status 400", which says
 * nothing about what the server actually objected to.
 *
 * It must not throw: the client probes several endpoints on connect and treats
 * non-OK responses as ordinary control flow.
 */
const diagnosticFetch = async (
  input: Request | string | URL,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(input as RequestInfo, init);
  if (!response.ok) {
    try {
      const body = (await response.clone().text()).slice(0, 400);
      const href = input instanceof Request ? input.url : String(input);
      const { origin, pathname } = new URL(href);
      lastHttpFailure = { url: `${origin}${pathname}`, status: response.status, body };
    } catch {
      // Diagnostics only — never let this interfere with the real request.
    }
  }
  return response;
};

function clientConfig() {
  const url = readEnv("TURSO_DATABASE_URL");
  if (url) {
    if (!/^(libsql|https?):\/\//.test(url)) {
      throw new Error(
        `TURSO_DATABASE_URL must start with libsql:// or https:// — got "${url.slice(0, 24)}…"`,
      );
    }
    return {
      // A trailing slash makes the client resolve its endpoint paths against a
      // directory-style base and request the wrong path.
      url: url.replace(/\/+$/, ""),
      authToken: readEnv("TURSO_AUTH_TOKEN"),
      // The client types this as the loose `Function`; keep our own signature.
      fetch: diagnosticFetch as unknown as (...args: never[]) => unknown,
    };
  }

  const file =
    process.env.CRM_DB_PATH ?? path.join(process.cwd(), "data", "crm.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return { url: `file:${file}` };
}

const globalForDb = globalThis as unknown as { __crmDb?: Promise<Client> };

/**
 * Lock contention is normal here, not exceptional: several serverless instances
 * can cold-start at once and race to bootstrap the schema or write.
 */
function isTransientLockError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("database is locked") || message.includes("busy");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withLockRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientLockError(error)) throw error;
      lastError = error;
      // Exponential backoff with jitter, so racing instances don't retry in step.
      await sleep(40 * 2 ** attempt + Math.random() * 40);
    }
  }
  throw lastError;
}

/**
 * The schema as individual statements.
 *
 * Deliberately not run through `executeMultiple`: over HTTP that packs "open
 * stream → sequence → close stream" into a single pipelined request, which
 * Turso rejected with a bare `HTTP 400`. `batch` is the ordinary remote path —
 * one request, one transaction, one statement per entry.
 */
const SCHEMA_STATEMENTS = SCHEMA.split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

/** libSQL errors stringify to almost nothing; dig out what the server said. */
function describeDbError(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  const code = (error as { code?: string } | null)?.code;
  if (code) parts.push(`code=${code}`);

  if (lastHttpFailure) {
    const { url, status, body } = lastHttpFailure;
    parts.push(`server responded ${status} to ${url}${body ? ` with: ${body}` : " with an empty body"}`);
    if (status === 400 || status === 401) {
      parts.push(
        "a 400/401 on every request usually means TURSO_AUTH_TOKEN is wrong, expired, " +
          "or was saved with surrounding quotes — re-issue it with `turso db tokens create <db>`",
      );
    }
  }

  return parts.join(" | ") || String(error);
}

async function connect(): Promise<Client> {
  const config = clientConfig();
  const isFile = config.url.startsWith("file:");
  const client = createClient(config);

  if (isFile) {
    // Wait for the write lock rather than failing instantly. Turso applies its
    // own server-side queueing, so this is only needed in file mode.
    await client.execute("PRAGMA busy_timeout = 5000");
  }

  try {
    await withLockRetry(() => client.batch(SCHEMA_STATEMENTS, "write"));
  } catch (error) {
    client.close();
    throw new Error(
      `Schema bootstrap failed against ${isFile ? "the local SQLite file" : "Turso"}: ${describeDbError(error)}`,
      { cause: error },
    );
  }

  return client;
}

export function getDb(): Promise<Client> {
  if (!globalForDb.__crmDb) {
    // Clear the memo on failure, otherwise one bad cold start poisons every
    // later request on this instance with the same rejected promise.
    globalForDb.__crmDb = connect().catch((error: unknown) => {
      globalForDb.__crmDb = undefined;
      throw error;
    });
  }
  return globalForDb.__crmDb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Query helpers                                                              */
/* -------------------------------------------------------------------------- */

export type SqlArgs = (string | number | null)[];

/** Runs a statement and returns its rows cast to the caller's row shape. */
export async function all<T>(sql: string, args: SqlArgs = []): Promise<T[]> {
  const db = await getDb();
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function one<T>(sql: string, args: SqlArgs = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

export async function run(sql: string, args: SqlArgs = []): Promise<void> {
  const db = await getDb();
  await db.execute({ sql, args });
}

/**
 * Runs `body` inside a write transaction, rolling back on any error.
 *
 * Interactive transactions matter here: `moveDeal` and `deleteStage` read rows,
 * compute new positions in JS, then write them back — that read has to see the
 * same snapshot the write commits against.
 */
export async function writeTransaction<T>(
  body: (tx: Awaited<ReturnType<Client["transaction"]>>) => Promise<T>,
): Promise<T> {
  const db = await getDb();

  // Safe to retry: every caller re-reads the rows it needs inside the
  // transaction, so a replayed body recomputes against the current state
  // rather than reusing a stale snapshot.
  return withLockRetry(async () => {
    const tx = await db.transaction("write");
    try {
      const result = await body(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  });
}
