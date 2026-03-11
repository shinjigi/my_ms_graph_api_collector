# Developer Guide

→ [README](./README.md) | [Functional overview](./FUNCTIONAL.md)

---

## Repository layout

```
my_ms_graph_api_collector/
├── src/
│   ├── index.ts                      # collect entrypoint (npm run collect)
│   ├── graphClient.js                # MSAL device-code auth + Graph client (CJS)
│   ├── collectors/
│   │   ├── utils.ts                  # shared: mergeByKey, skip/force logic, .meta.json
│   │   ├── graph-calendar.ts         # /me/calendarView → data/raw/graph-calendar/
│   │   ├── graph-email.ts            # /me/messages    → data/raw/graph-email/
│   │   ├── graph-teams.ts            # /me/chats/*/messages → data/raw/graph-teams/
│   │   ├── git-commits.ts            # git log (GIT_ROOTS) → data/raw/git/
│   │   ├── svn-commits.ts            # svn log (SVN_URL)   → data/raw/svn/
│   │   ├── zucchetti.ts              # Playwright scraper  → data/raw/zucchetti/
│   │   ├── browser-history.ts        # SQLite (Chrome+Firefox) → data/raw/browser-*/
│   │   └── nibol.ts                  # Playwright — desk booking
│   ├── analysis/
│   │   ├── aggregator.ts             # npm run aggregate → data/aggregated/
│   │   └── claudeAnalyzer.ts         # npm run analyze   → data/proposals/
│   ├── server/
│   │   ├── app.ts                    # Express server (port 3001)
│   │   └── routes/
│   │       ├── proposals.ts          # GET/PATCH /api/proposals/:date
│   │       ├── submit.ts             # POST /api/submit/:date
│   │       └── hooks.ts              # POST /api/hooks/{zucchetti,nibol}
│   └── targetprocess/
│       ├── client.ts                 # TargetProcess REST v1 client
│       ├── collector.ts              # KB update (npm run kb:update)
│       ├── format.ts                 # hhmmToHours, parseTpDate helpers
│       └── types.ts                  # TP entity interfaces
├── web/                              # Vue 3 + Vite frontend
│   └── src/
│       ├── App.vue
│       ├── components/
│       │   ├── CalendarPanel.vue     # left column: calendar, Teams, git, svn
│       │   ├── AnalysisCard.vue      # center: AI proposal + submit controls
│       │   └── TaskPanel.vue         # right: TP open items
│       ├── composables/useProposals.ts
│       └── types/index.ts
├── data/                             # gitignored — runtime data
│   ├── raw/
│   │   ├── graph-calendar/           YYYY-MM.json + .meta.json
│   │   ├── graph-email/              YYYY-MM.json + .meta.json
│   │   ├── graph-teams/              YYYY-MM.json + .meta.json + chat-states.json
│   │   ├── git/                      YYYY-MM.json + .meta.json
│   │   ├── svn/                      YYYY-MM.json + .meta.json
│   │   ├── zucchetti/                YYYY-MM.json + .meta.json
│   │   ├── browser-chrome/           YYYY-MM.json + .meta.json
│   │   └── browser-firefox/          YYYY-MM.json + .meta.json
│   ├── aggregated/                   YYYY-MM-DD.json
│   ├── proposals/                    YYYY-MM-DD.json
│   └── kb/                           us-summaries.json
├── zucchetti_automation/             # Playwright scripts (plain JS)
├── scripts/                          # one-off test/utility scripts
├── .env.example
├── CLAUDE.md
└── package.json
```

---

## Data flow

