import type { Deal, Stage } from "./types";

/** Pipeline roll-ups. Pure functions — shared by server pages and client views. */

export interface StageMetrics {
  count: number;
  totalCents: number;
  weightedCents: number;
}

export function stageMetrics(deals: Deal[]): StageMetrics {
  let totalCents = 0;
  let weightedCents = 0;
  for (const deal of deals) {
    totalCents += deal.valueCents;
    weightedCents += Math.round((deal.valueCents * deal.probability) / 100);
  }
  return { count: deals.length, totalCents, weightedCents };
}

export interface PipelineMetrics {
  /** Deals sitting in stages whose outcome is still `open`. */
  openCount: number;
  openValueCents: number;
  /** Open value multiplied by each deal's probability — the forecast. */
  weightedValueCents: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  lostValueCents: number;
  /** won / (won + lost), 0 when nothing has closed yet. */
  winRate: number;
  avgOpenDealCents: number;
}

export function pipelineMetrics(stages: Stage[], deals: Deal[]): PipelineMetrics {
  const outcomeByStage = new Map(stages.map((s) => [s.id, s.outcome]));

  let openCount = 0;
  let openValueCents = 0;
  let weightedValueCents = 0;
  let wonCount = 0;
  let wonValueCents = 0;
  let lostCount = 0;
  let lostValueCents = 0;

  for (const deal of deals) {
    const outcome = outcomeByStage.get(deal.stageId) ?? "open";
    if (outcome === "won") {
      wonCount += 1;
      wonValueCents += deal.valueCents;
    } else if (outcome === "lost") {
      lostCount += 1;
      lostValueCents += deal.valueCents;
    } else {
      openCount += 1;
      openValueCents += deal.valueCents;
      weightedValueCents += Math.round((deal.valueCents * deal.probability) / 100);
    }
  }

  const closed = wonCount + lostCount;

  return {
    openCount,
    openValueCents,
    weightedValueCents,
    wonCount,
    wonValueCents,
    lostCount,
    lostValueCents,
    winRate: closed === 0 ? 0 : wonCount / closed,
    avgOpenDealCents: openCount === 0 ? 0 : Math.round(openValueCents / openCount),
  };
}

/** Deal counts grouped by source — feeds the "where deals come from" breakdown. */
export function valueBySource(deals: Deal[]): { source: string; count: number; cents: number }[] {
  const buckets = new Map<string, { count: number; cents: number }>();
  for (const deal of deals) {
    const bucket = buckets.get(deal.source) ?? { count: 0, cents: 0 };
    bucket.count += 1;
    bucket.cents += deal.valueCents;
    buckets.set(deal.source, bucket);
  }
  return [...buckets.entries()]
    .map(([source, b]) => ({ source, ...b }))
    .sort((a, b) => b.cents - a.cents);
}
