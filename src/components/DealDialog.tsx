"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  addNoteAction,
  deleteDealAction,
  createDealAction,
  listActivitiesAction,
  moveDealAction,
  updateDealAction,
  type DealFields,
} from "@/app/actions";
import { Button, ErrorText, Field, inputClass, selectClass } from "./ui";
import {
  centsToInputValue,
  formatMoney,
  formatTimestamp,
  parseMoneyToCents,
} from "@/lib/format";
import {
  DEAL_PRIORITIES,
  DEAL_SOURCES,
  type Activity,
  type Deal,
  type DealPriority,
  type DealSource,
  type Stage,
} from "@/lib/types";

interface FormState {
  title: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  value: string;
  source: DealSource;
  priority: DealPriority;
  probability: number;
  expectedCloseDate: string;
  owner: string;
  tags: string;
  notes: string;
  stageId: string;
}

function emptyForm(stageId: string, probability: number): FormState {
  return {
    title: "",
    company: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    value: "",
    source: "inbound",
    priority: "medium",
    probability,
    expectedCloseDate: "",
    owner: "",
    tags: "",
    notes: "",
    stageId,
  };
}

function formFromDeal(deal: Deal): FormState {
  return {
    title: deal.title,
    company: deal.company,
    contactName: deal.contactName,
    contactEmail: deal.contactEmail,
    contactPhone: deal.contactPhone,
    value: centsToInputValue(deal.valueCents),
    source: deal.source,
    priority: deal.priority,
    probability: deal.probability,
    expectedCloseDate: deal.expectedCloseDate ?? "",
    owner: deal.owner,
    tags: deal.tags.join(", "),
    notes: deal.notes,
    stageId: deal.stageId,
  };
}

