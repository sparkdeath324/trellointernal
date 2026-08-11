import { all, newId, nowIso, one, run, writeTransaction } from "./db";
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

/**
 * All SQL lives here, plus the row → domain mapping.
 *
 * Every function is async: in production the database is reached over the
 * network (Turso), so nothing can stay synchronous the way it was under
 * better-sqlite3.
 *
 * Child rows are deleted explicitly rather than leaning on ON DELETE CASCADE —
 * cascade only fires when `PRAGMA foreign_keys` is on, which is not guaranteed
 * across libSQL deployments. Doing it by hand keeps deletes correct either way.
 */

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
    position: Number(row.position),
    defaultProbability: Number(row.default_probability),
    outcome: row.outcome as StageOutcome,
    wipLimit: row.wip_limit === null ? null : Number(row.wip_limit),
    color: row.color as StageColor,
    createdAt: row.created_at,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    boardId: row.board_id,
    stageId: row.stage_id,
    position: Number(row.position),
    title: row.title,
    company: row.company,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    valueCents: Number(row.value_cents),
    currency: row.currency,
    source: row.source as DealSource,
    priority: row.priority as DealPriority,
    probability: Number(row.probability),
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

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listBoards(): Promise<Board[]> {
  await seedIfEmpty();
  const rows = await all<BoardRow>("SELECT * FROM boards ORDER BY created_at ASC");
  return rows.map(toBoard);
}

export async function getBoardSnapshot(
  boardId: string,
): Promise<BoardSnapshot | null> {
  await seedIfEmpty();

  const boardRow = await one<BoardRow>("SELECT * FROM boards WHERE id = ?", [boardId]);
  if (!boardRow) return null;

  const [stageRows, dealRows] = await Promise.all([
    all<StageRow>(
      "SELECT * FROM stages WHERE board_id = ? ORDER BY position ASC, created_at ASC",
      [boardId],
    ),
    all<DealRow>(
      "SELECT * FROM deals WHERE board_id = ? ORDER BY position ASC, created_at ASC",
      [boardId],
    ),
  ]);

  return {
    board: toBoard(boardRow),
    stages: stageRows.map(toStage),
    deals: dealRows.map(toDeal),
  };
}

export async function getDeal(dealId: string): Promise<Deal | null> {
  const row = await one<DealRow>("SELECT * FROM deals WHERE id = ?", [dealId]);
  return row ? toDeal(row) : null;
}

export async function getStage(stageId: string): Promise<Stage | null> {
  const row = await one<StageRow>("SELECT * FROM stages WHERE id = ?", [stageId]);
  return row ? toStage(row) : null;
}

export async function listActivities(dealId: string): Promise<Activity[]> {
  const rows = await all<ActivityRow>(
    "SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC, rowid DESC",
    [dealId],
  );
  return rows.map(toActivity);
}

/** Distinct owner names on a board — powers the owner filter. */
export async function listOwners(boardId: string): Promise<string[]> {
  const rows = await all<{ owner: string }>(
    "SELECT DISTINCT owner FROM deals WHERE board_id = ? AND owner <> '' ORDER BY owner ASC",
    [boardId],
  );
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
  { name: "Lead In", probability: 10, outcome: "open", color: "ash" },
  { name: "Qualified", probability: 30, outcome: "open", color: "silver" },
  { name: "Proposal", probability: 60, outcome: "open", color: "crimson" },
  { name: "Negotiation", probability: 80, outcome: "open", color: "red" },
  { name: "Closed Won", probability: 100, outcome: "won", color: "white" },
  { name: "Closed Lost", probability: 0, outcome: "lost", color: "crimson" },
];

