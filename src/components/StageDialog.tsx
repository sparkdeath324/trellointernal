"use client";

import { useState, useTransition } from "react";

import {
  createStageAction,
  deleteStageAction,
  updateStageAction,
} from "@/app/actions";
import { Button, ErrorText, Field, inputClass, selectClass } from "./ui";
import {
  STAGE_COLORS,
  STAGE_OUTCOMES,
  type Stage,
  type StageColor,
  type StageOutcome,
} from "@/lib/types";

export default function StageDialog({
  boardId,
  stage,
  allStages,
  dealCount,
  onClose,
}: {
  boardId: string;
  /** Existing stage to edit, or null when adding a new one. */
  stage: Stage | null;
  allStages: Stage[];
  dealCount: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [probability, setProbability] = useState(stage?.defaultProbability ?? 20);
  const [outcome, setOutcome] = useState<StageOutcome>(stage?.outcome ?? "open");
  const [color, setColor] = useState<StageColor>(stage?.color ?? "ash");
  const [wipLimit, setWipLimit] = useState(
    stage?.wipLimit !== null && stage?.wipLimit !== undefined ? String(stage.wipLimit) : "",
  );
  const [moveTo, setMoveTo] = useState(
    allStages.find((s) => s.id !== stage?.id)?.id ?? "",
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const parsedWip = wipLimit.trim() === "" ? null : Number.parseInt(wipLimit, 10);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    const fields = {
      name: name.trim(),
      defaultProbability: probability,
      outcome,
      color,
      wipLimit: parsedWip !== null && Number.isFinite(parsedWip) ? parsedWip : null,
    };

    startTransition(async () => {
      const result = stage
        ? await updateStageAction({ boardId, stageId: stage.id, fields })
        : await createStageAction({ boardId, fields });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  const onDelete = () => {
    if (!stage) return;
    const message =
      dealCount > 0
        ? `Delete "${stage.name}" and move its ${dealCount} deal(s)?`
        : `Delete "${stage.name}"?`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await deleteStageAction({
        boardId,
        stageId: stage.id,
        moveDealsTo: dealCount > 0 && moveTo ? moveTo : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stage name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Proposal"
            maxLength={60}
            required
          />
        </Field>

        <Field
          label="Outcome"
          hint="Won and lost stages are excluded from open pipeline totals."
        >
          <select
            className={selectClass}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as StageOutcome)}
          >
            {STAGE_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={`Default probability — ${probability}%`}
          hint="Applied to deals dragged into this stage."
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
            className="mt-2 w-full accent-red"
          />
        </Field>

        <Field label="WIP limit" hint="Leave blank for no limit.">
          <input
            className={inputClass}
            value={wipLimit}
            onChange={(e) => setWipLimit(e.target.value.replace(/\D/g, ""))}
            placeholder="No limit"
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {STAGE_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setColor(option.value)}
              aria-label={option.label}
              aria-pressed={color === option.value}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                color === option.value
                  ? "border-red bg-white/10"
                  : "border-line hover:border-line-strong"
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${option.dot}`} />
            </button>
          ))}
        </div>
      </Field>

      {stage && dealCount > 0 && allStages.length > 1 ? (
        <Field label="On delete, move deals to">
          <select
            className={selectClass}
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            {allStages
              .filter((s) => s.id !== stage.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {stage && allStages.length > 1 ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            disabled={pending}
            className="mr-auto"
          >
            Delete stage
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : stage ? "Save stage" : "Add stage"}
        </Button>
      </div>
    </form>
  );
}
