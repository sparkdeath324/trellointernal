# Pipeline — a Trello-style CRM board

A kanban board where the cards are **deals**, the columns are **pipeline
stages**, and every card carries the CRM fields a rep actually needs: deal size,
source, owner, win probability and expected close date.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The SQLite database is created at `data/crm.db` on first request and seeded with
a demo pipeline (7 stages, 12 deals) so the board is never empty. Run
`npm run db:reset` to wipe it and re-seed.

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
| Storage | SQLite via `better-sqlite3` |
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
    db.ts        connection, schema, migrations
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

## Notes

- `data/` is gitignored — the database is local to each checkout.
- `better-sqlite3` is a native addon and is listed in `serverExternalPackages`
  so Next keeps it out of the server bundle.
- Compact money formatting is hand-rolled rather than using `Intl`'s
  `notation: "compact"`, whose trailing-zero behaviour differs between Node and
  the browser and caused a hydration mismatch.

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
