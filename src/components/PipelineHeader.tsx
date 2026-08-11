"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import FilterBar, { type Filters } from "./FilterBar";
import { formatMoneyCompact } from "@/lib/format";
import type { PipelineMetrics } from "@/lib/metrics";

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "forecast" | "won";
}) {
  const tones = {
    default: "text-white",
    forecast: "text-red-bright",
    won: "text-white",
  };
  return (
    <div className="rounded-xl border border-line bg-card/70 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-lg font-semibold tracking-tight ${tones[tone]}`}>
        {value}
      </p>
      {sub ? <p className="text-[11px] text-white/40">{sub}</p> : null}
    </div>
  );
}

export default function PipelineHeader({
  boardId,
  boardName,
  boardDescription,
  currency,
  boards,
  owners,
  metrics,
  filters,
  onFiltersChange,
  filterCounts,
  visibleCount,
  totalCount,
  onAddStage,
  onAddDeal,
}: {
  boardId: string;
  boardName: string;
  boardDescription: string;
  currency: string;
  boards: { id: string; name: string }[];
  owners: string[];
  metrics: PipelineMetrics;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  filterCounts: {
    owner: Record<string, number>;
    source: Record<string, number>;
    priority: Record<string, number>;
  };
  visibleCount: number;
  totalCount: number;
  onAddStage: () => void;
  onAddDeal: () => void;
}) {
  const router = useRouter();

  return (
    <header className="shrink-0 border-b border-line bg-black/30 px-5 py-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-white/40 transition hover:text-white/80"
            >
              Boards
            </Link>
            <span className="text-white/20">/</span>
            {boards.length > 1 ? (
              <select
                value={boardId}
                onChange={(e) => router.push(`/boards/${e.target.value}`)}
                aria-label="Switch board"
                className="appearance-none rounded-md border border-transparent bg-transparent py-0.5 pl-1.5 pr-7 text-lg font-semibold text-white transition hover:border-line-strong focus:border-red focus:outline-none"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id} className="bg-panel">
                    {board.name}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="truncate text-lg font-semibold text-white">{boardName}</h1>
            )}
          </div>
          {boardDescription ? (
            <p className="mt-1 max-w-xl truncate text-xs text-white/40">
              {boardDescription}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={onAddStage}>
            + Stage
          </Button>
          <Button onClick={onAddDeal}>+ New deal</Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Open pipeline"
          value={formatMoneyCompact(metrics.openValueCents, currency)}
          sub={`${metrics.openCount} deals`}
        />
        <Kpi
          label="Weighted forecast"
          value={formatMoneyCompact(metrics.weightedValueCents, currency)}
          sub="probability-adjusted"
          tone="forecast"
        />
        <Kpi
          label="Closed won"
          value={formatMoneyCompact(metrics.wonValueCents, currency)}
          sub={`${metrics.wonCount} deals`}
          tone="won"
        />
        <Kpi
          label="Win rate"
          value={`${Math.round(metrics.winRate * 100)}%`}
          sub={`${metrics.wonCount}W / ${metrics.lostCount}L`}
        />
        <Kpi
          label="Avg open deal"
          value={formatMoneyCompact(metrics.avgOpenDealCents, currency)}
          sub="across open stages"
        />
      </div>

      <FilterBar
        filters={filters}
        onChange={onFiltersChange}
        owners={owners}
        counts={filterCounts}
        visibleCount={visibleCount}
        totalCount={totalCount}
      />
    </header>
  );
}