export default function DealDialog({
  boardId,
  currency,
  stages,
  deal,
  createInStageId,
  onClose,
}: {
  boardId: string;
  currency: string;
  stages: Stage[];
  /** Existing deal to edit, or null when creating. */
  deal: Deal | null;
  /** Stage the new deal should land in — ignored when editing. */
  createInStageId: string | null;
  onClose: () => void;
}) {
  const isEdit = deal !== null;
  const defaultStage = stages.find((s) => s.id === createInStageId) ?? stages[0];

  const [form, setForm] = useState<FormState>(() =>
    deal
      ? formFromDeal(deal)
      : emptyForm(defaultStage?.id ?? "", defaultStage?.defaultProbability ?? 10),
  );
  const [error, setError] = useState<string>();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!deal) return;
    let active = true;
    listActivitiesAction(deal.id).then((rows) => {
      if (active) setActivities(rows);
    });
    return () => {
      active = false;
    };
  }, [deal]);

  const valueCents = useMemo(() => parseMoneyToCents(form.value), [form.value]);
  const weightedCents = Math.round((valueCents * form.probability) / 100);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Moving stages re-seeds probability, matching what a drag onto that column does. */
  const onStageChange = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    setForm((prev) => ({
      ...prev,
      stageId,
      probability: stage ? stage.defaultProbability : prev.probability,
    }));
  };

  const buildFields = (): DealFields => ({
    title: form.title.trim(),
    company: form.company.trim(),
    contactName: form.contactName.trim(),
    contactEmail: form.contactEmail.trim(),
    contactPhone: form.contactPhone.trim(),
    valueCents,
    currency,
    source: form.source,
    priority: form.priority,
    probability: form.probability,
    expectedCloseDate: form.expectedCloseDate || null,
    owner: form.owner.trim(),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12),
    notes: form.notes,
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const fields = buildFields();

    startTransition(async () => {
      if (isEdit && deal) {
        // Move first so the stage's default probability does not overwrite the
        // probability the user just set in this form.
        if (form.stageId !== deal.stageId) {
          const moved = await moveDealAction({
            boardId,
            dealId: deal.id,
            toStageId: form.stageId,
            toIndex: 0,
          });
          if (!moved.ok) {
            setError(moved.error);
            return;
          }
        }
        const result = await updateDealAction({ boardId, dealId: deal.id, fields });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createDealAction({
          boardId,
          stageId: form.stageId,
          fields,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onClose();
    });
  };

  const onDelete = () => {
    if (!deal) return;
    if (!window.confirm(`Delete "${deal.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteDealAction({ boardId, dealId: deal.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  const onAddNote = () => {
    if (!deal || !note.trim()) return;
    startTransition(async () => {
      const result = await addNoteAction({
        boardId,
        dealId: deal.id,
        message: note.trim(),
        actor: form.owner.trim() || "You",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      setActivities(await listActivitiesAction(deal.id));
    });
  };

  const tagChips = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <ErrorText>{error}</ErrorText>

      {/* --- Deal --- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal name" className="sm:col-span-2">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Enterprise pilot — 250 seats"
            maxLength={160}
            required
          />
        </Field>

        <Field label="Company">
          <input
            className={inputClass}
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="Acme Corp"
            maxLength={120}
          />
        </Field>

        <Field label="Stage">
          <select
            className={selectClass}
            value={form.stageId}
            onChange={(e) => onStageChange(e.target.value)}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* --- Commercials --- */}
      <fieldset className="rounded-xl border border-line bg-black/30 p-4">
        <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55">
          Deal size &amp; forecast
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Deal size (${currency})`} hint="Accepts 148000, 148k or 1.2m">
            <input
              className={`${inputClass} font-mono`}
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </Field>

          <Field label="Source">
            <select
              className={selectClass}
              value={form.source}
              onChange={(e) => set("source", e.target.value as DealSource)}
            >
              {DEAL_SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              className={selectClass}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value as DealPriority)}
            >
              {DEAL_PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Win probability — ${form.probability}%`} className="sm:col-span-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.probability}
              onChange={(e) => set("probability", Number(e.target.value))}
              className="mt-2 w-full accent-red"
            />
          </Field>

          <Field label="Expected close">
            <input
              type="date"
              className={inputClass}
              value={form.expectedCloseDate}
              onChange={(e) => set("expectedCloseDate", e.target.value)}
            />
          </Field>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-xs text-white/55">
          Weighted value{" "}
          <span className="font-mono font-semibold text-red-bright">
            {formatMoney(weightedCents, currency)}
          </span>{" "}
          <span className="text-white/30">
            ({formatMoney(valueCents, currency)} × {form.probability}%)
          </span>
        </p>
      </fieldset>

      {/* --- Contact --- */}
      <fieldset className="rounded-xl border border-line bg-black/30 p-4">
        <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/55">
          Primary contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Jordan Lee"
              maxLength={120}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="jordan@acme.com"
              maxLength={160}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="+1 415 555 0100"
              maxLength={60}
            />
          </Field>
        </div>
      </fieldset>

      {/* --- Ownership & context --- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal owner">
          <input
            className={inputClass}
            value={form.owner}
            onChange={(e) => set("owner", e.target.value)}
            placeholder="Alex Chen"
            maxLength={120}
            list="crm-owner-suggestions"
          />
        </Field>

        <Field label="Tags" hint="Comma separated">
          <input
            className={inputClass}
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="enterprise, emea"
          />
        </Field>
      </div>

      {tagChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tagChips.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-medium text-white/60"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <Field label="Notes">
        <textarea
          className={`${inputClass} min-h-[90px] resize-y`}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="What happened on the last call? What's the next step?"
          maxLength={4000}
        />
      </Field>

      {/* --- Activity --- */}
      {isEdit ? (
        <section className="rounded-xl border border-line bg-black/30 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            Activity
          </h3>

          <div className="mt-3 flex gap-2">
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddNote();
                }
              }}
              placeholder="Log a call, email or next step…"
              maxLength={2000}
            />
            <Button
              type="button"
              variant="subtle"
              onClick={onAddNote}
              disabled={pending || !note.trim()}
            >
              Log
            </Button>
          </div>

          <ol className="mt-4 max-h-56 space-y-3 overflow-y-auto pr-1">
            {activities.map((activity) => (
              <li key={activity.id} className="flex gap-3 text-xs">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    activity.kind === "note" ? "bg-red" : "bg-white/30"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-white/75">{activity.message}</p>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    {activity.actor} · {formatTimestamp(activity.createdAt)}
                  </p>
                </div>
              </li>
            ))}
            {activities.length === 0 ? (
              <li className="text-xs text-white/30">No activity yet.</li>
            ) : null}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {isEdit ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            disabled={pending}
            className="mr-auto"
          >
            Delete deal
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !form.title.trim()}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create deal"}
        </Button>
      </div>
    </form>
  );
}
