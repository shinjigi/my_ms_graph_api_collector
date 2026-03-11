# Functional Overview

→ [README](./README.md) | [Developer guide](./DEVELOPER.md)

---

## Problem statement

Logging hours in TargetProcess manually at the end of the day is error-prone and time-consuming. The question "what did I actually work on today?" requires remembering meetings, conversations, commits, and tasks — context that is already scattered across multiple systems.

This tool collects that context automatically and proposes a time allocation using AI, reducing the daily logging effort to a review-and-click operation.

---

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│                                                                 │
│  Microsoft 365        Version control      Other                │
│  ┌──────────┐         ┌─────┐ ┌─────┐     ┌──────────┐        │
│  │ Calendar │         │ Git │ │ SVN │     │Zucchetti │        │
│  │ Email    │         └──┬──┘ └──┬──┘     │(timeshee)│        │
│  │ Teams    │            │       │        └────┬─────┘        │
│  └────┬─────┘            └───────┘             │              │
│       │              ┌──────────┐              │              │
│       │              │ Browser  │              │              │
│       │              │history   │              │              │
│       │              └────┬─────┘              │              │
└───────┼─────────────────┼──────────────────────┼──────────────┘
        │                 │                      │
        ▼                 ▼                      ▼
┌───────────────────────────────────────────────────────┐
│              COLLECT  (npm run collect)                │
│   Monthly JSON files per source — data/raw/<source>/  │
│   Incremental: skip completed past months              │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│            AGGREGATE  (npm run aggregate)              │
│   One JSON per calendar day — data/aggregated/         │
│   Groups all signals by date                          │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│             ANALYZE   (npm run analyze)                │
│   Claude AI reads each day's signals + TP task list   │
│   Produces time-allocation proposal per day           │
│   Stores result — data/proposals/                     │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│              REVIEW & SUBMIT  (web UI)                 │
│   User reviews proposal, adjusts hours, approves      │
│   One click → hours posted to TargetProcess           │
│   Optional: update Zucchetti, book Nibol desk         │
└───────────────────────────────────────────────────────┘
```

---

## Data sources

### Microsoft Graph (via Office 365)

| Source | What is collected | Key fields |
|---|---|---|
| **Calendar** | All events in range | subject, start/end time, attendees, online meeting flag |
| **Email** | Received messages | subject, sender, received time, body preview |
| **Teams** | Chat messages (all chats) | message text, sender, chat topic, created/modified time |

Teams collection is **incremental per chat**: each chat stores the timestamp of the last fetched message. Only new or edited messages are downloaded on subsequent runs. Default lookback on first run: **1 month**.

### Version control

| Source | What is collected |
|---|---|
| **Git** | All commits across all repos found under configured root directories (`GIT_ROOTS`). Grouped by month. |
| **SVN** | All commits from a configured SVN repository URL, fetched month by month. Skipped gracefully when outside VPN. |

### Zucchetti (HR / timesheet system)

The official company timesheet is used as the **ground truth for workdays**:
- Determines whether a day is a workday (vs. weekend, holiday, or leave)
- Provides the **target hours** for the day (`hOrd` field)
- Provides the **work location**: office, smart working, or mixed (parsed from `giustificativi`)

### Browser history

Chrome and Firefox SQLite databases are read directly (file copy to avoid lock). Provides URL-level activity context as additional signal for the AI analyzer.

---

## Aggregation

The aggregator joins all sources by calendar date and produces one `AggregatedDay` file per day:

```
AggregatedDay {
  date          YYYY-MM-DD
  isWorkday     derived from Zucchetti orario + hOrd
  oreTarget     decimal hours (e.g. 7.7 for "7:42")
  location      office | smart | mixed | unknown
  zucchetti     raw Zucchetti day record
  calendar      [ CalendarEvent, ... ]
  emails        [ EmailRaw, ... ]
  teams         [ TeamsMessageRaw, ... ]
  svnCommits    [ SvnCommit, ... ]
  gitCommits    [ GitCommit, ... ]
  browserVisits [ BrowserVisit, ... ]
}
```

Only days present in Zucchetti data are aggregated. Days with no Zucchetti record are ignored.

---

## AI proposal generation

For each workday without an existing proposal, Claude AI receives:

- The full `AggregatedDay` (calendar, commits, messages, etc.)
- The list of currently open TargetProcess items assigned to the user (from the **KB** — knowledge base updated via `npm run kb:update`)
- A `config/defaults.json` with recurring fixed activities (standup, email triage, etc.)

Claude returns a structured proposal:

```
DayProposal {
  date        YYYY-MM-DD
  oreTarget   e.g. 7.7
  totalHours  sum of all entries (must match oreTarget)
  entries: [
    {
      taskId        TP task/story/bug ID (or null for recurring)
      entityType    UserStory | Task | Bug | recurring
      taskName      human-readable label
      inferredHours decimal hours
      confidence    high | medium | low
      reasoning     one-line explanation
      approved      false (user sets to true in the UI)
    }
  ]
  generatedAt   ISO timestamp
}
```

The AI balances `totalHours = oreTarget` — every hour is accounted for.

---

## Web UI

The UI runs on `http://localhost:5173` (Vite dev) or is served statically by the Express server.

