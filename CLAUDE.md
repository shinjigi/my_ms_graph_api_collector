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

Fallback chain: Claude API → Gemini → Claude CLI.

```
src/analysis/
├── analyzer.ts          ← orchestrator: interface, shared logic, analyzeDay(), run()
├── prompts.ts           ← prompt templates (static text + variable interpolation)
├── claudeProvider.ts    ← Anthropic API + OpenAI-compat backends
└── geminiProvider.ts    ← Google Generative AI SDK
```

Server endpoints for async analysis with job tracking:
- `POST /api/analyze/:date` — single day (202 + jobId)
- `POST /api/analyze/week/:date` — all workdays in week (202 + jobId)
- `GET /api/analyze/status/:jobId` — poll job status

### Collectors

- **Graph API** (calendar, email, teams): MSAL device code flow, `/me/` endpoints
- **Zucchetti** (timesheet): Playwright browser automation via `src/collectors/zucchetti/`
  - `session.ts` — shared login + Cartellino navigation
  - `scraper.ts` — reusable scraping functions (scrapeCartellino, scrapeSingleDay, validateDay)
  - `updateData.ts` — submit activity requests + optional post-submit scrape
  - `getTimesheet.ts` — CLI: full month extraction
- **VCS** (git, svn): commit history collection
- **Browser** (chrome, firefox): browsing history via sql.js

### Auth flow

`graphClient.js` uses MSAL's `PublicClientApplication` with a file-based token cache (`.token-cache.json`). On first run, it prompts the user to authenticate via device code (URL + code in browser). Subsequent runs use `acquireTokenSilent` with the cached refresh token.

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

- `ZucchettiDay` — `src/collectors/zucchetti/index.ts`
- `AggregatedDay` — `src/analysis/aggregator.ts`
- `DayProposal`, `ProposalEntry`, `AnalyzerProvider` — `src/analysis/analyzer.ts`
- `WeekDayData` — `src/server/routes/week.ts`
- Frontend view types — `web/src/types/index.ts`

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
