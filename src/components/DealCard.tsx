"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  avatarTint,
  closeDateLabel,
  formatMoney,
  initials,
} from "@/lib/format";
import { priorityMeta, sourceLabel, type Deal } from "@/lib/types";

const CLOSE_TONE: Record<string, string> = {
  ok: "bg-slate-800 text-slate-400",
  soon: "bg-amber-500/15 text-amber-300",
  late: "bg-rose-500/15 text-rose-300",
};

/** The card face. Kept separate so the drag overlay can reuse it verbatim. */
export function DealCardFace({
  deal,
  dragging = false,
}: {
  deal: Deal;
  dragging?: boolean;
}) {
  const priority = priorityMeta(deal.priority);
  const close = deal.expectedCloseDate ? closeDateLabel(deal.expectedCloseDate) : null;

  return (
    <article
      className={`rounded-xl border bg-slate-900/90 p-3 text-left transition ${
        dragging
          ? "border-indigo-400/70 shadow-xl shadow-indigo-950/50"
          : "border-slate-700/70 hover:border-slate-600"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-slate-100">
          {deal.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.className}`}
        >
          {priority.label}
        </span>
      </div>

      {deal.company ? (
        <p className="mt-1 truncate text-xs text-slate-400">{deal.company}</p>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-semibold tracking-tight text-emerald-300">
          {formatMoney(deal.valueCents, deal.currency)}
        </span>
        <span className="text-[11px] text-slate-500">{deal.probability}%</span>
      </div>

      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800"
        role="img"
        aria-label={`${deal.probability}% win probability`}
      >
        <div
          className="h-full rounded-full bg-indigo-400/80"
          style={{ width: `${deal.probability}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-400">
          {sourceLabel(deal.source)}
        </span>
        {close ? (
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${CLOSE_TONE[close.tone]}`}
          >
            {close.text}
          </span>
        ) : null}
        {deal.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300"
          >
            {tag}
          </span>
        ))}
        {deal.tags.length > 2 ? (
          <span className="text-[10px] text-slate-500">+{deal.tags.length - 2}</span>
        ) : null}
      </div>

      {deal.owner ? (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-2.5">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${avatarTint(
              deal.owner,
            )}`}
            aria-hidden
          >
            {initials(deal.owner)}
          </span>
          <span className="truncate text-[11px] text-slate-400">{deal.owner}</span>
        </div>
      ) : null}
    </article>
  );
}

export default function SortableDealCard({
  deal,
  onOpen,
}: {
  deal: Deal;
  onOpen: (dealId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id, data: { type: "deal", stageId: deal.stageId } });

  // Enter opens the deal; the keyboard sensor is bound to Space (see BoardView),
  // so the sortable's own key handler still gets every other key.
  const { onKeyDown: sortableKeyDown, ...dragListeners } = listeners ?? {};

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40" : undefined}
    >
      <div
        {...attributes}
        {...dragListeners}
        role="button"
        tabIndex={0}
        aria-label={`Open deal ${deal.title}`}
        onClick={() => onOpen(deal.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onOpen(deal.id);
            return;
          }
          sortableKeyDown?.(event);
        }}
        className="block w-full cursor-grab touch-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:cursor-grabbing"
      >
        <DealCardFace deal={deal} />
      </div>
    </div>
  );
}