### Layout — three-column view

```
┌────────────────┬────────────────────┬──────────────────┐
│  Calendar      │  Analysis Card     │  TP Task Panel   │
│                │                    │                  │
│  • Events      │  Date selector     │  Open items      │
│  • Teams msgs  │  ──────────────    │  assigned to me  │
│  • Git commits │  Entry list:       │                  │
│  • SVN commits │  [Task]  X.X h ✓  │  Drag to assign  │
│                │  [Task]  X.X h ✓  │  hours to task   │
│                │  ──────────────    │                  │
│                │  Balance: 0.0 h    │                  │
│                │  [Submit to TP]    │                  │
│                │  [Update Zucchetti]│                  │
│                │  [Book Nibol desk] │                  │
└────────────────┴────────────────────┴──────────────────┘
```

### Workflow

1. **Select day** — dropdown lists all days with available proposals, most recent first
2. **Review** — check AI-assigned hours against calendar and commit signals in the left panel
3. **Adjust** — edit hours per entry inline; balance indicator shows deviation from target
4. **Approve entries** — tick individual entries or approve all
5. **Submit** — posts approved time entries to TargetProcess via REST API
6. **Optional hooks**:
   - *Update Zucchetti* — runs Playwright automation to align the official timesheet with the approved location (smart / office)
   - *Book Nibol desk* — books or checks in a desk reservation for the day

### Balance constraint

The UI prevents submission if `totalHours ≠ oreTarget`. The user must adjust entries until the balance shows `0.0` before the submit button becomes active.

---

## TargetProcess integration

| Operation | Endpoint | Notes |
|---|---|---|
| List open items | `GET /api/v1/Assignables` | Filtered by assignee, non-final state |
| Log time | `POST /api/v1/Times` | One POST per approved entry |
| Delete time entry | `DELETE /api/v1/Times/{id}` | Used on re-submit |
| Search items | `GET /api/v1/Assignables?where=Name contains '...'` | Used by task panel search |

Authentication uses a Base64-encoded token passed as `Authorization: Basic <token>`.

---

## Nibol integration

Nibol is the desk booking system. The collector (`src/collectors/nibol.ts`) uses **Playwright** with a persistent browser session (no login required after initial setup) to:

- `bookDesk` — reserve a desk for a given date
- `checkIn` — confirm presence on arrival

Actions are triggered from the web UI via `POST /api/hooks/nibol`.

---

## Storage layout

```
data/
├── raw/                        Immutable source records (one dir per source)
│   ├── graph-calendar/         YYYY-MM.json  — calendar events
│   ├── graph-email/            YYYY-MM.json  — emails
│   ├── graph-teams/            YYYY-MM.json  — Teams messages
│   │                           chat-states.json — incremental state per chat
│   ├── git/                    YYYY-MM.json  — git commits
│   ├── svn/                    YYYY-MM.json  — SVN commits
│   ├── zucchetti/              YYYY-MM.json  — timesheet days
│   ├── browser-chrome/         YYYY-MM.json  — Chrome visits
│   └── browser-firefox/        YYYY-MM.json  — Firefox visits
│
├── aggregated/                 Per-day signal bundles (YYYY-MM-DD.json)
├── proposals/                  AI proposals (YYYY-MM-DD.json, editable)
└── kb/                         TargetProcess item summaries (us-summaries.json)
```

Each source directory has a `.meta.json` sidecar that records the last extraction date and the set of sources scanned per month. This enables the smart skip logic: completed past months are never re-fetched unless sources change or `--force` is passed.