export async function createBoard(input: {
  name: string;
  description?: string;
  currency?: string;
}): Promise<Board> {
  const ts = nowIso();
  const id = newId("brd");

  await writeTransaction(async (tx) => {
    await tx.execute({
      sql: `INSERT INTO boards (id, name, description, currency, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, input.name, input.description ?? "", input.currency ?? "USD", ts, ts],
    });

    for (const [index, stage] of DEFAULT_STAGES.entries()) {
      await tx.execute({
        sql: `INSERT INTO stages (id, board_id, name, position, default_probability, outcome, wip_limit, color, created_at)
              VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        args: [
          newId("stg"),
          id,
          stage.name,
          index,
          stage.probability,
          stage.outcome,
          stage.color,
          ts,
        ],
      });
    }
  });

  const row = await one<BoardRow>("SELECT * FROM boards WHERE id = ?", [id]);
  return toBoard(row!);
}

export async function updateBoard(
  boardId: string,
  input: { name?: string; description?: string; currency?: string },
): Promise<void> {
  const current = await one<BoardRow>("SELECT * FROM boards WHERE id = ?", [boardId]);
  if (!current) return;

  await run(
    "UPDATE boards SET name = ?, description = ?, currency = ?, updated_at = ? WHERE id = ?",
    [
      input.name ?? current.name,
      input.description ?? current.description,
      input.currency ?? current.currency,
      nowIso(),
      boardId,
    ],
  );
}

export async function deleteBoard(boardId: string): Promise<void> {
  await writeTransaction(async (tx) => {
    await tx.execute({
      sql: `DELETE FROM activities
            WHERE deal_id IN (SELECT id FROM deals WHERE board_id = ?)`,
      args: [boardId],
    });
    await tx.execute({ sql: "DELETE FROM deals WHERE board_id = ?", args: [boardId] });
    await tx.execute({ sql: "DELETE FROM stages WHERE board_id = ?", args: [boardId] });
    await tx.execute({ sql: "DELETE FROM boards WHERE id = ?", args: [boardId] });
  });
}

/* -------------------------------------------------------------------------- */
/*  Stage mutations                                                            */
/* -------------------------------------------------------------------------- */

