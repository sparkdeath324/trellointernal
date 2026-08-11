"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import DealDialog from "./DealDialog";
import StageColumn from "./StageColumn";
import StageDialog from "./StageDialog";
import PipelineHeader, {
  EMPTY_FILTERS,
  filtersActive,
  type Filters,
} from "./PipelineHeader";
import { DealCardFace } from "./DealCard";
import { Modal } from "./ui";
import { moveDealAction } from "@/app/actions";
import { pipelineMetrics } from "@/lib/metrics";
import type { BoardSnapshot, Deal, Stage } from "@/lib/types";

type Columns = Record<string, Deal[]>;

function groupByStage(stages: Stage[], deals: Deal[]): Columns {
  const columns: Columns = {};
  for (const stage of stages) columns[stage.id] = [];
  for (const deal of deals) {
    (columns[deal.stageId] ??= []).push(deal);
  }
  return columns;
}

function stageOf(columns: Columns, dealId: string): string | null {
  for (const [stageId, deals] of Object.entries(columns)) {
    if (deals.some((deal) => deal.id === dealId)) return stageId;
  }
  return null;
}

interface Relocation {
  columns: Columns;
  toStageId: string;
  toIndex: number;
}

/**
 * Pure move: drops `activeId` onto `overId` (another deal, or a stage when the
 * pointer is over empty column space) and returns the new column map plus the
 * destination index the server needs.
 */
function relocate(
  columns: Columns,
  activeId: string,
  overId: string,
  stageById: Map<string, Stage>,
): Relocation | null {
  const from = stageOf(columns, activeId);
  if (!from) return null;
  const overIsStage = overId in columns;
  const to = overIsStage ? overId : stageOf(columns, overId);
  if (!to) return null;

  if (from === to) {
    const list = columns[from];
    const oldIndex = list.findIndex((deal) => deal.id === activeId);
    const newIndex = overIsStage
      ? list.length - 1
      : list.findIndex((deal) => deal.id === overId);
    if (oldIndex === -1 || newIndex === -1) return null;
    if (oldIndex === newIndex) {
      return { columns, toStageId: to, toIndex: oldIndex };
    }
    return {
      columns: { ...columns, [from]: arrayMove(list, oldIndex, newIndex) },
      toStageId: to,
      toIndex: newIndex,
    };
  }

  const source = [...columns[from]];
  const activeIndex = source.findIndex((deal) => deal.id === activeId);
  if (activeIndex === -1) return null;
  const [moved] = source.splice(activeIndex, 1);

  const target = [...columns[to]];
  const overIndex = overIsStage ? -1 : target.findIndex((deal) => deal.id === overId);
  const insertAt = overIndex === -1 ? target.length : overIndex;

  // Mirror the server: landing in a new stage re-seeds the win probability.
  const nextProbability = stageById.get(to)?.defaultProbability ?? moved.probability;
  target.splice(insertAt, 0, {
    ...moved,
    stageId: to,
    probability: nextProbability,
  });

  return {
    columns: { ...columns, [from]: source, [to]: target },
    toStageId: to,
    toIndex: insertAt,
  };
}