```
npm run collect
  └─ src/index.ts
       ├─ collectGraphCalendar()  ─┐
       ├─ collectGraphEmail()      ├─ data/raw/<source>/YYYY-MM.json
       ├─ collectGraphTeams()      │  each with .meta.json sidecar
       ├─ collectSvnCommits()      │  skip/force logic per month
       ├─ collectGitCommits()      │
       ├─ collectZucchetti()      ─┘
       └─ collectBrowserHistory()

npm run aggregate
  └─ src/analysis/aggregator.ts
       └─ loadDirMonthly<T>(dir)  ← reads all YYYY-MM.json from each source dir
            └─ AggregatedDay { zucchetti, calendar, emails, teams,
                               svnCommits, gitCommits, browserVisits }
                 └─ data/aggregated/YYYY-MM-DD.json

npm run analyze
  └─ src/analysis/claudeAnalyzer.ts
       └─ Claude API (claude-haiku-4-5-20251001 by default)
            └─ data/proposals/YYYY-MM-DD.json

npm run serve
  └─ src/server/app.ts  (port 3001)
       └─ web/  (Vite dev server port 5173, proxies /api → 3001)
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | ✅ | Azure Entra ID tenant |
| `CLIENT_ID` | ✅ | App Registration client ID |
| `TOP` | — | Graph API page size (default 50) |
| `COLLECT_SINCE` | — | Historical start date (default 2025-01-01) |
| `TP_BASE_URL` | ✅ | TargetProcess instance URL |
| `TP_TOKEN` | ✅ | Base64 TP API token |
| `MISC_TASK_ID` | — | Fallback TP task for unattributed hours |
| `CLAUDE_API_KEY` | ✅ | Anthropic API key |
| `CLAUDE_MODEL` | — | Model ID (default claude-haiku-4-5-20251001) |
| `GIT_ROOTS` | — | Semicolon-separated root dirs for git scan |
| `SVN_URL` | — | SVN repository URL |
| `SVN_USERNAME` / `SVN_PASSWORD` | — | SVN credentials |
| `SVN_BIN` | — | Path to `svn.exe` |
| `ZUCCHETTI_USERNAME` / `ZUCCHETTI_PASSWORD` | — | Zucchetti form auth |
| `NIBOL_PROFILE_DIR` | — | Playwright session dir for Nibol |
| `CHROME_PROFILE_DIRS` | — | Semicolon-separated Chrome profile dirs |
| `FIREFOX_PROFILE_DIR` | — | Firefox profile dir |

---

## Authentication — Microsoft Graph

The app uses **MSAL device code flow** (delegated permissions, no service principal):

1. First run: a URL + code is printed; open it in a browser and authenticate
2. Token cached in `.token-cache.json` (gitignored)
3. Subsequent runs use `acquireTokenSilent` with the cached refresh token

**Required Azure App Registration settings:**
- Authentication → "Allow public client flows" → **Yes**
- Delegated permissions: `Mail.Read`, `Calendars.Read`, `Chat.Read`, `Chat.ReadWrite`

---

## Skip / force logic

Every source directory has a `.meta.json` sidecar:

```json
{
  "2026-02": { "lastExtractedDate": "2026-02-28", "sources": ["graph"] },
  "2026-03": { "lastExtractedDate": "2026-03-11", "sources": ["graph"] }
}
```

Rules applied per month on each run:

| Condition | Action |
|---|---|
| `--force` passed | Always re-fetch |
| Month = current month | Always re-fetch (may have new data) |
| `lastExtractedDate >= last day of month` AND `sources` unchanged | **Skip** |
| Otherwise | Re-fetch (month was incomplete, or sources changed) |

Teams is handled differently: per-chat incremental state in `data/raw/graph-teams/chat-states.json` — stores `lastModifiedDateTime` per chat ID and uses `$filter=lastModifiedDateTime gt <stored>` on each run.

---

## Running the stack

```bash
# Backend only
npx tsx src/server/app.ts

# Frontend dev server (proxies /api → localhost:3001)
cd web && npm run dev

# Full pipeline
npm run all

# Single-day update
npm run collect -- --date=2026-03-11
npm run aggregate
npm run analyze -- --date=2026-03-11

# Force re-fetch everything
npm run collect -- --force
```

---

## Adding a new collector

1. Create `src/collectors/<name>.ts`
2. Export `async function collect<Name>(force = false): Promise<string[]>`
3. Use `mergeByKey`, `readMeta`, `writeMeta`, `shouldSkipMonth` from `utils.ts`
4. Write output to `data/raw/<name>/YYYY-MM.json`
5. Import and call it in `src/index.ts`
6. Add `loadDirMonthly<YourType>(dir)` in `src/analysis/aggregator.ts` and extend `AggregatedDay`

---

## TypeScript

```bash
npx tsc --noEmit       # type-check (must be 0 errors before commit)
npx tsx src/index.ts   # run without compile step
```

The project is `"type": "commonjs"`. `tsx` handles TypeScript transpilation at runtime. There is no build step for the backend — `tsx` is used directly in all npm scripts.
