"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, filterControlClass, selectChrome } from "./ui";
import { formatMoneyCompact } from "@/lib/format";
import type { PipelineMetrics } from "@/lib/metrics";
import { DEAL_PRIORITIES, DEAL_SOURCES } from "@/lib/types";

export interface Filters {
  query: string;
  owner: string;
  source: string;
  priority: string;
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  owner: "",
  source: "",
  priority: "",
};

export function filtersActive(filters: Filters): boolean {
  return Boolean(filters.query || filters.owner || filters.source || filters.priority);
}

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
    default: "text-slate-100",
    forecast: "text-indigo-300",
    won: "text-emerald-300",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-lg font-semibold tracking-tight ${tones[tone]}`}>
        {value}
      </p>
      {sub ? <p className="text-[11px] text-slate-500">{sub}</p> : null}
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
  onAddStage: () => void;
  onAddDeal: () => void;
}) {
  const router = useRouter();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const filterSelect = `${filterControlClass} ${selectChrome}`;

  return (
    <header className="shrink-0 border-b border-slate-800/80 bg-slate-950/40 px-5 py-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-slate-500 transition hover:text-slate-300"
            >
              Boards
            </Link>
            <span className="text-slate-700">/</span>
            {boards.length > 1 ? (
              <select
                value={boardId}
                onChange={(e) => router.push(`/boards/${e.target.value}`)}
                aria-label="Switch board"
                className="appearance-none rounded-md border border-transparent bg-transparent py-0.5 pl-1.5 pr-7 text-lg font-semibold text-slate-50 transition hover:border-slate-700 focus:border-indigo-400 focus:outline-none"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id} className="bg-slate-900">
                    {board.name}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="truncate text-lg font-semibold text-slate-50">{boardName}</h1>
            )}
          </div>
          {boardDescription ? (
            <p className="mt-1 max-w-xl truncate text-xs text-slate-500">
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600"
            fill="currentColor"
          >
            <path d="M8.5 3a5.5 5.5 0 1 0 3.38 9.84l3.14 3.14 1.42-1.42-3.14-3.14A5.5 5.5 0 0 0 8.5 3m0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7" />
          </svg>
          <input
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Search deals, companies, contacts…"
            aria-label="Search deals"
            className={`${filterControlClass} w-full pl-9`}
          />
        </div>

        <select
          value={filters.owner}
          onChange={(e) => set("owner", e.target.value)}
          aria-label="Filter by owner"
          className={`${filterSelect} min-w-[130px]`}
        >
          <option value="">All owners</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>

        <select
          value={filters.source}
          onChange={(e) => set("source", e.target.value)}
          aria-label="Filter by source"
          className={`${filterSelect} min-w-[130px]`}
        >
          <option value="">All sources</option>
          {DEAL_SOURCES.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => set("priority", e.target.value)}
          aria-label="Filter by priority"
          className={`${filterSelect} min-w-[120px]`}
        >
          <option value="">All priorities</option>
          {DEAL_PRIORITIES.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>

        {filtersActive(filters) ? (
          <button
            type="button"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="h-9 rounded-lg px-3 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </header>
  );
}
