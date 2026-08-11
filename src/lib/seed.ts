import { newId, nowIso, one, writeTransaction } from "./db";
import type { DealPriority, DealSource, StageColor, StageOutcome } from "./types";

/**
 * First-run seed: a realistic sales pipeline so the board is never empty on a
 * fresh checkout. Runs only when there are zero boards.
 */

interface StageSeed {
  name: string;
  probability: number;
  outcome: StageOutcome;
  color: StageColor;
  wipLimit: number | null;
}

const STAGE_SEEDS: StageSeed[] = [
  { name: "Lead In", probability: 10, outcome: "open", color: "ash", wipLimit: null },
  { name: "Qualified", probability: 25, outcome: "open", color: "silver", wipLimit: 8 },
  { name: "Discovery", probability: 40, outcome: "open", color: "silver", wipLimit: 6 },
  { name: "Proposal", probability: 60, outcome: "open", color: "crimson", wipLimit: null },
  { name: "Negotiation", probability: 80, outcome: "open", color: "red", wipLimit: null },
  { name: "Closed Won", probability: 100, outcome: "won", color: "white", wipLimit: null },
  { name: "Closed Lost", probability: 0, outcome: "lost", color: "crimson", wipLimit: null },
];

interface DealSeed {
  stage: string;
  title: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  value: number; // whole currency units
  source: DealSource;
  priority: DealPriority;
  owner: string;
  closeInDays: number;
  tags: string[];
  notes: string;
}

const DEAL_SEEDS: DealSeed[] = [
  {
    stage: "Lead In",
    title: "Platform trial — 40 seats",
    company: "Northwind Logistics",
    contactName: "Priya Raman",
    contactEmail: "priya.raman@northwind.example",
    contactPhone: "+1 415 555 0148",
    value: 24000,
    source: "website",
    priority: "medium",
    owner: "Alex Chen",
    closeInDays: 62,
    tags: ["mid-market", "logistics"],
    notes: "Downloaded the ROI whitepaper and booked a demo through the site.",
  },
  {
    stage: "Lead In",
    title: "Warehouse ops rollout",
    company: "Cedar & Fold",
    contactName: "Marcus Webb",
    contactEmail: "m.webb@cedarfold.example",
    contactPhone: "+44 20 7946 0812",
    value: 9500,
    source: "paid_ads",
    priority: "low",
    owner: "Dana Ruiz",
    closeInDays: 90,
    tags: ["smb"],
    notes: "Clicked through from the retargeting campaign. Budget unconfirmed.",
  },
  {
    stage: "Qualified",
    title: "Enterprise pilot — EMEA",
    company: "Halcyon Financial",
    contactName: "Sofia Lindqvist",
    contactEmail: "s.lindqvist@halcyonfin.example",
    contactPhone: "+46 8 555 0193",
    value: 148000,
    source: "referral",
    priority: "critical",
    owner: "Alex Chen",
    closeInDays: 45,
    tags: ["enterprise", "emea", "security-review"],
    notes:
      "Referred by their CTO's former colleague. Procurement wants SOC 2 evidence before the next call.",
  },
  {
    stage: "Qualified",
    title: "Support desk consolidation",
    company: "Brightline Health",
    contactName: "Dr. Amara Osei",
    contactEmail: "aosei@brightlinehealth.example",
    contactPhone: "+1 617 555 0110",
    value: 62000,
    source: "inbound",
    priority: "high",
    owner: "Jordan Patel",
    closeInDays: 38,
    tags: ["healthcare", "compliance"],
    notes: "Replacing two legacy tools. HIPAA questionnaire sent.",
  },
  {
    stage: "Discovery",
    title: "Multi-region deployment",
    company: "Aster Manufacturing",
    contactName: "Ingrid Bauer",
    contactEmail: "i.bauer@astermfg.example",
    contactPhone: "+49 30 5550 4471",
    value: 210000,
    source: "outbound",
    priority: "critical",
    owner: "Dana Ruiz",
    closeInDays: 74,
    tags: ["enterprise", "manufacturing"],
    notes:
      "Three business units involved. Technical deep-dive scheduled with their platform team.",
  },
  {
    stage: "Discovery",
    title: "Field sales enablement",
    company: "Vantage Agritech",
    contactName: "Tom Okafor",
    contactEmail: "tokafor@vantageagri.example",
    contactPhone: "+1 312 555 0177",
    value: 44000,
    source: "event",
    priority: "medium",
    owner: "Jordan Patel",
    closeInDays: 55,
    tags: ["mid-market"],
    notes: "Met at AgriConnect. Champion is the VP of Sales Ops.",
  },
  {
    stage: "Proposal",
    title: "Annual contract — 250 seats",
    company: "Meridian Retail Group",
    contactName: "Lucia Ferrari",
    contactEmail: "l.ferrari@meridianretail.example",
    contactPhone: "+39 02 5550 3388",
    value: 186000,
    source: "partner",
    priority: "high",
    owner: "Alex Chen",
    closeInDays: 21,
    tags: ["enterprise", "retail", "partner-sourced"],
    notes: "Proposal v2 sent with the volume discount their CFO asked for.",
  },
  {
    stage: "Proposal",
    title: "Customer success platform",
    company: "Loomis Digital",
    contactName: "Rachel Kim",
    contactEmail: "rkim@loomisdigital.example",
    contactPhone: "+1 206 555 0122",
    value: 71500,
    source: "inbound",
    priority: "high",
    owner: "Dana Ruiz",
    closeInDays: 28,
    tags: ["mid-market", "saas"],
    notes: "Comparing us against one competitor. Pricing is the open question.",
  },
  {
    stage: "Negotiation",
    title: "Global rollout — phase 1",
    company: "Perrin & Locke",
    contactName: "Nathan Boyd",
    contactEmail: "n.boyd@perrinlocke.example",
    contactPhone: "+1 212 555 0165",
    value: 325000,
    source: "referral",
    priority: "critical",
    owner: "Alex Chen",
    closeInDays: 12,
    tags: ["enterprise", "legal-review"],
    notes: "Redlines back from their counsel. Two clauses left: liability cap and DPA term.",
  },
  {
    stage: "Negotiation",
    title: "Analytics add-on renewal",
    company: "Kestrel Media",
    contactName: "Yuki Tanaka",
    contactEmail: "y.tanaka@kestrelmedia.example",
    contactPhone: "+81 3 5550 7712",
    value: 58000,
    source: "inbound",
    priority: "medium",
    owner: "Jordan Patel",
    closeInDays: 9,
    tags: ["renewal", "media"],
    notes: "Wants a two-year term in exchange for a 10% discount.",
  },
  {
    stage: "Closed Won",
    title: "Onboarding + implementation",
    company: "Sable Interactive",
    contactName: "Elena Duarte",
    contactEmail: "e.duarte@sableinteractive.example",
    contactPhone: "+34 91 555 0290",
    value: 96000,
    source: "outbound",
    priority: "high",
    owner: "Dana Ruiz",
    closeInDays: -6,
    tags: ["mid-market", "won"],
    notes: "Signed a 24-month agreement. Kickoff is on the calendar.",
  },
  {
    stage: "Closed Lost",
    title: "Ops tooling replacement",
    company: "Fairmont Freight",
    contactName: "Greg Halloran",
    contactEmail: "ghalloran@fairmontfreight.example",
    contactPhone: "+1 704 555 0134",
    value: 39000,
    source: "cold_call",
    priority: "low",
    owner: "Jordan Patel",
    closeInDays: -14,
    tags: ["logistics"],
    notes: "Lost to an incumbent renewal. Revisit in the next budget cycle.",
  },
];

function isoDateIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Once this instance has confirmed the database is populated there is no point
 * asking again on every request — each check is a network round trip to Turso.
 */
let seedChecked = false;

export async function seedIfEmpty(): Promise<void> {
  if (seedChecked) return;

  const existing = await one<{ count: number }>("SELECT COUNT(*) AS count FROM boards");
  if (Number(existing?.count ?? 0) > 0) {
    seedChecked = true;
    return;
  }

  const ts = nowIso();
  const boardId = newId("brd");

  await writeTransaction(async (tx) => {
    // Re-check inside the write transaction: several serverless instances can
    // cold-start at once, and without this they would each seed a board.
    const guard = await tx.execute("SELECT COUNT(*) AS count FROM boards");
    const count = Number(
      (guard.rows[0] as unknown as { count: number } | undefined)?.count ?? 0,
    );
    if (count > 0) return;

    await tx.execute({
      sql: `INSERT INTO boards (id, name, description, currency, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        boardId,
        "Sales Pipeline",
        "New business — FY pipeline across all regions",
        "USD",
        ts,
        ts,
      ],
    });

    const stageIds = new Map<string, string>();
    for (const [index, stage] of STAGE_SEEDS.entries()) {
      const id = newId("stg");
      stageIds.set(stage.name, id);
      await tx.execute({
        sql: `INSERT INTO stages (id, board_id, name, position, default_probability, outcome, wip_limit, color, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          boardId,
          stage.name,
          index,
          stage.probability,
          stage.outcome,
          stage.wipLimit,
          stage.color,
          ts,
        ],
      });
    }

    const positionByStage = new Map<string, number>();
    for (const deal of DEAL_SEEDS) {
      const stageId = stageIds.get(deal.stage);
      if (!stageId) continue;
      const position = positionByStage.get(stageId) ?? 0;
      positionByStage.set(stageId, position + 1);

      const stageSeed = STAGE_SEEDS.find((s) => s.name === deal.stage)!;
      const dealId = newId("dl");

      await tx.execute({
        sql: `INSERT INTO deals (id, board_id, stage_id, position, title, company, contact_name, contact_email,
                                 contact_phone, value_cents, currency, source, priority, probability,
                                 expected_close_date, owner, tags, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          dealId,
          boardId,
          stageId,
          position,
          deal.title,
          deal.company,
          deal.contactName,
          deal.contactEmail,
          deal.contactPhone,
          Math.round(deal.value * 100),
          "USD",
          deal.source,
          deal.priority,
          stageSeed.probability,
          isoDateIn(deal.closeInDays),
          deal.owner,
          JSON.stringify(deal.tags),
          deal.notes,
          ts,
          ts,
        ],
      });

      await tx.execute({
        sql: `INSERT INTO activities (id, deal_id, kind, message, actor, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          newId("act"),
          dealId,
          "created",
          `Deal created in ${deal.stage}`,
          deal.owner,
          ts,
        ],
      });
    }
  });

  seedChecked = true;
}
