"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import * as db from "@/lib/queries";
import type { Activity } from "@/lib/types";

/**
 * Server actions for every board mutation. Each one validates its payload,
 * writes through `lib/queries`, and revalidates the board route so the server
 * component tree re-renders with fresh data.
 */

const sourceSchema = z.enum([
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

const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
const outcomeSchema = z.enum(["open", "won", "lost"]);
const colorSchema = z.enum([
  "white",
  "silver",
  "ash",
  "rose",
  "red",
  "crimson",
]);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

const dealFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the deal a name").max(160),
  company: z.string().trim().max(120).default(""),
  contactName: z.string().trim().max(120).default(""),
  contactEmail: z.string().trim().max(160).default(""),
  contactPhone: z.string().trim().max(60).default(""),
  valueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().length(3).default("USD"),
  source: sourceSchema,
  priority: prioritySchema,
  probability: z.number().int().min(0).max(100),
  expectedCloseDate: isoDateSchema,
  owner: z.string().trim().max(120).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  notes: z.string().max(4000).default(""),
});

export type DealFields = z.infer<typeof dealFieldsSchema>;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
  }
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, error: message };
}

function revalidateBoard(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
  revalidatePath("/");
}

/* ------------------------------- deals ---------------------------------- */

export async function createDealAction(input: {
  boardId: string;
  stageId: string;
  fields: unknown;
}): Promise<ActionResult> {
  try {
    const fields = dealFieldsSchema.parse(input.fields);
    await db.createDeal({ ...fields, boardId: input.boardId, stageId: input.stageId });
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateDealAction(input: {
  boardId: string;
  dealId: string;
  fields: unknown;
}): Promise<ActionResult> {
  try {
    const fields = dealFieldsSchema.parse(input.fields);
    await db.updateDeal(input.dealId, fields);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDealAction(input: {
  boardId: string;
  dealId: string;
}): Promise<ActionResult> {
  try {
    await db.deleteDeal(input.dealId);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function moveDealAction(input: {
  boardId: string;
  dealId: string;
  toStageId: string;
  toIndex: number;
}): Promise<ActionResult> {
  try {
    const index = z.number().int().min(0).parse(input.toIndex);
    await db.moveDeal(input.dealId, input.toStageId, index);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addNoteAction(input: {
  boardId: string;
  dealId: string;
  message: string;
  actor: string;
}): Promise<ActionResult> {
  try {
    const message = z.string().trim().min(1, "Write something first").max(2000).parse(input.message);
    await db.addNote(input.dealId, message, input.actor);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function listActivitiesAction(dealId: string): Promise<Activity[]> {
  return db.listActivities(dealId);
}

/* ------------------------------- stages --------------------------------- */

const stageFieldsSchema = z.object({
  name: z.string().trim().min(1, "Give the stage a name").max(60),
  defaultProbability: z.number().int().min(0).max(100),
  outcome: outcomeSchema,
  color: colorSchema,
  wipLimit: z.number().int().min(1).max(999).nullable(),
});

export async function createStageAction(input: {
  boardId: string;
  fields: unknown;
}): Promise<ActionResult> {
  try {
    const fields = stageFieldsSchema.parse(input.fields);
    await db.createStage({ ...fields, boardId: input.boardId });
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateStageAction(input: {
  boardId: string;
  stageId: string;
  fields: unknown;
}): Promise<ActionResult> {
  try {
    const fields = stageFieldsSchema.parse(input.fields);
    await db.updateStage(input.stageId, fields);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteStageAction(input: {
  boardId: string;
  stageId: string;
  moveDealsTo?: string;
}): Promise<ActionResult> {
  try {
    await db.deleteStage(input.stageId, input.moveDealsTo);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reorderStagesAction(input: {
  boardId: string;
  orderedStageIds: string[];
}): Promise<ActionResult> {
  try {
    await db.reorderStages(input.boardId, input.orderedStageIds);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------- boards --------------------------------- */

export async function createBoardAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const board = await db.createBoard({
    name,
    description: String(formData.get("description") ?? "").trim(),
    currency: String(formData.get("currency") ?? "USD").trim() || "USD",
  });
  revalidatePath("/");
  redirect(`/boards/${board.id}`);
}

export async function updateBoardAction(input: {
  boardId: string;
  name: string;
  description: string;
  currency: string;
}): Promise<ActionResult> {
  try {
    const parsed = z
      .object({
        name: z.string().trim().min(1, "Board needs a name").max(120),
        description: z.string().trim().max(300),
        currency: z.string().trim().length(3),
      })
      .parse(input);
    await db.updateBoard(input.boardId, parsed);
    revalidateBoard(input.boardId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBoardAction(boardId: string): Promise<void> {
  await db.deleteBoard(boardId);
  revalidatePath("/");
  redirect("/");
}
