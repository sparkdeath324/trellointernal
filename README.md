# Pipeline — a Trello-style CRM board

A kanban board where the cards are **deals**, the columns are **pipeline
stages**, and every card carries the CRM fields a rep actually needs: deal size,
source, owner, win probability and expected close date.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

With no `TURSO_DATABASE_URL` set, the app opens a plain SQLite file at
`data/crm.db`, creating and seeding it on first request (7 stages, 12 deals) so
the board is never empty. `npm run db:reset` wipes it and re-seeds.

## What it does

**Board** — Drag deals between stages with pointer or keyboard. Column headers
roll up deal count, total value, and probability-weighted value. Stages can
carry a WIP limit that turns red when exceeded.

**CRM fields per deal** — deal size (with `148k` / `1.2m` shorthand), source
(inbound, outbound, referral, partner, event, website, cold call, social, paid
ads), priority, win probability, expected close date, owner, company, primary
contact (name / email / phone), tags and notes.

**Pipeline forecasting** — Stages are typed `open`, `won` or `lost`. Open
pipeline, weighted forecast, closed-won, win rate and average deal size are
computed from that, and won/lost stages are excluded from open totals. Dragging
a deal into a stage re-seeds its probability from that stage's default, so the
forecast follows the board.

**Activity log** — Every stage change, deal-size change, owner change and manual
note is recorded per deal with a timestamp.

**Filters** — Free-text search across title, company, contact, owner, notes and
tags, plus multi-select owner / source / priority menus (pick High *and*
Critical), each option showing its deal count. Active filters appear as
removable chips with a live "7 of 12 deals" counter. Columns keep their full
roll-up totals while filtered and show how many cards are hidden.

**Multiple boards** — Each board is an independent pipeline with its own stages
and currency.

**MCP server** — The same features are exposed to agents over MCP. See below.

## MCP server

`npm run mcp` starts a stdio MCP server over the same database the web app uses,
so anything an agent changes shows up in the UI on the next request.

Register it with an MCP client — for Claude Code:

```bash
claude mcp add pipeline-crm -- npm --prefix /path/to/this/repo run mcp
```

Or by config:

```json
{
  "mcpServers": {
    "pipeline-crm": {
      "command": "npx",
      "args": ["tsx", "mcp/server.mts"],
      "cwd": "/path/to/this/repo"
    }
  }
}
```

Fifteen tools, covering everything the board can do:

| Tool | Purpose |
| --- | --- |
| `list_boards` | Every board with open pipeline, forecast and closed-won |
| `get_board` | One board's stages (with roll-ups) and deals |
| `create_board` | New board seeded with a six-stage pipeline |
| `create_stage` / `update_stage` / `delete_stage` | Stage CRUD; delete can relocate its deals |
| `reorder_stages` | Set left-to-right pipeline order |
| `list_deals` | Filter by stage, owner, source, priority, text, value range, close date |
| `get_deal` | One deal with its full activity history |
| `create_deal` / `update_deal` / `delete_deal` | Deal CRUD across every CRM field |
| `move_deal` | Move between stages — re-seeds probability and logs the transition |
| `add_deal_note` | Append to a deal's activity timeline |
| `pipeline_summary` | Forecast totals, per-stage breakdown, value by lead source |

Deal amounts are taken and returned in whole currency units (`148000`), with a
formatted string alongside; cents stay an internal detail.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, server actions) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Drag & drop | `@dnd-kit` |
| Storage | libSQL — Turso in production, a local SQLite file in dev |
| Validation | `zod` at the server-action and MCP tool boundaries |
| Agent API | `@modelcontextprotocol/sdk` over stdio |

## Layout

```
src/
  app/
    page.tsx                    board index + create board
    boards/[boardId]/page.tsx   server component, loads a board snapshot
    actions.ts                  every mutation, zod-validated
  components/
    BoardView.tsx               drag & drop, filters, dialog orchestration
    StageColumn.tsx             one pipeline stage + its roll-up
    DealCard.tsx                the card face and its sortable wrapper
    DealDialog.tsx              full CRM form + activity timeline
    StageDialog.tsx             stage settings (probability, outcome, WIP, colour)
    PipelineHeader.tsx          KPI tiles + filter bar
    ui.tsx                      shared inputs, buttons, modal
  lib/
    db.ts        libSQL client, schema, lock-retry helpers
    seed.ts      first-run demo pipeline
    queries.ts   all SQL, row → domain mapping
    metrics.ts   pipeline roll-ups (pure)
    format.ts    money / date / avatar helpers
    types.ts     domain types and option metadata
mcp/
  server.mts     MCP server over the same database
```

