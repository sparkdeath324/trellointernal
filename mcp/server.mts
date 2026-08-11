#!/usr/bin/env node
/**
 * MCP server for the pipeline CRM.
 *
 * Exposes the board's features — boards, stages, deals and the forecast
 * roll-ups — as MCP tools over stdio, backed by the same SQLite database the
 * web app uses (`data/crm.db`, override with `CRM_DB_PATH`). Anything changed
 * through here shows up in the UI on the next request, and vice versa.
 *
 *   npm run mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as db from "../src/lib/queries";
import { pipelineMetrics, stageMetrics, valueBySource } from "../src/lib/metrics";
import { formatMoney } from "../src/lib/format";
import type { Deal, DealPriority, DealSource, Stage } from "../src/lib/types";

/* -------------------------------------------------------------------------- */
/*  Shared schema fragments                                                    */
/* -------------------------------------------------------------------------- */

const sourceEnum = z.enum([
  "inbound",
  "outbound",
  "referral",
  "partner",
  "event",
  "website",
  "cold_call",
  "social",
  "paid_ads",
  "other",
]);

const priorityEnum = z.enum(["low", "medium", "high", "critical"]);
const outcomeEnum = z.enum(["open", "won", "lost"]);
const colorEnum = z.enum(["white", "silver", "ash", "rose", "red", "crimson"]);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Deal value is taken in whole currency units — agents think in dollars, not cents. */
const dealValue = z
  .number()
  .min(0)
  .describe("Deal size in whole currency units, e.g. 148000 for $148,000");

/* -------------------------------------------------------------------------- */
/*  Result helpers                                                             */
/* -------------------------------------------------------------------------- */

function json(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Deals go out with a human-readable value alongside the raw cents. */
function presentDeal(deal: Deal, stages?: Stage[]) {
  const stage = stages?.find((s) => s.id === deal.stageId);
  return {
    ...deal,
    value: deal.valueCents / 100,
    valueFormatted: formatMoney(deal.valueCents, deal.currency),
    weightedValue: Math.round(deal.valueCents * deal.probability) / 10_000,
    stageName: stage?.name,
  };
}

function money(cents: number, currency: string) {
  return { cents, amount: cents / 100, formatted: formatMoney(cents, currency) };
}

/* -------------------------------------------------------------------------- */
/*  Server                                                                     */
/* -------------------------------------------------------------------------- */

const server = new McpServer({
  name: "pipeline-crm",
  version: "1.0.0",
});

/* ------------------------------- boards --------------------------------- */

server.registerTool(
  "list_boards",
  {
    title: "List boards",
    description:
      "List every pipeline board with its headline numbers (open pipeline, weighted forecast, closed won). Start here to find a boardId.",
  },
  async () => {
    const boards = db.listBoards().map((board) => {
      const snapshot = db.getBoardSnapshot(board.id);
      const metrics = snapshot
        ? pipelineMetrics(snapshot.stages, snapshot.deals)
        : null;
      return {
        id: board.id,
        name: board.name,
        description: board.description,
        currency: board.currency,
        stageCount: snapshot?.stages.length ?? 0,
        dealCount: snapshot?.deals.length ?? 0,
        openPipeline: metrics ? money(metrics.openValueCents, board.currency) : null,
        weightedForecast: metrics
          ? money(metrics.weightedValueCents, board.currency)
          : null,
        closedWon: metrics ? money(metrics.wonValueCents, board.currency) : null,
      };
    });
    return json(boards);
  },
);

server.registerTool(
  "get_board",
  {
    title: "Get board",
    description:
      "Fetch one board in full: its stages in pipeline order (each with a deal count and value roll-up) and every deal on it.",
    inputSchema: {
      boardId: z.string(),
      includeDeals: z
        .boolean()
        .default(true)
        .describe("Set false for just the stage structure and totals."),
    },
  },
  async ({ boardId, includeDeals }) => {
    const snapshot = db.getBoardSnapshot(boardId);
    if (!snapshot) return fail(`No board with id ${boardId}`);

    const { board, stages, deals } = snapshot;
    return json({
      board,
      stages: stages.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stageId === stage.id);
        const metrics = stageMetrics(stageDeals);
        return {
          ...stage,
          dealCount: metrics.count,
          total: money(metrics.totalCents, board.currency),
          weighted: money(metrics.weightedCents, board.currency),
        };
      }),
      deals: includeDeals ? deals.map((deal) => presentDeal(deal, stages)) : undefined,
    });
  },
);

