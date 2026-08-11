import Link from "next/link";

import { createBoardAction } from "./actions";
import { getBoardSnapshot, listBoards } from "@/lib/queries";
import { pipelineMetrics } from "@/lib/metrics";
import { formatMoneyCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  const boards = listBoards();
  const summaries = boards.map((board) => {
    const snapshot = getBoardSnapshot(board.id);
    const metrics = snapshot
      ? pipelineMetrics(snapshot.stages, snapshot.deals)
      : null;
    return { board, metrics, stageCount: snapshot?.stages.length ?? 0 };
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-bright/80">
          Pipeline CRM
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Your boards
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Every board is a pipeline. Drag deals between stages, and each card
          carries the CRM fields that matter — deal size, source, owner and
          expected close.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {summaries.map(({ board, metrics, stageCount }) => (
          <Link
            key={board.id}
            href={`/boards/${board.id}`}
            className="group rounded-2xl border border-line bg-card/70 p-5 transition hover:border-red/60 hover:bg-raise"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-white group-hover:text-white">
                  {board.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-white/55">
                  {board.description || "No description"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/55">
                {stageCount} stages
              </span>
            </div>

            {metrics ? (
              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-white/40">
                    Open
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-white">
                    {formatMoneyCompact(metrics.openValueCents, board.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-white/40">
                    Forecast
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-red-bright">
                    {formatMoneyCompact(
                      metrics.weightedValueCents,
                      board.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-white/40">
                    Won
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-white">
                    {formatMoneyCompact(metrics.wonValueCents, board.currency)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-panel/70 p-5">
        <h2 className="text-sm font-semibold text-white/85">New board</h2>
        <p className="mt-1 text-xs text-white/40">
          Starts with a standard six-stage pipeline you can rename or extend.
        </p>
        <form action={createBoardAction} className="mt-4 flex flex-wrap gap-3">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Board name"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-black/45 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-red focus:outline-none"
          />
          <input
            name="description"
            maxLength={300}
            placeholder="Description (optional)"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-black/45 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-red focus:outline-none"
          />
          <input
            name="currency"
            defaultValue="USD"
            maxLength={3}
            aria-label="Currency code"
            className="w-24 rounded-lg border border-line bg-black/45 px-3 py-2 text-sm uppercase text-white focus:border-red focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-red px-4 py-2 text-sm font-medium text-white transition hover:bg-red-bright"
          >
            Create board
          </button>
        </form>
      </section>
    </main>
  );
}