export async function createStage(input: {
  boardId: string;
  name: string;
  defaultProbability?: number;
  outcome?: StageOutcome;
  color?: StageColor;
  wipLimit?: number | null;
}): Promise<Stage> {
  const next = await one<{ next: number }>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM stages WHERE board_id = ?",
    [input.boardId],
  );

  const id = newId("stg");
  await run(
    `INSERT INTO stages (id, board_id, name, position, default_probability, outcome, wip_limit, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.boardId,
      input.name,
      Number(next?.next ?? 0),
      clampPercent(input.defaultProbability ?? 0),
      input.outcome ?? "open",
      input.wipLimit ?? null,
      input.color ?? "ash",
      nowIso(),
    ],
  );

  return (await getStage(id))!;
}

export async function updateStage(
  stageId: string,
  input: {
    name?: string;
    defaultProbability?: number;
    outcome?: StageOutcome;
    color?: StageColor;
    wipLimit?: number | null;
  },
): Promise<void> {
  const current = await one<StageRow>("SELECT * FROM stages WHERE id = ?", [stageId]);
  if (!current) return;

  await run(
    `UPDATE stages SET name = ?, default_probability = ?, outcome = ?, color = ?, wip_limit = ?
     WHERE id = ?`,
    [
      input.name ?? current.name,
      input.defaultProbability === undefined
        ? Number(current.default_probability)
        : clampPercent(input.defaultProbability),
      input.outcome ?? current.outcome,
      input.color ?? current.color,
      input.wipLimit === undefined
        ? current.wip_limit === null
          ? null
          : Number(current.wip_limit)
        : input.wipLimit,
      stageId,
    ],
  );
}

/**
 * Deletes a stage. Deals in it are moved to `moveDealsTo` when given, otherwise
 * they are deleted along with the stage.
 */
export async function deleteStage(
  stageId: string,
  moveDealsTo?: string,
): Promise<void> {
  await writeTransaction(async (tx) => {
    if (moveDealsTo) {
      const nextResult = await tx.execute({
        sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM deals WHERE stage_id = ?",
        args: [moveDealsTo],
      });
      const next = Number(
        (nextResult.rows[0] as unknown as { next: number } | undefined)?.next ?? 0,
      );

      const moving = await tx.execute({
        sql: "SELECT id FROM deals WHERE stage_id = ? ORDER BY position ASC",
        args: [stageId],
      });

      for (const [i, row] of (moving.rows as unknown as { id: string }[]).entries()) {
        await tx.execute({
          sql: "UPDATE deals SET stage_id = ?, position = ? WHERE id = ?",
          args: [moveDealsTo, next + i, row.id],
        });
      }
    } else {
      await tx.execute({
        sql: `DELETE FROM activities
              WHERE deal_id IN (SELECT id FROM deals WHERE stage_id = ?)`,
        args: [stageId],
      });
      await tx.execute({ sql: "DELETE FROM deals WHERE stage_id = ?", args: [stageId] });
    }

    await tx.execute({ sql: "DELETE FROM stages WHERE id = ?", args: [stageId] });
  });
}

export async function reorderStages(
  boardId: string,
  orderedStageIds: string[],
): Promise<void> {
  await writeTransaction(async (tx) => {
    for (const [index, id] of orderedStageIds.entries()) {
      await tx.execute({
        sql: "UPDATE stages SET position = ? WHERE id = ? AND board_id = ?",
        args: [index, id, boardId],
      });
    }
  });
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

type Tx = Parameters<Parameters<typeof writeTransaction>[0]>[0];

async function logActivity(
  tx: Tx,
  dealId: string,
  kind: ActivityKind,
  message: string,
  actor: string,
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO activities (id, deal_id, kind, message, actor, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [newId("act"), dealId, kind, message, actor || "You", nowIso()],
  });
}

export async function createDeal(
  input: DealInput & { boardId: string; stageId: string },
): Promise<Deal> {
  const ts = nowIso();
  const id = newId("dl");

  await writeTransaction(async (tx) => {
    // New deals go to the top of the column — that is where a rep looks first.
    await tx.execute({
      sql: "UPDATE deals SET position = position + 1 WHERE stage_id = ?",
      args: [input.stageId],
    });

    await tx.execute({
      sql: `INSERT INTO deals (id, board_id, stage_id, position, title, company, contact_name, contact_email,
                               contact_phone, value_cents, currency, source, priority, probability,
                               expected_close_date, owner, tags, notes, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ],
    });

    const stageResult = await tx.execute({
      sql: "SELECT name FROM stages WHERE id = ?",
      args: [input.stageId],
    });
    const stageName =
      (stageResult.rows[0] as unknown as { name: string } | undefined)?.name ??
      "pipeline";

    await logActivity(tx, id, "created", `Deal created in ${stageName}`, input.owner);
  });

  return (await getDeal(id))!;
}