server.registerTool(
  "create_board",
  {
    title: "Create board",
    description:
      "Create a new pipeline board, pre-populated with a standard six-stage pipeline (Lead In → Closed Won / Closed Lost).",
    inputSchema: {
      name: z.string().min(1).max(120),
      description: z.string().max(300).default(""),
      currency: z.string().length(3).default("USD"),
    },
  },
  async ({ name, description, currency }) => {
    const board = db.createBoard({ name, description, currency });
    return json({ board, stages: db.getBoardSnapshot(board.id)?.stages ?? [] });
  },
);

/* ------------------------------- stages --------------------------------- */

server.registerTool(
  "create_stage",
  {
    title: "Create stage",
    description:
      "Append a pipeline stage to a board. `outcome` decides how its deals are counted: open deals feed the forecast, won/lost ones do not.",
    inputSchema: {
      boardId: z.string(),
      name: z.string().min(1).max(60),
      defaultProbability: z
        .number()
        .int()
        .min(0)
        .max(100)
        .default(0)
        .describe("Win probability applied to deals moved into this stage."),
      outcome: outcomeEnum.default("open"),
      color: colorEnum.default("ash"),
      wipLimit: z.number().int().min(1).max(999).nullable().default(null),
    },
  },
  async ({ boardId, ...fields }) => {
    if (!db.getBoardSnapshot(boardId)) return fail(`No board with id ${boardId}`);
    return json(db.createStage({ boardId, ...fields }));
  },
);

server.registerTool(
  "update_stage",
  {
    title: "Update stage",
    description: "Change a stage's name, default probability, outcome, colour or WIP limit. Omitted fields are left alone.",
    inputSchema: {
      stageId: z.string(),
      name: z.string().min(1).max(60).optional(),
      defaultProbability: z.number().int().min(0).max(100).optional(),
      outcome: outcomeEnum.optional(),
      color: colorEnum.optional(),
      wipLimit: z.number().int().min(1).max(999).nullable().optional(),
    },
  },
  async ({ stageId, ...fields }) => {
    if (!db.getStage(stageId)) return fail(`No stage with id ${stageId}`);
    db.updateStage(stageId, fields);
    return json(db.getStage(stageId));
  },
);

server.registerTool(
  "delete_stage",
  {
    title: "Delete stage",
    description:
      "Delete a stage. Pass `moveDealsTo` to relocate its deals; without it, the deals in that stage are deleted too.",
    inputSchema: {
      stageId: z.string(),
      moveDealsTo: z.string().optional(),
    },
  },
  async ({ stageId, moveDealsTo }) => {
    const stage = db.getStage(stageId);
    if (!stage) return fail(`No stage with id ${stageId}`);
    if (moveDealsTo && !db.getStage(moveDealsTo)) {
      return fail(`No stage with id ${moveDealsTo} to move deals into`);
    }
    db.deleteStage(stageId, moveDealsTo);
    return json({ deleted: stageId, dealsMovedTo: moveDealsTo ?? null });
  },
);

server.registerTool(
  "reorder_stages",
  {
    title: "Reorder stages",
    description: "Set the left-to-right order of a board's stages. Pass every stage id, in the order you want.",
    inputSchema: {
      boardId: z.string(),
      orderedStageIds: z.array(z.string()).min(1),
    },
  },
  async ({ boardId, orderedStageIds }) => {
    const snapshot = db.getBoardSnapshot(boardId);
    if (!snapshot) return fail(`No board with id ${boardId}`);

    const known = new Set(snapshot.stages.map((s) => s.id));
    const unknown = orderedStageIds.filter((id) => !known.has(id));
    if (unknown.length) return fail(`Not stages on this board: ${unknown.join(", ")}`);
    if (orderedStageIds.length !== known.size) {
      return fail(
        `Expected all ${known.size} stage ids, got ${orderedStageIds.length}`,
      );
    }

    db.reorderStages(boardId, orderedStageIds);
    return json(db.getBoardSnapshot(boardId)?.stages ?? []);
  },
);

/* -------------------------------- deals --------------------------------- */

