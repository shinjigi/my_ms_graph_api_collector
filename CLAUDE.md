# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Collect all**: `npm run collect` (all sources from COLLECT_SINCE)
- **Collect single day**: `npm run collect -- --date=YYYY-MM-DD`
- **Aggregate**: `npm run aggregate` (raw → per-day bundles)
- **Analyze**: `npm run analyze -- --date=YYYY-MM-DD` (unified analyzer with fallback chain)
- **Analyze (force provider)**: `npm run analyze:claude`, `npm run analyze:gemini`, `npm run analyze:cli`
- **Full pipeline**: `npm run all` (collect → aggregate → analyze → serve)
- **Server**: `npm run serve` (Express on port 3001)
- **Frontend dev**: `cd web && npm run dev` (Vite on 5173, proxies /api → 3001)
- **Type check**: `npx tsc --noEmit` (backend) / `cd web && npx vue-tsc --noEmit` (frontend)

## Architecture

TypeScript monorepo: Express backend + Vue 3 frontend + Playwright automation.

### Data pipeline

```
Collectors (src/collectors/)  →  data/raw/<source>/YYYY-MM.json
Aggregator (src/analysis/)    →  data/aggregated/YYYY-MM-DD.json
Analyzer  (src/analysis/)     →  data/proposals/YYYY-MM-DD.json
Express server (src/server/)  →  /api/week/:date, /api/zucchetti/*, /api/analyze/*
Vue frontend (web/)           →  http://localhost:5173
```

### Analyzer (unified)

Fallback chain: Claude API → OpenAI-compat (Ollama/LM Studio) → Gemini → Claude CLI.

```
src/analysis/
├── analyzer.ts          ← orchestrator: interface, shared logic, analyzeDay(), run()
├── base.ts              ← AnalyzerProvider interface, stripCodeFence, tpmToChars
├── prompts.ts           ← prompt templates (static text + variable interpolation)
├── claudeProvider.ts    ← Anthropic API (ClaudeApiProvider) + OpenAI-compat (OpenAiCompatibleProvider) + CLI (ClaudeCliProvider)
└── geminiProvider.ts    ← Google Generative AI SDK (GeminiProvider)
```

Server endpoints:
- `POST /api/analyze/:date` — single day (202 + jobId)
- `POST /api/analyze/week/:date` — all workdays in week (202 + jobId)
- `GET /api/analyze/status/:jobId` — poll job status
- `GET /api/day/:date` — day signals (calendar, email, teams, commits, browser)
- `GET /api/sync/*` — sync utilities
- `GET /api/health` — health check

### Collectors

- **Graph API** (calendar, email, teams): MSAL device code flow, `/me/` endpoints
- **Zucchetti** (timesheet): Playwright browser automation via `src/collectors/zucchetti/`
  - `session.ts` — shared login + Cartellino navigation
  - `scraper.ts` — reusable scraping functions (scrapeCartellino, scrapeSingleDay, validateDay)
  - `updateData.ts` — submit activity requests + optional post-submit scrape
  - `getTimesheet.ts` — CLI: full month extraction
- **VCS** (git, svn): commit history collection
- **Browser** (chrome, firefox): browsing history via sql.js
- **Nibol**: split architecture — `src/collectors/nibol/index.ts` scrapes calendar data during `npm run collect` (writes to `data/raw/nibol/`); standalone desk-booking scripts in `scripts/nibol/` (`npm run nibol:book`, `npm run nibol:calendar`)

### Auth flow

`graphClient.ts` uses MSAL's `PublicClientApplication` with a file-based token cache (`.token-cache.json`). On first run, it prompts the user to authenticate via device code (URL + code in browser). Subsequent runs use `acquireTokenSilent` with the cached refresh token.

### Zucchetti automation gotchas

- DOM has dynamic portlet IDs (e.g. `gp3qe_`) — use `[id$="_suffix"]` selectors
- Modals may load in iframes — search all `page.frames()` for target elements
- Two "Giornata intera" checkboxes exist: `cPeriodoBox` (visible) and `InteraBox` (hidden) — always use `evaluate()` to find the visible one
- `Frame.evaluate()` accepts only 1 arg — pass as object `{ h, m }`, not `(h, m)`
- `ZUCCHETTI_HEADLESS` env var controls headless mode (default: true)

### Raw data format

- Zucchetti raw files (`data/raw/zucchetti/YYYY-MM.json`): flat `ZucchettiDay[]` array
- Code reading raw files must handle both flat array and `{ days: [...] }` wrapper formats

### Frontend (web/)

- Vue 3 + Pinia + vue-router (hash history)
- Vite dev server proxies `/api` → `http://localhost:3001`
- Stores: useTimesheetStore (week data + TP hours), useDayStore (single day), usePickerStore (date navigation)
- URL is source of truth: `/#/timesheet/YYYY-MM-DD`

### Key types

- `ZucchettiDay` — `shared/zucchetti.ts` (canonical; imported by collector and aggregator)
- `AggregatedDay`, `NibolBooking`, `GitCommit`, `SvnCommit`, `BrowserVisit`, etc. — `shared/aggregator.ts`
- `DayProposal`, `ProposalEntry` — `shared/analysis.ts`
- `KbEntry`, `KbStore` — `shared/kb.ts`
- `AnalyzerProvider` — `src/analysis/base.ts`
- `WeekDayData` — `shared/week.ts`
- Frontend view types — `web/src/types/index.ts`

### Directory structure (key paths)

| Path | Purpose |
|------|---------|
| `src/` | Backend: collectors, analysis, server |
| `web/` | Frontend: Vue 3 + Pinia |
| `scripts/tp/` | Standalone TargetProcess CLI tools (ts-node) |
| `scripts/nibol/` | Nibol desk booking automation (tsx) |
| `scripts/` | PowerShell automation, morning task, bootstrap |
| `docs/` | Documentation and planning |
| `docs/archive/` | Legacy files (portal.html) |
| `config/` | `defaults.json` (recurring activities), `hooks.json` |
| `data/` | Runtime data: raw, aggregated, proposals, kb |

### Setup helper

`scripts/bootstrap-env.ps1` — PowerShell script that uses Azure CLI to generate `.env` from an App Registration Object ID. See `azure-guide.md` for Azure portal setup and SSL/proxy troubleshooting.

## npm Registry

This is a **personal project** — always use the standard public npm registry, not the internal ProGet feed.
When installing packages, always pass `--registry https://registry.npmjs.org` explicitly, or ensure the project-level `.npmrc` points to the public registry.

Project-level `.npmrc` (already checked in):
```
registry=https://registry.npmjs.org/
```

## Key conventions

- Language in code comments and console output is **Italian**.
- The app requires an Azure Entra ID App Registration with **"Allow public client flows"** enabled and **Delegated** permissions (not Application).
- `.token-cache.json` contains sensitive tokens and is gitignored.

## Development Guidelines

- **Date Manipulation**: Always use `@shared/dates.ts` for any date or date-string manipulation (formatting, offsets, extraction). Never use manual `slice(0, 10)`, `substring`, or `padStart` for ISO dates. Use `dateToString()`, `getMonday()`, `extractMonthStr()`, `getApiStartOfDay()`, etc.
- **Standards & Constants**: Use `@shared/standards.ts` for shared business logic constants like `WORKDAY_HOURS`.
- **Personal registry**: Always use the public npm registry (`https://registry.npmjs.org/`).
