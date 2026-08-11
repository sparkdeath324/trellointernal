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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
          Pipeline CRM
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
          Your boards
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
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
            className="group rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5 transition hover:border-indigo-400/60 hover:bg-slate-900/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-100 group-hover:text-white">
                  {board.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                  {board.description || "No description"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                {stageCount} stages
              </span>
            </div>

            {metrics ? (
              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    Open
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                    {formatMoneyCompact(metrics.openValueCents, board.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    Forecast
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-indigo-300">
                    {formatMoneyCompact(
                      metrics.weightedValueCents,
                      board.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                    Won
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-emerald-300">
                    {formatMoneyCompact(metrics.wonValueCents, board.currency)}
                  </dd>
                </div>
              </dl>
            ) : null}
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">New board</h2>
        <p className="mt-1 text-xs text-slate-500">
          Starts with a standard six-stage pipeline you can rename or extend.
        </p>
        <form action={createBoardAction} className="mt-4 flex flex-wrap gap-3">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Board name"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
          />
          <input
            name="description"
            maxLength={300}
            placeholder="Description (optional)"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
          />
          <input
            name="currency"
            defaultValue="USD"
            maxLength={3}
            aria-label="Currency code"
            className="w-24 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm uppercase text-slate-100 focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            Create board
          </button>
        </form>
      </section>
    </main>
  );
}