server.registerTool(
  "list_deals",
  {
    title: "List deals",
    description:
      "List deals on a board with optional filters. Combine filters freely — they are ANDed. Results are ordered by stage, then by position in the column.",
    inputSchema: {
      boardId: z.string(),
      stageId: z.string().optional(),
      owner: z.string().optional(),
      source: sourceEnum.optional(),
      priority: priorityEnum.optional(),
      query: z
        .string()
        .optional()
        .describe("Free text matched against title, company, contact, owner, notes and tags."),
      minValue: dealValue.optional(),
      maxValue: dealValue.optional(),
      closingBefore: isoDate.optional().describe("Only deals expected to close on or before this date."),
    },
  },
  async ({ boardId, stageId, owner, source, priority, query, minValue, maxValue, closingBefore }) => {
    const snapshot = db.getBoardSnapshot(boardId);
    if (!snapshot) return fail(`No board with id ${boardId}`);

    const stageOrder = new Map(snapshot.stages.map((s, i) => [s.id, i]));
    const needle = query?.toLowerCase();

    const deals = snapshot.deals
      .filter((deal) => {
        if (stageId && deal.stageId !== stageId) return false;
        if (owner && deal.owner !== owner) return false;
        if (source && deal.source !== source) return false;
        if (priority && deal.priority !== priority) return false;
        if (minValue !== undefined && deal.valueCents < minValue * 100) return false;
        if (maxValue !== undefined && deal.valueCents > maxValue * 100) return false;
        if (closingBefore) {
          if (!deal.expectedCloseDate) return false;
          if (deal.expectedCloseDate > closingBefore) return false;
        }
        if (needle) {
          const haystack = [
            deal.title,
            deal.company,
            deal.contactName,
            deal.contactEmail,
            deal.owner,
            deal.notes,
            ...deal.tags,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          (stageOrder.get(a.stageId) ?? 0) - (stageOrder.get(b.stageId) ?? 0) ||
          a.position - b.position,
      );

    return json({
      count: deals.length,
      totalValue: money(
        deals.reduce((sum, deal) => sum + deal.valueCents, 0),
        snapshot.board.currency,
      ),
      deals: deals.map((deal) => presentDeal(deal, snapshot.stages)),
    });
  },
);

server.registerTool(
  "get_deal",
  {
    title: "Get deal",
    description: "Fetch one deal with all its CRM fields and its full activity history, newest first.",
    inputSchema: { dealId: z.string() },
  },
  async ({ dealId }) => {
    const deal = db.getDeal(dealId);
    if (!deal) return fail(`No deal with id ${dealId}`);
    const stage = db.getStage(deal.stageId);
    return json({
      deal: presentDeal(deal, stage ? [stage] : []),
      stage,
      activities: db.listActivities(dealId),
    });
  },
);

server.registerTool(
  "create_deal",
  {
    title: "Create deal",
    description:
      "Add a deal to a stage. It lands at the top of that column. Probability defaults to the stage's default when not given.",
    inputSchema: {
      boardId: z.string(),
      stageId: z.string(),
      title: z.string().min(1).max(160),
      value: dealValue.default(0),
      company: z.string().max(120).default(""),
      contactName: z.string().max(120).default(""),
      contactEmail: z.string().max(160).default(""),
      contactPhone: z.string().max(60).default(""),
      source: sourceEnum.default("other"),
      priority: priorityEnum.default("medium"),
      probability: z.number().int().min(0).max(100).optional(),
      expectedCloseDate: isoDate.nullable().default(null),
      owner: z.string().max(120).default(""),
      tags: z.array(z.string().min(1).max(40)).max(12).default([]),
      notes: z.string().max(4000).default(""),
    },
  },
  async ({ boardId, stageId, value, probability, ...rest }) => {
    const snapshot = db.getBoardSnapshot(boardId);
    if (!snapshot) return fail(`No board with id ${boardId}`);
    const stage = snapshot.stages.find((s) => s.id === stageId);
    if (!stage) return fail(`Stage ${stageId} is not on board ${boardId}`);

    const deal = db.createDeal({
      ...rest,
      boardId,
      stageId,
      valueCents: Math.round(value * 100),
      currency: snapshot.board.currency,
      probability: probability ?? stage.defaultProbability,
    });
    return json(presentDeal(deal, snapshot.stages));
  },
);

server.registerTool(
  "update_deal",
  {
    title: "Update deal",
    description:
      "Update a deal's CRM fields. Only the fields you pass are changed. Changes to deal size, owner, source, priority and close date are written to the activity log. Use move_deal to change stage.",
    inputSchema: {
      dealId: z.string(),
      title: z.string().min(1).max(160).optional(),
      value: dealValue.optional(),
      company: z.string().max(120).optional(),
      contactName: z.string().max(120).optional(),
      contactEmail: z.string().max(160).optional(),
      contactPhone: z.string().max(60).optional(),
      source: sourceEnum.optional(),
      priority: priorityEnum.optional(),
      probability: z.number().int().min(0).max(100).optional(),
      expectedCloseDate: isoDate.nullable().optional(),
      owner: z.string().max(120).optional(),
      tags: z.array(z.string().min(1).max(40)).max(12).optional(),
      notes: z.string().max(4000).optional(),
    },
  },
  async ({ dealId, value, ...patch }) => {
    const current = db.getDeal(dealId);
    if (!current) return fail(`No deal with id ${dealId}`);

    db.updateDeal(dealId, {
      title: patch.title ?? current.title,
      company: patch.company ?? current.company,
      contactName: patch.contactName ?? current.contactName,
      contactEmail: patch.contactEmail ?? current.contactEmail,
      contactPhone: patch.contactPhone ?? current.contactPhone,
      valueCents: value === undefined ? current.valueCents : Math.round(value * 100),
      currency: current.currency,
      source: (patch.source ?? current.source) as DealSource,
      priority: (patch.priority ?? current.priority) as DealPriority,
      probability: patch.probability ?? current.probability,
      expectedCloseDate:
        patch.expectedCloseDate === undefined
          ? current.expectedCloseDate
          : patch.expectedCloseDate,
      owner: patch.owner ?? current.owner,
      tags: patch.tags ?? current.tags,
      notes: patch.notes ?? current.notes,
    });

    const updated = db.getDeal(dealId)!;
    return json(presentDeal(updated, [db.getStage(updated.stageId)!]));
  },
);

server.registerTool(
  "move_deal",
  {
    title: "Move deal",
    description:
      "Move a deal to another stage (or reorder it within its stage). Moving to a different stage re-seeds the deal's win probability from that stage's default and logs the transition.",
    inputSchema: {
      dealId: z.string(),
      toStageId: z.string(),
      toIndex: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Position within the destination column; 0 is the top."),
    },
  },
  async ({ dealId, toStageId, toIndex }) => {
    const deal = db.getDeal(dealId);
    if (!deal) return fail(`No deal with id ${dealId}`);
    const stage = db.getStage(toStageId);
    if (!stage) return fail(`No stage with id ${toStageId}`);
    if (stage.boardId !== deal.boardId) {
      return fail(`Stage ${toStageId} belongs to a different board`);
    }

    db.moveDeal(dealId, toStageId, toIndex);
    const moved = db.getDeal(dealId)!;
    return json(presentDeal(moved, [stage]));
  },
);

server.registerTool(
  "delete_deal",
  {
    title: "Delete deal",
    description: "Permanently delete a deal and its activity history.",
    inputSchema: { dealId: z.string() },
  },
  async ({ dealId }) => {
    const deal = db.getDeal(dealId);
    if (!deal) return fail(`No deal with id ${dealId}`);
    db.deleteDeal(dealId);
    return json({ deleted: dealId, title: deal.title });
  },
);

server.registerTool(
  "add_deal_note",
  {
    title: "Log activity on a deal",
    description: "Append a note to a deal's activity timeline — a call summary, an email recap, the agreed next step.",
    inputSchema: {
      dealId: z.string(),
      message: z.string().min(1).max(2000),
      actor: z.string().max(120).default("Agent"),
    },
  },
  async ({ dealId, message, actor }) => {
    if (!db.getDeal(dealId)) return fail(`No deal with id ${dealId}`);
    db.addNote(dealId, message, actor);
    return json(db.listActivities(dealId).slice(0, 5));
  },
);

/* ------------------------------ reporting -------------------------------- */

server.registerTool(
  "pipeline_summary",
  {
    title: "Pipeline summary",
    description:
      "Forecast roll-up for a board: open pipeline, probability-weighted forecast, closed won/lost, win rate, average deal size, a per-stage breakdown and value by lead source.",
    inputSchema: { boardId: z.string() },
  },
  async ({ boardId }) => {
    const snapshot = db.getBoardSnapshot(boardId);
    if (!snapshot) return fail(`No board with id ${boardId}`);

    const { board, stages, deals } = snapshot;
    const metrics = pipelineMetrics(stages, deals);

    return json({
      board: { id: board.id, name: board.name, currency: board.currency },
      totals: {
        openDeals: metrics.openCount,
        openPipeline: money(metrics.openValueCents, board.currency),
        weightedForecast: money(metrics.weightedValueCents, board.currency),
        closedWon: money(metrics.wonValueCents, board.currency),
        closedLost: money(metrics.lostValueCents, board.currency),
        wonCount: metrics.wonCount,
        lostCount: metrics.lostCount,
        winRate: Math.round(metrics.winRate * 100) / 100,
        averageOpenDeal: money(metrics.avgOpenDealCents, board.currency),
      },
      byStage: stages.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stageId === stage.id);
        const stats = stageMetrics(stageDeals);
        return {
          stageId: stage.id,
          name: stage.name,
          outcome: stage.outcome,
          dealCount: stats.count,
          total: money(stats.totalCents, board.currency),
          weighted: money(stats.weightedCents, board.currency),
          overWipLimit: stage.wipLimit !== null && stats.count > stage.wipLimit,
        };
      }),
      bySource: valueBySource(deals).map((row) => ({
        source: row.source,
        dealCount: row.count,
        total: money(row.cents, board.currency),
      })),
    });
  },
);

/* -------------------------------------------------------------------------- */

const transport = new StdioServerTransport();
await server.connect(transport);