export async function updateDeal(dealId: string, input: DealInput): Promise<void> {
  const current = await one<DealRow>("SELECT * FROM deals WHERE id = ?", [dealId]);
  if (!current) return;

  const nextValueCents = Math.max(0, Math.round(input.valueCents));

  await writeTransaction(async (tx) => {
    await tx.execute({
      sql: `UPDATE deals SET title = ?, company = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
                             value_cents = ?, currency = ?, source = ?, priority = ?, probability = ?,
                             expected_close_date = ?, owner = ?, tags = ?, notes = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        input.title,
        input.company,
        input.contactName,
        input.contactEmail,
        input.contactPhone,
        nextValueCents,
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
      ],
    });

    if (Number(current.value_cents) !== nextValueCents) {
      await logActivity(
        tx,
        dealId,
        "value_changed",
        `Deal size changed from ${formatMinor(
          Number(current.value_cents),
          current.currency,
        )} to ${formatMinor(nextValueCents, input.currency)}`,
        input.owner,
      );
    }
    if (current.owner !== input.owner) {
      await logActivity(
        tx,
        dealId,
        "field_changed",
        `Owner changed from ${current.owner || "unassigned"} to ${input.owner || "unassigned"}`,
        input.owner,
      );
    }
    if (current.source !== input.source) {
      await logActivity(
        tx,
        dealId,
        "field_changed",
        `Source set to ${input.source}`,
        input.owner,
      );
    }
    if (current.priority !== input.priority) {
      await logActivity(
        tx,
        dealId,
        "field_changed",
        `Priority set to ${input.priority}`,
        input.owner,
      );
    }
    if (current.expected_close_date !== input.expectedCloseDate) {
      await logActivity(
        tx,
        dealId,
        "field_changed",
        `Expected close date set to ${input.expectedCloseDate ?? "none"}`,
        input.owner,
      );
    }
  });
}

export async function deleteDeal(dealId: string): Promise<void> {
  await writeTransaction(async (tx) => {
    await tx.execute({ sql: "DELETE FROM activities WHERE deal_id = ?", args: [dealId] });
    await tx.execute({ sql: "DELETE FROM deals WHERE id = ?", args: [dealId] });
  });
}

/**
 * Moves a deal to `toStageId` at `toIndex`, then compacts positions in both the
 * source and destination columns so ordering stays a dense 0..n-1 sequence.
 *
 * When the deal lands in a different stage its probability is re-seeded from
 * that stage's default — moving a card forward should move the forecast too.
 */
export async function moveDeal(
  dealId: string,
  toStageId: string,
  toIndex: number,
): Promise<void> {
  const deal = await one<DealRow>("SELECT * FROM deals WHERE id = ?", [dealId]);
  if (!deal) return;
  const toStage = await one<StageRow>("SELECT * FROM stages WHERE id = ?", [toStageId]);
  if (!toStage || toStage.board_id !== deal.board_id) return;

  const fromStageId = deal.stage_id;

  await writeTransaction(async (tx) => {
    const siblingRows = await tx.execute({
      sql: "SELECT id FROM deals WHERE stage_id = ? AND id <> ? ORDER BY position ASC",
      args: [toStageId, dealId],
    });
    const siblings = (siblingRows.rows as unknown as { id: string }[]).map((r) => r.id);

    const index = Math.min(Math.max(0, toIndex), siblings.length);
    siblings.splice(index, 0, dealId);

    for (const [i, id] of siblings.entries()) {
      await tx.execute({
        sql: "UPDATE deals SET position = ? WHERE id = ?",
        args: [i, id],
      });
    }

    if (fromStageId !== toStageId) {
      await tx.execute({
        sql: "UPDATE deals SET stage_id = ?, probability = ?, updated_at = ? WHERE id = ?",
        args: [toStageId, Number(toStage.default_probability), nowIso(), dealId],
      });

      // Compact the column the deal left.
      const remainingRows = await tx.execute({
        sql: "SELECT id FROM deals WHERE stage_id = ? ORDER BY position ASC",
        args: [fromStageId],
      });
      for (const [i, row] of (
        remainingRows.rows as unknown as { id: string }[]
      ).entries()) {
        await tx.execute({
          sql: "UPDATE deals SET position = ? WHERE id = ?",
          args: [i, row.id],
        });
      }

      const fromStageResult = await tx.execute({
        sql: "SELECT name FROM stages WHERE id = ?",
        args: [fromStageId],
      });
      const fromName =
        (fromStageResult.rows[0] as unknown as { name: string } | undefined)?.name ??
        "pipeline";

      await logActivity(
        tx,
        dealId,
        "stage_changed",
        `Moved from ${fromName} to ${toStage.name}`,
        deal.owner,
      );
    } else {
      await tx.execute({
        sql: "UPDATE deals SET updated_at = ? WHERE id = ?",
        args: [nowIso(), dealId],
      });
    }
  });
}

export async function addNote(
  dealId: string,
  message: string,
  actor: string,
): Promise<void> {
  const exists = await one<{ id: string }>("SELECT id FROM deals WHERE id = ?", [dealId]);
  if (!exists) return;

  await writeTransaction(async (tx) => {
    await logActivity(tx, dealId, "note", message, actor);
  });
}

/** Minimal money formatter used inside activity messages. */
function formatMinor(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
