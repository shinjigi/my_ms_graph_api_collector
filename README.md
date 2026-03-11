# TP Automation — Personal Productivity Pipeline

A personal tool that collects activity signals from multiple sources, uses Claude AI to propose daily time allocations, and submits them to TargetProcess — eliminating the manual overhead of timesheet compilation.

---

## What it does

Every workday the pipeline:

1. **Collects** raw activity data from Microsoft Graph (calendar, email, Teams), Git, SVN, Zucchetti, and browser history
2. **Aggregates** all signals into per-day bundles
3. **Analyzes** each day with Claude AI, producing a time-allocation proposal mapped to real TargetProcess tasks
4. **Presents** proposals in a local web UI for review and adjustment
5. **Submits** approved hours to TargetProcess and optionally updates Zucchetti and books a Nibol desk

---

## Quick start

```bash
cp .env.example .env      # fill in credentials (see DEVELOPER.md)
npm run collect           # pull raw data from all sources
npm run aggregate         # build per-day bundles
npm run analyze           # generate AI proposals
npm run serve             # web UI → http://localhost:3001
```

Or all at once: `npm run all`

---

## Documentation

| Document | Audience | Contents |
|---|---|---|
| **[DEVELOPER.md](./DEVELOPER.md)** | Engineers | Architecture, data flow, env vars, how to run and extend |
| **[FUNCTIONAL.md](./FUNCTIONAL.md)** | Business analysts | Feature overview, source integrations, AI pipeline, UI workflows |

---

## Key design principles

- **No database** — all data is plain JSON under `data/`. Zero infrastructure dependencies.
- **Monthly partitioning** — each source writes `data/raw/<source>/YYYY-MM.json`. Past completed months are skipped on re-run; a `.meta.json` sidecar tracks extraction state per month.
- **Incremental Teams collection** — per-chat state in `chat-states.json` tracks `lastModifiedDateTime`; only new/edited messages are fetched on each run.
- **Device code auth** — Microsoft Graph uses delegated permissions with a cached refresh token. No service principal required.
- **Local only** — everything runs on `localhost`. No cloud deployment, no shared state.

---

## Requirements

- Node.js ≥ 18 (managed via `nvm`)
- Azure Entra ID App Registration — delegated permissions, public client flow enabled
- TargetProcess account with API token
- Anthropic API key (Claude)
- Zucchetti credentials (form-based auth, automated via Playwright)