function matchesFilters(deal: Deal, filters: Filters): boolean {
  if (filters.owner && deal.owner !== filters.owner) return false;
  if (filters.source && deal.source !== filters.source) return false;
  if (filters.priority && deal.priority !== filters.priority) return false;
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = [
      deal.title,
      deal.company,
      deal.contactName,
      deal.contactEmail,
      deal.owner,
      deal.notes,
      ...deal.tags,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

type DealDialogState =
  | { mode: "create"; stageId: string }
  | { mode: "edit"; dealId: string }
  | null;

type StageDialogState = { mode: "create" } | { mode: "edit"; stageId: string } | null;

export default function BoardView({
  snapshot,
  boards,
  owners,
}: {
  snapshot: BoardSnapshot;
  boards: { id: string; name: string }[];
  owners: string[];
}) {
  const { board, stages } = snapshot;

  const [columns, setColumns] = useState<Columns>(() =>
    groupByStage(stages, snapshot.deals),
  );

  // Adopt server state after every revalidation. Adjusting during render (rather
  // than in an effect) avoids a frame of stale cards after a drag round-trips.
  const [syncedSnapshot, setSyncedSnapshot] = useState(snapshot);
  if (syncedSnapshot !== snapshot) {
    setSyncedSnapshot(snapshot);
    setColumns(groupByStage(snapshot.stages, snapshot.deals));
  }

  // Drag handlers read from the ref so several drag events inside one frame
  // never compute against stale state.
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const commitColumns = useCallback((next: Columns) => {
    columnsRef.current = next;
    setColumns(next);
  }, []);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [dealDialog, setDealDialog] = useState<DealDialogState>(null);
  const [stageDialog, setStageDialog] = useState<StageDialogState>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const allDeals = useMemo(() => Object.values(columns).flat(), [columns]);
  const metrics = useMemo(() => pipelineMetrics(stages, allDeals), [stages, allDeals]);
  const isFiltered = filtersActive(filters);

  const sensors = useSensors(
    // A small drag threshold keeps plain clicks (open the deal) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter is reserved for opening a card, so drags start and end on Space.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  // Where the card sat when the drag began. `onDragOver` mutates the columns
  // mid-drag, so this is the only reliable baseline for "did anything move?".
  const dragOriginRef = useRef<{ stageId: string; index: number } | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveDeal(allDeals.find((deal) => deal.id === id) ?? null);

    const current = columnsRef.current;
    const stageId = stageOf(current, id);
    dragOriginRef.current = stageId
      ? { stageId, index: current[stageId].findIndex((deal) => deal.id === id) }
      : null;
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const current = columnsRef.current;

    const from = stageOf(current, activeId);
    const to = overId in current ? overId : stageOf(current, overId);
    // Within-column reordering is settled on drop; here we only preview the
    // card crossing into another column.
    if (!from || !to || from === to) return;

    const result = relocate(current, activeId, overId, stageById);
    if (result) commitColumns(result.columns);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;

    const result = relocate(columnsRef.current, activeId, overId, stageById);
    if (!result) return;

    commitColumns(result.columns);

    // Landed exactly where it started — skip the round trip.
    if (
      origin &&
      origin.stageId === result.toStageId &&
      origin.index === result.toIndex
    ) {
      return;
    }

    void moveDealAction({
      boardId: board.id,
      dealId: activeId,
      toStageId: result.toStageId,
      toIndex: result.toIndex,
    });
  };

  const onDragCancel = () => {
    setActiveDeal(null);
    // Drop the in-flight preview and fall back to the last server state.
    commitColumns(groupByStage(snapshot.stages, snapshot.deals));
  };

  const editingDeal =
    dealDialog?.mode === "edit"
      ? (allDeals.find((deal) => deal.id === dealDialog.dealId) ?? null)
      : null;

  const editingStage =
    stageDialog?.mode === "edit"
      ? (stageById.get(stageDialog.stageId) ?? null)
      : null;

  const ownerOptions = useMemo(() => {
    const merged = new Set([...owners, ...allDeals.map((d) => d.owner)]);
    merged.delete("");
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [owners, allDeals]);

  return (
    <div className="flex h-screen flex-col">
      <PipelineHeader
        boardId={board.id}
        boardName={board.name}
        boardDescription={board.description}
        currency={board.currency}
        boards={boards}
        owners={ownerOptions}
        metrics={metrics}
        filters={filters}
        onFiltersChange={setFilters}
        onAddStage={() => setStageDialog({ mode: "create" })}
        onAddDeal={() => {
          const first = stages[0];
          if (first) setDealDialog({ mode: "create", stageId: first.id });
        }}
      />

      <DndContext
        // Explicit id: dnd-kit otherwise derives its aria-describedby ids from a
        // module-level counter, which differs between SSR and hydration.
        id="pipeline-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <main className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 py-4">
          {stages.map((stage) => {
            const stageDeals = columns[stage.id] ?? [];
            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={stageDeals}
                visibleDeals={
                  isFiltered
                    ? stageDeals.filter((deal) => matchesFilters(deal, filters))
                    : stageDeals
                }
                currency={board.currency}
                filtered={isFiltered}
                onOpenDeal={(dealId) => setDealDialog({ mode: "edit", dealId })}
                onAddDeal={(stageId) => setDealDialog({ mode: "create", stageId })}
                onEditStage={(stageId) => setStageDialog({ mode: "edit", stageId })}
              />
            );
          })}

          <button
            type="button"
            onClick={() => setStageDialog({ mode: "create" })}
            className="h-11 w-[220px] shrink-0 rounded-2xl border border-dashed border-slate-800 text-sm font-medium text-slate-600 transition hover:border-slate-600 hover:text-slate-300"
          >
            + Add stage
          </button>
        </main>

        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <div className="w-[286px] rotate-1">
              <DealCardFace deal={activeDeal} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Owner autocomplete shared by the deal form. */}
      <datalist id="crm-owner-suggestions">
        {ownerOptions.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>

      <Modal
        open={dealDialog !== null}
        onClose={() => setDealDialog(null)}
        title={editingDeal ? editingDeal.title : "New deal"}
        subtitle={
          editingDeal
            ? `${editingDeal.company || "No company"} · ${
                stageById.get(editingDeal.stageId)?.name ?? ""
              }`
            : "Add a deal to the pipeline"
        }
        width="max-w-3xl"
      >
        {dealDialog ? (
          <DealDialog
            // Remount per deal so the form never shows another card's values.
            key={dealDialog.mode === "edit" ? dealDialog.dealId : `new-${dealDialog.stageId}`}
            boardId={board.id}
            currency={board.currency}
            stages={stages}
            deal={editingDeal}
            createInStageId={dealDialog.mode === "create" ? dealDialog.stageId : null}
            onClose={() => setDealDialog(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={stageDialog !== null}
        onClose={() => setStageDialog(null)}
        title={editingStage ? `Edit ${editingStage.name}` : "New stage"}
        subtitle="Stages define the pipeline and the default win probability"
      >
        {stageDialog ? (
          <StageDialog
            key={stageDialog.mode === "edit" ? stageDialog.stageId : "new-stage"}
            boardId={board.id}
            stage={editingStage}
            allStages={stages}
            dealCount={editingStage ? (columns[editingStage.id]?.length ?? 0) : 0}
            onClose={() => setStageDialog(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
