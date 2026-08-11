/** Display helpers shared by server and client components. */

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * The currency symbol Intl would use, e.g. "$" for USD.
 * Falls back to the code itself for currencies with no symbol.
 */
function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? `${currency} `;
}

/**
 * Compact form for column headers and KPI tiles: $1.2M, $48K, $940.
 *
 * Compaction is done by hand rather than with `Intl` `notation: "compact"`,
 * whose trailing-zero behaviour differs between Node's ICU and the browser's
 * and produced a hydration mismatch ($96.0K server vs $96K client).
 */
export function formatMoneyCompact(cents: number, currency: string): string {
  const amount = cents / 100;
  const abs = Math.abs(amount);
  if (abs < 10_000) return formatMoney(cents, currency);

  const [divisor, suffix] = abs >= 1_000_000 ? [1_000_000, "M"] : [1_000, "K"];
  const scaled = amount / divisor;
  const digits = Math.abs(scaled) >= 100 ? 0 : 1;
  const rounded = scaled.toFixed(digits).replace(/\.0$/, "");
  const sign = rounded.startsWith("-") ? "-" : "";

  return `${sign}${currencySymbol(currency)}${rounded.replace("-", "")}${suffix}`;
}

/** Parses free-form money input ("$148,000", "148k", "1.2m") into cents. */
export function parseMoneyToCents(input: string): number {
  const trimmed = input.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!trimmed) return 0;

  const match = /^(-?\d*\.?\d+)([km])?$/.exec(trimmed);
  if (!match) return 0;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return 0;

  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return Math.max(0, Math.round(base * multiplier * 100));
}

export function centsToInputValue(cents: number): string {
  return cents === 0 ? "" : String(cents / 100);
}

const DAY_MS = 86_400_000;

/** Whole days from today (UTC) until an ISO date; negative when overdue. */
export function daysUntil(isoDate: string): number {
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(target)) return 0;
  return Math.round((target - todayUtc) / DAY_MS);
}

export function formatCloseDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "in 12d" / "3d overdue" / "today" — the urgency label on a card. */
export function closeDateLabel(isoDate: string): { text: string; tone: "ok" | "soon" | "late" } {
  const days = daysUntil(isoDate);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "late" };
  if (days === 0) return { text: "due today", tone: "late" };
  if (days <= 7) return { text: `in ${days}d`, tone: "soon" };
  return { text: formatCloseDate(isoDate), tone: "ok" };
}

export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar tint so the same owner keeps the same colour. */
const AVATAR_TINTS = [
  "bg-red/20 text-red-bright",
  "bg-white/15 text-white",
  "bg-red/15 text-red-bright",
  "bg-white/12 text-white/85",
  "bg-red-deep/35 text-red-bright",
  "bg-red/20 text-red-bright",
];

export function avatarTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
