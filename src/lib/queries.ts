import "server-only";

import { getDb, newId, nowIso } from "./db";
import { seedIfEmpty } from "./seed";
import type {
  Activity,
  ActivityKind,
  Board,
  BoardSnapshot,
  Deal,
  DealPriority,
  DealSource,
  Stage,
  StageColor,
  StageOutcome,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Row shapes + mappers                                                       */
/* -------------------------------------------------------------------------- */

interface BoardRow {
  id: string;
  name: string;
  description: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  board_id: string;
  name: string;
  position: number;
  default_probability: number;
  outcome: string;
  wip_limit: number | null;
  color: string;
  created_at: string;
}

interface DealRow {
  id: string;
  board_id: string;
  stage_id: string;
  position: number;
  title: string;
  company: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  value_cents: number;
  currency: string;
  source: string;
  priority: string;
  probability: number;
  expected_close_date: string | null;
  owner: string;
  tags: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface ActivityRow {
  id: string;
  deal_id: string;
  kind: string;
  message: string;
  actor: string;
  created_at: string;
}

function toBoard(row: BoardRow): Board {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStage(row: StageRow): Stage {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
    defaultProbability: row.default_probability,
    outcome: row.outcome as StageOutcome,
    wipLimit: row.wip_limit,
    color: row.color as StageColor,
    createdAt: row.created_at,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    boardId: row.board_id,
    stageId: row.stage_id,
    position: row.position,
    title: row.title,
    company: row.company,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    valueCents: row.value_cents,
    currency: row.currency,
    source: row.source as DealSource,
    priority: row.priority as DealPriority,
    probability: row.probability,
    expectedCloseDate: row.expected_close_date,
    owner: row.owner,
    tags: parseTags(row.tags),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    dealId: row.deal_id,
    kind: row.kind as ActivityKind,
    message: row.message,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

export function listBoards(): Board[] {
  seedIfEmpty();
  const rows = getDb()
    .prepare("SELECT * FROM boards ORDER BY created_at ASC")
    .all() as BoardRow[];
  return rows.map(toBoard);
}

export function getBoardSnapshot(boardId: string): BoardSnapshot | null {
  seedIfEmpty();
  const db = getDb();
  const boardRow = db
    .prepare("SELECT * FROM boards WHERE id = ?")
    .get(boardId) as BoardRow | undefined;
  if (!boardRow) return null;

  const stageRows = db
    .prepare("SELECT * FROM stages WHERE board_id = ? ORDER BY position ASC, created_at ASC")
    .all(boardId) as StageRow[];
  const dealRows = db
    .prepare("SELECT * FROM deals WHERE board_id = ? ORDER BY position ASC, created_at ASC")
    .all(boardId) as DealRow[];

  return {
    board: toBoard(boardRow),
    stages: stageRows.map(toStage),
    deals: dealRows.map(toDeal),
  };
}

export function listActivities(dealId: string): Activity[] {
  const rows = getDb()
    .prepare("SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(dealId) as ActivityRow[];
  return rows.map(toActivity);
}

/** Distinct owner names on a board — powers the owner filter. */
export function listOwners(boardId: string): string[] {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT owner FROM deals WHERE board_id = ? AND owner <> '' ORDER BY owner ASC",
    )
    .all(boardId) as { owner: string }[];
  return rows.map((r) => r.owner);
}

/* -------------------------------------------------------------------------- */
/*  Board mutations                                                            */
/* -------------------------------------------------------------------------- */

const DEFAULT_STAGES: {
  name: string;
  probability: number;
  outcome: StageOutcome;
  color: StageColor;
}[] = [
  { name: "Lead In", probability: 10, outcome: "open", color: "slate" },
  { name: "Qualified", probability: 30, outcome: "open", color: "sky" },
  { name: "Proposal", probability: 60, outcome: "open", color: "violet" },
  { name: "Negotiation", probability: 80, outcome: "open", color: "amber" },
  { name: "Closed Won", probability: 100, outcome: "won", color: "emerald" },
  { name: "Closed Lost", probability: 0, outcome: "lost", color: "rose" },
];

export function createBoard(input: {
  name: string;
  description?: string;
  currency?: string;
}): Board {
  const db = getDb();
  const ts = nowIso();
  const id = newId("brd");

  db.transaction(() => {
    db.prepare(
      `INSERT INTO boards (id, name, description, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.name, input.description ?? "", input.currency ?? "USD", ts, ts);

    const insertStage = db.prepare(
      `INSERT INTO stages (id, board_id, name, position, default_probability, outcome, wip_limit, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );
    DEFAULT_STAGES.forEach((stage, index) => {
      insertStage.run(
        newId("stg"),
        id,
        stage.name,
        index,
        stage.probability,
        stage.outcome,
        stage.color,
        ts,
      );
    });
  })();

  return toBoard(db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as BoardRow);
}

export function updateBoard(
  boardId: string,
  input: { name?: string; description?: string; currency?: string },
): void {
  const db = getDb();
  const current = db.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as
    | BoardRow
    | undefined;
  if (!current) return;

  db.prepare(
    `UPDATE boards SET name = ?, description = ?, currency = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.name ?? current.name,
    input.description ?? current.description,
    input.currency ?? current.currency,
    nowIso(),
    boardId,
  );
}

export function deleteBoard(boardId: string): void {
  getDb().prepare("DELETE FROM boards WHERE id = ?").run(boardId);
}

/* -------------------------------------------------------------------------- */
/*  Stage mutations                                                            */
/* -------------------------------------------------------------------------- */

export function createStage(input: {
  boardId: string;
  name: string;
  defaultProbability?: number;
  outcome?: StageOutcome;
  color?: StageColor;
  wipLimit?: number | null;
}): Stage {
  const db = getDb();
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM stages WHERE board_id = ?")
    .get(input.boardId) as { next: number };

  const id = newId("stg");
  db.prepare(
    `INSERT INTO stages (id, board_id, name, position, default_probability, outcome, wip_limit, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.boardId,
    input.name,
    next,
    clampPercent(input.defaultProbability ?? 0),
    input.outcome ?? "open",
    input.wipLimit ?? null,
    input.color ?? "slate",
    nowIso(),
  );

  return toStage(db.prepare("SELECT * FROM stages WHERE id = ?").get(id) as StageRow);
}

export function updateStage(
  stageId: string,
  input: {
    name?: string;
    defaultProbability?: number;
    outcome?: StageOutcome;
    color?: StageColor;
    wipLimit?: number | null;
  },
): void {
  const db = getDb();
  const current = db.prepare("SELECT * FROM stages WHERE id = ?").get(stageId) as
    | StageRow
    | undefined;
  if (!current) return;

  db.prepare(
    `UPDATE stages SET name = ?, default_probability = ?, outcome = ?, color = ?, wip_limit = ?
     WHERE id = ?`,
  ).run(
    input.name ?? current.name,
    input.defaultProbability === undefined
      ? current.default_probability
      : clampPercent(input.defaultProbability),
    input.outcome ?? current.outcome,
    input.color ?? current.color,
    input.wipLimit === undefined ? current.wip_limit : input.wipLimit,
    stageId,
  );
}

/**
 * Deletes a stage. Deals in it are moved to `moveDealsTo` when given, otherwise
 * they are deleted along with the stage.
 */
export function deleteStage(stageId: string, moveDealsTo?: string): void {
  const db = getDb();
  db.transaction(() => {
    if (moveDealsTo) {
      const { next } = db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM deals WHERE stage_id = ?")
        .get(moveDealsTo) as { next: number };
      const moving = db
        .prepare("SELECT id FROM deals WHERE stage_id = ? ORDER BY position ASC")
        .all(stageId) as { id: string }[];
      const update = db.prepare("UPDATE deals SET stage_id = ?, position = ? WHERE id = ?");
      moving.forEach((row, i) => update.run(moveDealsTo, next + i, row.id));
    }
    db.prepare("DELETE FROM stages WHERE id = ?").run(stageId);
  })();
}

export function reorderStages(boardId: string, orderedStageIds: string[]): void {
  const db = getDb();
  const update = db.prepare("UPDATE stages SET position = ? WHERE id = ? AND board_id = ?");
  db.transaction(() => {
    orderedStageIds.forEach((id, index) => update.run(index, id, boardId));
  })();
}

/* -------------------------------------------------------------------------- */
/*  Deal mutations                                                             */
/* -------------------------------------------------------------------------- */

export interface DealInput {
  title: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  valueCents: number;
  currency: string;
  source: DealSource;
  priority: DealPriority;
  probability: number;
  expectedCloseDate: string | null;
  owner: string;
  tags: string[];
  notes: string;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function logActivity(
  db: ReturnType<typeof getDb>,
  dealId: string,
  kind: ActivityKind,
  message: string,
  actor: string,
) {
  db.prepare(
    `INSERT INTO activities (id, deal_id, kind, message, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(newId("act"), dealId, kind, message, actor || "You", nowIso());
}

export function createDeal(input: DealInput & { boardId: string; stageId: string }): Deal {
  const db = getDb();
  const ts = nowIso();
  const id = newId("dl");

  db.transaction(() => {
    // New deals go to the top of the column — that is where a rep looks first.
    db.prepare("UPDATE deals SET position = position + 1 WHERE stage_id = ?").run(input.stageId);
    db.prepare(
      `INSERT INTO deals (id, board_id, stage_id, position, title, company, contact_name, contact_email,
                          contact_phone, value_cents, currency, source, priority, probability,
                          expected_close_date, owner, tags, notes, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.boardId,
      input.stageId,
      input.title,
      input.company,
      input.contactName,
      input.contactEmail,
      input.contactPhone,
      Math.max(0, Math.round(input.valueCents)),
      input.currency,
      input.source,
      input.priority,
      clampPercent(input.probability),
      input.expectedCloseDate,
      input.owner,
      JSON.stringify(input.tags),
      input.notes,
      ts,
      ts,
    );

    const stage = db.prepare("SELECT name FROM stages WHERE id = ?").get(input.stageId) as
      | { name: string }
      | undefined;
    logActivity(db, id, "created", `Deal created in ${stage?.name ?? "pipeline"}`, input.owner);
  })();

  return toDeal(db.prepare("SELECT * FROM deals WHERE id = ?").get(id) as DealRow);
}

export function updateDeal(dealId: string, input: DealInput): void {
  const db = getDb();
  const current = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId) as
    | DealRow
    | undefined;
  if (!current) return;

  db.transaction(() => {
    db.prepare(
      `UPDATE deals SET title = ?, company = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
                        value_cents = ?, currency = ?, source = ?, priority = ?, probability = ?,
                        expected_close_date = ?, owner = ?, tags = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.title,
      input.company,
      input.contactName,
      input.contactEmail,
      input.contactPhone,
      Math.max(0, Math.round(input.valueCents)),
      input.currency,
      input.source,
      input.priority,
      clampPercent(input.probability),
      input.expectedCloseDate,
      input.owner,
      JSON.stringify(input.tags),
      input.notes,
      nowIso(),
      dealId,
    );

    if (current.value_cents !== Math.round(input.valueCents)) {
      logActivity(
        db,
        dealId,
        "value_changed",
        `Deal size changed from ${formatMinor(current.value_cents, current.currency)} to ${formatMinor(
          Math.round(input.valueCents),
          input.currency,
        )}`,
        input.owner,
      );
    }
    if (current.owner !== input.owner) {
      logActivity(
        db,
        dealId,
        "field_changed",
        `Owner changed from ${current.owner || "unassigned"} to ${input.owner || "unassigned"}`,
        input.owner,
      );
    }
    if (current.source !== input.source) {
      logActivity(db, dealId, "field_changed", `Source set to ${input.source}`, input.owner);
    }
    if (current.priority !== input.priority) {
      logActivity(db, dealId, "field_changed", `Priority set to ${input.priority}`, input.owner);
    }
    if (current.expected_close_date !== input.expectedCloseDate) {
      logActivity(
        db,
        dealId,
        "field_changed",
        `Expected close date set to ${input.expectedCloseDate ?? "none"}`,
        input.owner,
      );
    }
  })();
}

export function deleteDeal(dealId: string): void {
  getDb().prepare("DELETE FROM deals WHERE id = ?").run(dealId);
}

/**
 * Moves a deal to `toStageId` at `toIndex`, then compacts positions in both the
 * source and destination columns so ordering stays a dense 0..n-1 sequence.
 *
 * When the deal lands in a different stage its probability is re-seeded from
 * that stage's default — moving a card forward should move the forecast too.
 */
export function moveDeal(dealId: string, toStageId: string, toIndex: number): void {
  const db = getDb();
  const deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId) as DealRow | undefined;
  if (!deal) return;
  const toStage = db.prepare("SELECT * FROM stages WHERE id = ?").get(toStageId) as
    | StageRow
    | undefined;
  if (!toStage || toStage.board_id !== deal.board_id) return;

  const fromStageId = deal.stage_id;

  db.transaction(() => {
    const siblings = (
      db
        .prepare("SELECT id FROM deals WHERE stage_id = ? AND id <> ? ORDER BY position ASC")
        .all(toStageId, dealId) as { id: string }[]
    ).map((r) => r.id);

    const index = Math.min(Math.max(0, toIndex), siblings.length);
    siblings.splice(index, 0, dealId);

    const updatePosition = db.prepare("UPDATE deals SET position = ? WHERE id = ?");
    siblings.forEach((id, i) => updatePosition.run(i, id));

    if (fromStageId !== toStageId) {
      db.prepare(
        "UPDATE deals SET stage_id = ?, probability = ?, updated_at = ? WHERE id = ?",
      ).run(toStageId, toStage.default_probability, nowIso(), dealId);

      // Compact the column the deal left.
      const remaining = db
        .prepare("SELECT id FROM deals WHERE stage_id = ? ORDER BY position ASC")
        .all(fromStageId) as { id: string }[];
      remaining.forEach((row, i) => updatePosition.run(i, row.id));

      const fromStage = db.prepare("SELECT name FROM stages WHERE id = ?").get(fromStageId) as
        | { name: string }
        | undefined;
      logActivity(
        db,
        dealId,
        "stage_changed",
        `Moved from ${fromStage?.name ?? "pipeline"} to ${toStage.name}`,
        deal.owner,
      );
    } else {
      db.prepare("UPDATE deals SET updated_at = ? WHERE id = ?").run(nowIso(), dealId);
    }
  })();
}

export function addNote(dealId: string, message: string, actor: string): void {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM deals WHERE id = ?").get(dealId);
  if (!exists) return;
  logActivity(db, dealId, "note", message, actor);
}

/** Minimal money formatter used inside activity messages. */
function formatMinor(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
