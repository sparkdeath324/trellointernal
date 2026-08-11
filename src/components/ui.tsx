"use client";

import { useEffect, useRef } from "react";

/** Shared form/dialog primitives so every surface looks the same. */

export const inputClass =
  "w-full rounded-lg border border-line bg-black/45 px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-red focus:outline-none focus:ring-2 focus:ring-red/25";

/** Spacing that keeps `<select>` text clear of the chevron drawn in globals.css. */
export const selectChrome = "appearance-none pr-9";

export const selectClass = `${inputClass} ${selectChrome}`;

export const labelClass =
  "block text-[11px] font-medium uppercase tracking-wide text-white/55";

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
      {hint ? <span className="mt-1 block text-[11px] text-white/40">{hint}</span> : null}
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
    primary: "bg-red text-white hover:bg-red-bright disabled:bg-red/50",
    subtle:
      "border border-line bg-white/8 text-white/85 hover:border-line-strong hover:bg-white/10",
    ghost: "text-white/55 hover:bg-white/8 hover:text-white",
    danger:
      "border border-red/50 bg-red/12 text-red-bright hover:bg-red/20",
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
      className="animate-overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-panel-in w-full ${width} rounded-2xl border border-line bg-panel shadow-2xl shadow-black/80`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-white/40">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7z" />
            </svg>
          </button>
        </header>

        <div className="px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
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
    <p className="rounded-lg border border-red/40 bg-red/12 px-3 py-2 text-xs text-red-bright">
      {children}
    </p>
  );
}
