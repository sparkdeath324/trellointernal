/**
 * Domain types for the CRM pipeline board.
 *
 * Money is stored as integer cents everywhere (`valueCents`) and only converted
 * to a display string at the edges — see `lib/format.ts`.
 */

export type StageOutcome = "open" | "won" | "lost";

export type DealSource =
  | "inbound"
  | "outbound"
  | "referral"
  | "partner"
  | "event"
  | "website"
  | "cold_call"
  | "social"
  | "paid_ads"
  | "other";

export type DealPriority = "low" | "medium" | "high" | "critical";

export interface Board {
  id: string;
  name: string;
  description: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  boardId: string;
  name: string;
  position: number;
  /** Default win probability (0-100) applied to deals landing in this stage. */
  defaultProbability: number;
  outcome: StageOutcome;
  /** Soft cap on deal count; null means unlimited. */
  wipLimit: number | null;
  color: StageColor;
  createdAt: string;
}

export interface Deal {
  id: string;
  boardId: string;
  stageId: string;
  position: number;
  title: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  valueCents: number;
  currency: string;
  source: DealSource;
  priority: DealPriority;
  /** 0-100. Seeded from the stage, then editable per deal. */
  probability: number;
  /** ISO date (YYYY-MM-DD) or null. */
  expectedCloseDate: string | null;
  owner: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityKind =
  | "created"
  | "stage_changed"
  | "value_changed"
  | "field_changed"
  | "note";

export interface Activity {
  id: string;
  dealId: string;
  kind: ActivityKind;
  message: string;
  actor: string;
  createdAt: string;
}

/** A board with its stages and deals, ready to render. */
export interface BoardSnapshot {
  board: Board;
  stages: Stage[];
  deals: Deal[];
}

/* -------------------------------------------------------------------------- */
/*  Option metadata — the single source of truth for labels shown in the UI.  */
/* -------------------------------------------------------------------------- */

export const DEAL_SOURCES: { value: DealSource; label: string }[] = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "referral", label: "Referral" },
  { value: "partner", label: "Partner" },
  { value: "event", label: "Event / Conference" },
  { value: "website", label: "Website" },
  { value: "cold_call", label: "Cold Call" },
  { value: "social", label: "Social" },
  { value: "paid_ads", label: "Paid Ads" },
  { value: "other", label: "Other" },
];

export const DEAL_PRIORITIES: {
  value: DealPriority;
  label: string;
  /** Tailwind classes for the priority pill. */
  className: string;
}[] = [
  { value: "low", label: "Low", className: "bg-slate-700/60 text-slate-300" },
  { value: "medium", label: "Medium", className: "bg-sky-500/15 text-sky-300" },
  { value: "high", label: "High", className: "bg-amber-500/15 text-amber-300" },
  {
    value: "critical",
    label: "Critical",
    className: "bg-rose-500/15 text-rose-300",
  },
];

export const STAGE_OUTCOMES: { value: StageOutcome; label: string }[] = [
  { value: "open", label: "Open pipeline" },
  { value: "won", label: "Closed won" },
  { value: "lost", label: "Closed lost" },
];

export type StageColor =
  | "slate"
  | "indigo"
  | "violet"
  | "sky"
  | "amber"
  | "emerald"
  | "rose";

export const STAGE_COLORS: { value: StageColor; label: string; dot: string }[] =
  [
    { value: "slate", label: "Slate", dot: "bg-slate-400" },
    { value: "sky", label: "Sky", dot: "bg-sky-400" },
    { value: "indigo", label: "Indigo", dot: "bg-indigo-400" },
    { value: "violet", label: "Violet", dot: "bg-violet-400" },
    { value: "amber", label: "Amber", dot: "bg-amber-400" },
    { value: "emerald", label: "Emerald", dot: "bg-emerald-400" },
    { value: "rose", label: "Rose", dot: "bg-rose-400" },
  ];

/** Accent classes per stage colour, used by the column header. */
export const STAGE_ACCENT: Record<StageColor, { bar: string; text: string }> = {
  slate: { bar: "bg-slate-400", text: "text-slate-300" },
  sky: { bar: "bg-sky-400", text: "text-sky-300" },
  indigo: { bar: "bg-indigo-400", text: "text-indigo-300" },
  violet: { bar: "bg-violet-400", text: "text-violet-300" },
  amber: { bar: "bg-amber-400", text: "text-amber-300" },
  emerald: { bar: "bg-emerald-400", text: "text-emerald-300" },
  rose: { bar: "bg-rose-400", text: "text-rose-300" },
};

export function sourceLabel(source: DealSource): string {
  return DEAL_SOURCES.find((s) => s.value === source)?.label ?? "Other";
}

export function priorityMeta(priority: DealPriority) {
  return DEAL_PRIORITIES.find((p) => p.value === priority) ?? DEAL_PRIORITIES[1];
}
