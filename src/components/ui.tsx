"use client";

import { useEffect, useRef } from "react";

/** Shared form/dialog primitives so every surface looks the same. */

export const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

/** Spacing that keeps `<select>` text clear of the chevron drawn in globals.css. */
export const selectChrome = "appearance-none pr-9";

export const selectClass = `${inputClass} ${selectChrome}`;

/** Compact, auto-width control for the filter bar. */
export const filterControlClass =
  "h-9 rounded-lg border border-slate-700 bg-slate-950/60 px-3 text-xs text-slate-100 placeholder:text-slate-600 transition focus:border-indigo-400 focus:outline-none";

export const labelClass =
  "block text-[11px] font-medium uppercase tracking-wide text-slate-400";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
}) {
  const variants: Record<string, string> = {
    primary: "bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-indigo-500/50",
    subtle:
      "border border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-600 hover:bg-slate-800",
    ghost: "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
    danger:
      "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    />
  );
}

/**
 * Centred modal. Closes on Escape and on backdrop click, restores focus to the
 * element that opened it, and traps nothing else — the board behind it is inert
 * while the overlay is up.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button",
    )?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-panel-in w-full ${width} rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl shadow-slate-950/60`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-100">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7z" />
            </svg>
          </button>
        </header>

        <div className="px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
      {children}
    </p>
  );
}