## Design

A single committed dark theme in black, white and red. Everything structural is
monochrome — page, panels, cards and borders are neutral, text is white at
varying opacity. Red is reserved for meaning: the primary action, active
filters, urgency (priority and overdue close dates), and pipeline progression
through the stage accents. Nothing decorative is red, which is why tags render
as neutral outlined chips rather than coloured ones.

### Data model

`boards` → `stages` → `deals` → `activities`, with `ON DELETE CASCADE` down the
chain. Money is stored as integer cents throughout and only formatted at the
edges. Card order is a dense `position` sequence per stage, rewritten inside a
transaction on every move.

## Deployment

### Vercel (recommended)

Vercel functions have no durable filesystem — only `/tmp`, which is per-instance
and wiped between invocations — so the database has to live outside the
deployment. Turso is a hosted libSQL service speaking the same SQL as SQLite,
which is why the query layer is unchanged between local and production.

**1. Create the database** ([turso.tech](https://turso.tech), free tier):

```bash
turso db create pipeline-crm
turso db show pipeline-crm --url      # libsql://pipeline-crm-<org>.turso.io
turso db tokens create pipeline-crm   # the auth token
```

**2. Import the project on Vercel** — "Add New… → Project", pick this repo.
Framework preset, build command and output directory are all detected; nothing
to change.

**3. Set two environment variables** before the first deploy (Settings →
Environment Variables), for Production, Preview and Development:

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | the `libsql://…` URL from step 1 |
| `TURSO_AUTH_TOKEN` | the token from step 1 |

**4. Deploy.** The schema is created on the first request and the demo pipeline
is seeded once — the seed re-checks inside its write transaction, so several
instances cold-starting together still produce exactly one board.

If you add the variables *after* a failed deploy, redeploy — Vercel bakes env
vars in at build time.

Note that preview deployments share the production database unless you point
them at a separate Turso database.

**If the deploy builds but every page 500s** with
`SERVER_ERROR: Server returned HTTP status 400`, hit `/api/health` — it returns
Turso's own response body, which the libSQL client otherwise discards. A 400 on
*every* request (rather than a 401) almost always means the auth token is wrong,
expired, or was saved with surrounding quotes. Re-issue it with
`turso db tokens create <db>` and paste the bare token, no quotes.

`next.config.ts` enables `output: "standalone"` only when *not* building on
Vercel. Standalone mode consumes the `.nft.json` file-trace manifests that
Vercel's build pipeline reads, so forcing it there fails the deploy with
`ENOENT: … .next/next-server.js.nft.json`.

### Self-hosting (Docker / Dokploy / Coolify)

The `Dockerfile` and `docker-compose.yml` run the app against a SQLite file on a
mounted volume — no Turso needed:

```bash
docker compose up -d --build        # http://localhost:3000
```

The image builds from Next's standalone output, runs as a non-root user, keeps
the database on the `crm-data` volume at `/app/data`, and exposes `/api/health`
for the platform's health check. In Dokploy, point a Compose application at this
repo; it picks up the compose file and health check as-is.

## Notes

- `data/` is gitignored — the local database is per-checkout.
- The MCP server talks to whichever database the env vars select, so it can
  drive either a local file or the production Turso database.
- Compact money formatting is hand-rolled rather than using `Intl`'s
  `notation: "compact"`, whose trailing-zero behaviour differs between Node and
  the browser and caused a hydration mismatch.
- Deletes remove child rows explicitly instead of relying on
  `ON DELETE CASCADE`, which only fires when `PRAGMA foreign_keys` is on — not
  guaranteed across libSQL deployments.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm start          # serve the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run mcp        # stdio MCP server
npm run db:reset   # delete the local database
```
