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
  /** Tailwind classes for the priority pill — urgency reads as redness. */
  className: string;
}[] = [
  { value: "low", label: "Low", className: "bg-white/8 text-white/45" },
  { value: "medium", label: "Medium", className: "bg-white/12 text-white/75" },
  { value: "high", label: "High", className: "bg-red/15 text-red-bright" },
  {
    value: "critical",
    label: "Critical",
    className: "bg-red text-white",
  },
];

export const STAGE_OUTCOMES: { value: StageOutcome; label: string }[] = [
  { value: "open", label: "Open pipeline" },
  { value: "won", label: "Closed won" },
  { value: "lost", label: "Closed lost" },
];

export type StageColor =
  | "white"
  | "silver"
  | "ash"
  | "rose"
  | "red"
  | "crimson";

export const STAGE_COLORS: { value: StageColor; label: string; dot: string }[] =
  [
    { value: "white", label: "White", dot: "bg-white" },
    { value: "silver", label: "Silver", dot: "bg-white/60" },
    { value: "ash", label: "Ash", dot: "bg-white/30" },
    { value: "rose", label: "Muted red", dot: "bg-red/50" },
    { value: "red", label: "Red", dot: "bg-red" },
    { value: "crimson", label: "Deep red", dot: "bg-red-deep" },
  ];

/** Accent classes per stage colour, used by the column header. */
export const STAGE_ACCENT: Record<StageColor, { bar: string; text: string }> = {
  white: { bar: "bg-white", text: "text-white" },
  silver: { bar: "bg-white/60", text: "text-white/80" },
  ash: { bar: "bg-white/30", text: "text-white/55" },
  rose: { bar: "bg-red/50", text: "text-red-bright/80" },
  red: { bar: "bg-red", text: "text-red-bright" },
  crimson: { bar: "bg-red-deep", text: "text-red" },
};

/**
 * Colour names from the pre-palette schema. Kept so a database written before
 * the black/white/red rework still renders instead of falling through to a
 * missing accent.
 */
const LEGACY_STAGE_COLORS: Record<string, StageColor> = {
  slate: "ash",
  sky: "silver",
  indigo: "silver",
  violet: "rose",
  amber: "rose",
  emerald: "white",
};

export function stageAccent(color: string) {
  const resolved = (LEGACY_STAGE_COLORS[color] ?? color) as StageColor;
  return STAGE_ACCENT[resolved] ?? STAGE_ACCENT.ash;
}

export function sourceLabel(source: DealSource): string {
  return DEAL_SOURCES.find((s) => s.value === source)?.label ?? "Other";
}

export function priorityMeta(priority: DealPriority) {
  return DEAL_PRIORITIES.find((p) => p.value === priority) ?? DEAL_PRIORITIES[1];
}
