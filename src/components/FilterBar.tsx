"use client";

import FilterMenu, { type FilterOption } from "./FilterMenu";
import {
  DEAL_PRIORITIES,
  DEAL_SOURCES,
  priorityMeta,
  sourceLabel,
  type DealPriority,
} from "@/lib/types";

export interface Filters {
  query: string;
  owners: string[];
  sources: string[];
  priorities: string[];
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  owners: [],
  sources: [],
  priorities: [],
};

export function filtersActive(filters: Filters): boolean {
  return Boolean(
    filters.query ||
      filters.owners.length ||
      filters.sources.length ||
      filters.priorities.length,
  );
}

const PRIORITY_DOT: Record<DealPriority, string> = {
  low: "bg-white/50",
  medium: "bg-white/60",
  high: "bg-red/60",
  critical: "bg-red",
};

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export default function FilterBar({
  filters,
  onChange,
  owners,
  /** Deal counts keyed by owner / source / priority, shown next to each option. */
  counts,
  visibleCount,
  totalCount,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  owners: string[];
  counts: {
    owner: Record<string, number>;
    source: Record<string, number>;
    priority: Record<string, number>;
  };
  visibleCount: number;
  totalCount: number;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const ownerOptions: FilterOption[] = owners.map((owner) => ({
    value: owner,
    label: owner,
    count: counts.owner[owner] ?? 0,
  }));

  const sourceOptions: FilterOption[] = DEAL_SOURCES.map((source) => ({
    value: source.value,
    label: source.label,
    count: counts.source[source.value] ?? 0,
  }));

  const priorityOptions: FilterOption[] = DEAL_PRIORITIES.map((priority) => ({
    value: priority.value,
    label: priority.label,
    dot: PRIORITY_DOT[priority.value],
    count: counts.priority[priority.value] ?? 0,
  }));

  const chips: Chip[] = [
    ...filters.owners.map((owner) => ({
      key: `owner:${owner}`,
      label: owner,
      onRemove: () =>
        set("owners", filters.owners.filter((o) => o !== owner)),
    })),
    ...filters.sources.map((source) => ({
      key: `source:${source}`,
      label: sourceLabel(source as never),
      onRemove: () =>
        set("sources", filters.sources.filter((s) => s !== source)),
    })),
    ...filters.priorities.map((priority) => ({
      key: `priority:${priority}`,
      label: priorityMeta(priority as DealPriority).label,
      onRemove: () =>
        set("priorities", filters.priorities.filter((p) => p !== priority)),
    })),
  ];

  const active = filtersActive(filters);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[210px] flex-1 sm:max-w-sm">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8.5 3a5.5 5.5 0 1 0 3.38 9.84l3.14 3.14 1.42-1.42-3.14-3.14A5.5 5.5 0 0 0 8.5 3m0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7" />
          </svg>
          <input
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Search deals, companies, contacts…"
            aria-label="Search deals"
            className="h-9 w-full rounded-lg border border-line bg-black/45 pl-9 pr-8 text-xs text-white placeholder:text-white/30 transition focus:border-red focus:outline-none focus:ring-2 focus:ring-red/25"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => set("query", "")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
                <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7z" />
              </svg>
            </button>
          ) : null}
        </div>

        <FilterMenu
          label="Owner"
          options={ownerOptions}
          selected={filters.owners}
          onChange={(next) => set("owners", next)}
          emptyLabel="No owners yet"
        />
        <FilterMenu
          label="Source"
          options={sourceOptions}
          selected={filters.sources}
          onChange={(next) => set("sources", next)}
        />
        <FilterMenu
          label="Priority"
          options={priorityOptions}
          selected={filters.priorities}
          onChange={(next) => set("priorities", next)}
        />

        <p className="ml-auto text-[11px] text-white/40" aria-live="polite">
          {active ? (
            <>
              <span className="font-medium text-white/75">{visibleCount}</span> of{" "}
              {totalCount} deals
            </>
          ) : (
            <>{totalCount} deals</>
          )}
        </p>
      </div>

      {chips.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1 rounded-md border border-red/40 bg-red/12 py-0.5 pl-2 pr-1 text-[11px] font-medium text-red-bright"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="rounded p-0.5 text-red-bright/70 transition hover:bg-red/25 hover:text-white"
              >
                <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="currentColor">
                  <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7z" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
