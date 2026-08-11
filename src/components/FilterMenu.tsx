"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface FilterOption {
  value: string;
  label: string;
  /** Optional colour swatch, e.g. the priority dot. */
  dot?: string;
  /** Optional right-aligned count. */
  count?: number;
}

/**
 * A compact multi-select dropdown for the filter bar.
 *
 * Native `<select multiple>` is unusable at this size, and a single-select
 * dropdown can't express "High *and* Critical" — which is most of what you want
 * from a pipeline filter.
 */
export default function FilterMenu({
  label,
  options,
  selected,
  onChange,
  emptyLabel = "None available",
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const active = selected.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
          active
            ? "border-red/60 bg-red/12 text-red-bright"
            : "border-line bg-black/45 text-white/75 hover:border-line-strong hover:text-white"
        }`}
      >
        {label}
        {active ? (
          <span className="rounded bg-red/20 px-1.5 text-[10px] font-semibold text-red-bright">
            {selected.length}
          </span>
        ) : null}
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""} ${
            active ? "text-red-bright" : "text-white/40"
          }`}
          fill="currentColor"
          aria-hidden
        >
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          className="animate-panel-in absolute left-0 top-full z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-xl shadow-black/80"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-white/40">{emptyLabel}</p>
          ) : (
            options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-white/75 transition hover:bg-white/10"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked
                        ? "border-red bg-red"
                        : "border-line-strong bg-transparent"
                    }`}
                    aria-hidden
                  >
                    {checked ? (
                      <svg viewBox="0 0 20 20" className="h-3 w-3 text-white" fill="currentColor">
                        <path d="m8.2 13.7-3.4-3.4 1.4-1.4 2 2 5-5 1.4 1.4z" />
                      </svg>
                    ) : null}
                  </span>

                  {option.dot ? (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${option.dot}`} aria-hidden />
                  ) : null}

                  <span className="min-w-0 flex-1 truncate">{option.label}</span>

                  {option.count !== undefined ? (
                    <span className="shrink-0 text-[10px] text-white/40">{option.count}</span>
                  ) : null}
                </button>
              );
            })
          )}

          {active ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-line px-2.5 pb-1 pt-2 text-left text-[11px] text-white/40 transition hover:text-white/80"
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
