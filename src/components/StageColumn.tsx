"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import SortableDealCard from "./DealCard";
import { formatMoneyCompact } from "@/lib/format";
import { stageMetrics } from "@/lib/metrics";
import { stageAccent, type Deal, type Stage } from "@/lib/types";

export default function StageColumn({
  stage,
  deals,
  visibleDeals,
  currency,
  filtered,
  onOpenDeal,
  onAddDeal,
  onEditStage,
}: {
  stage: Stage;
  /** Every deal in the stage — drives the header roll-up and WIP limit. */
  deals: Deal[];
  /** The subset passing the active filters — what actually renders. */
  visibleDeals: Deal[];
  currency: string;
  filtered: boolean;
  onOpenDeal: (dealId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditStage: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });

  const metrics = stageMetrics(deals);
  const accent = stageAccent(stage.color);
  const overLimit = stage.wipLimit !== null && metrics.count > stage.wipLimit;

  return (
    <section
      className={`flex h-full w-[310px] shrink-0 flex-col rounded-2xl border bg-panel/70 transition ${
        isOver ? "border-red/60 bg-panel" : "border-line"
      }`}
      aria-label={`${stage.name} stage`}
    >
      <header className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${accent.bar}`} aria-hidden />
          <h2 className={`truncate text-sm font-semibold ${accent.text}`}>{stage.name}</h2>
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                overLimit ? "bg-red/15 text-red-bright" : "bg-white/10 text-white/55"
              }`}
              title={
                stage.wipLimit !== null
                  ? `${metrics.count} of ${stage.wipLimit} WIP limit`
                  : `${metrics.count} deals`
              }
            >
              {metrics.count}
              {stage.wipLimit !== null ? `/${stage.wipLimit}` : ""}
            </span>
            <button
              type="button"
              onClick={() => onEditStage(stage.id)}
              aria-label={`Stage settings for ${stage.name}`}
              className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M10 6.5A1.5 1.5 0 1 1 10 3.5a1.5 1.5 0 0 1 0 3m0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3" />
              </svg>
            </button>
          </span>
        </div>

        <div className="mt-1.5 flex items-baseline gap-2 pl-4 text-[11px]">
          <span className="font-mono font-medium text-white/75">
            {formatMoneyCompact(metrics.totalCents, currency)}
          </span>
          {stage.outcome === "open" ? (
            <span className="text-white/40">
              · {formatMoneyCompact(metrics.weightedCents, currency)} weighted
            </span>
          ) : (
            <span
              className={
                stage.outcome === "won" ? "text-white/70" : "text-red/80"
              }
            >
              · {stage.outcome === "won" ? "closed won" : "closed lost"}
            </span>
          )}
        </div>
      </header>

      <div
        ref={setNodeRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2"
      >
        <SortableContext
          items={visibleDeals.map((deal) => deal.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleDeals.map((deal) => (
            <SortableDealCard key={deal.id} deal={deal} onOpen={onOpenDeal} />
          ))}
        </SortableContext>

        {visibleDeals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11px] text-white/30">
            {filtered && deals.length > 0
              ? `${deals.length} hidden by filters`
              : "Drop a deal here"}
          </p>
        ) : null}

        {filtered && visibleDeals.length > 0 && visibleDeals.length < deals.length ? (
          <p className="pb-1 text-center text-[11px] text-white/30">
            {deals.length - visibleDeals.length} more hidden by filters
          </p>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pb-3">
        <button
          type="button"
          onClick={() => onAddDeal(stage.id)}
          className="w-full rounded-lg border border-transparent px-3 py-2 text-left text-xs font-medium text-white/40 transition hover:border-line-strong hover:bg-white/8 hover:text-white"
        >
          + Add deal
        </button>
      </div>
    </section>
  );
}
