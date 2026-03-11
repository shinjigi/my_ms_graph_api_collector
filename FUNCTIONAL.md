# Functional Overview

→ [README](./README.md) | [Developer guide](./DEVELOPER.md)

---

## Problem statement

Logging hours in TargetProcess manually at the end of the day is error-prone and time-consuming. The question "what did I actually work on today?" requires remembering meetings, conversations, commits, and tasks — context that is already scattered across multiple systems.

This tool collects that context automatically and proposes a time allocation using AI, reducing the daily logging effort to a review-and-click operation.

---

## System overview

```mermaid
flowchart TD
    subgraph Sources["Data Sources"]
        CAL[Calendar]
        MAIL[Email]
        TEAMS[Teams]
        GIT[Git repos]
        SVN[SVN]
        ZUCC[Zucchetti\ntimesheet]
        BROW[Browser\nhistory]
    end

    subgraph Pipeline["Local Pipeline"]
        COLLECT["npm run collect\ndata/raw/&lt;source&gt;/YYYY-MM.json"]
        AGG["npm run aggregate\ndata/aggregated/YYYY-MM-DD.json"]
        ANALYZE["npm run analyze\ndata/proposals/YYYY-MM-DD.json"]
        UI["Web UI\nlocalhost:5173"]
    end

    subgraph Outputs["External systems"]
        TP[TargetProcess]
        ZOUT[Zucchetti\nupdate]
        NIBOL[Nibol\ndesk booking]
    end

    Sources --> COLLECT
    COLLECT --> AGG
    AGG --> ANALYZE
    ANALYZE --> UI
    UI -->|approved hours| TP
    UI -->|location update| ZOUT
    UI -->|book/check-in| NIBOL
```

---

## Data sources

### Microsoft Graph (Office 365)

| Source | What is collected | Key fields |
|---|---|---|
| **Calendar** | All events in range | subject, start/end, attendees, online flag |
| **Email** | Received messages | subject, sender, received time, body preview |
| **Teams** | Messages from all chats | text, sender, chat topic, created/modified time |

Teams collection is **incremental per chat**: each chat stores the timestamp of the last fetched message; only new or edited messages are downloaded on subsequent runs. Default lookback on first run: **1 month**.

```mermaid
sequenceDiagram
    participant C as Collector
    participant S as chat-states.json
    participant G as Graph API

    C->>S: read lastModifiedDateTime for chat
    alt chat known
        C->>G: GET /me/chats/{id}/messages<br/>$filter=lastModifiedDateTime gt {stored}
    else new chat
        C->>G: GET /me/chats/{id}/messages<br/>$filter=lastModifiedDateTime gt {today-1month}
    end
    G-->>C: paginated messages
    C->>S: update lastModifiedDateTime
    C->>C: merge by id into YYYY-MM.json
```

### Version control

| Source | What is collected |
|---|---|
| **Git** | All commits across all repos found under `GIT_ROOTS`. Grouped by month. |
| **SVN** | All commits from `SVN_URL`, fetched month by month. Skipped gracefully when outside VPN. |

### Zucchetti (HR / timesheet)

The official company timesheet is the **ground truth for workdays**:
- Determines whether a day is a workday (vs. weekend, holiday, leave)
- Provides the **target hours** for the day (`hOrd` field)
- Provides the **work location**: office, smart working, or mixed (from `giustificativi`)

### Browser history

Chrome and Firefox SQLite databases are read directly (file copy to avoid lock). Provides URL-level activity as additional context for the AI analyzer.

---

## Aggregation

The aggregator joins all sources by calendar date. Only days present in Zucchetti data are included.

```mermaid
classDiagram
    class AggregatedDay {
        +string date
        +boolean isWorkday
        +number oreTarget
        +location: office|smart|mixed|unknown
        +ZucchettiDay zucchetti
        +CalendarEvent[] calendar
        +EmailRaw[] emails
        +TeamsMessageRaw[] teams
        +SvnCommit[] svnCommits
        +GitCommit[] gitCommits
        +BrowserVisit[] browserVisits
    }
```

`isWorkday` is derived from Zucchetti: `false` if `orario` is `DOM`/`SAB` or `hOrd` is empty.
`oreTarget` converts `hOrd` (e.g. `"7:42"`) to decimal hours (`7.7`).

---

## AI proposal generation

```mermaid
flowchart LR
    AGG[AggregatedDay]
    KB[TP open items\nKB]
    DEF[config/defaults.json\nrecurring activities]
    CLAUDE[Claude AI\nhaiku-4-5]
    PROP[DayProposal\ndata/proposals/]

    AGG --> CLAUDE
    KB --> CLAUDE
    DEF --> CLAUDE
    CLAUDE --> PROP
```

Claude returns a `DayProposal` where `sum(entries.inferredHours) == oreTarget`:

```mermaid
classDiagram
    class DayProposal {
        +string date
        +number oreTarget
        +number totalHours
        +ProposalEntry[] entries
        +string generatedAt
    }
    class ProposalEntry {
        +number|null taskId
        +entityType: UserStory|Task|Bug|recurring
        +string taskName
        +number inferredHours
        +confidence: high|medium|low
        +string reasoning
        +boolean approved
    }
    DayProposal "1" --> "*" ProposalEntry
```

---

## Web UI

### Submit workflow

```mermaid
stateDiagram-v2
    [*] --> SelectDay: open UI
    SelectDay --> Review: choose date
    Review --> Adjust: hours wrong\nor task missing
    Adjust --> Review: re-check balance
    Review --> Submit: balance == 0.0\nentries approved
    Submit --> Done: POST /api/submit/:date
    Done --> SelectDay: next day
    Done --> Hooks: optional
    Hooks --> ZucchettiUpdate: update location
    Hooks --> NibolBook: book/check-in desk
```

### Three-column layout

```mermaid
flowchart LR
    subgraph Left["CalendarPanel"]
        EV[Events]
        TM[Teams msgs]
        GC[Git commits]
        SC[SVN commits]
    end
    subgraph Center["AnalysisCard"]
        DS[Date selector]
        EL[Entry list\nhours per task]
        BAL[Balance indicator]
        SUB[Submit button]
    end
    subgraph Right["TaskPanel"]
        OI[Open TP items]
        SR[Search]
    end
    Left -.->|context signals| Center
    Right -.->|drag to assign| Center
```

### Balance constraint

Submission is blocked until `totalHours == oreTarget`. The user adjusts entries inline until the balance shows `0.0`.

---

## TargetProcess integration

| Operation | Endpoint | Notes |
|---|---|---|
| List open items | `GET /api/v1/Assignables` | Filtered by assignee, non-final state |
| Log time | `POST /api/v1/Times` | One POST per approved entry |
| Delete time entry | `DELETE /api/v1/Times/{id}` | Used on re-submit |
| Search items | `GET /api/v1/Assignables?where=Name contains '...'` | Task panel search |

Authentication: Base64-encoded token as `Authorization: Basic <token>`.

---

## Nibol integration

Nibol is the desk booking system. `src/collectors/nibol.ts` uses Playwright with a persistent browser session to:

- `bookDesk` — reserve a desk for a given date
- `checkIn` — confirm presence on arrival

Triggered from the UI via `POST /api/hooks/nibol`.

---

## Storage layout

```mermaid
flowchart TD
    DATA[data/]
    RAW[raw/]
    AGG2[aggregated/\nYYYY-MM-DD.json]
    PROP2[proposals/\nYYYY-MM-DD.json]
    KB2[kb/\nus-summaries.json]

    DATA --> RAW
    DATA --> AGG2
    DATA --> PROP2
    DATA --> KB2

    RAW --> GCal[graph-calendar/\nYYYY-MM.json + .meta.json]
    RAW --> GMail[graph-email/\nYYYY-MM.json + .meta.json]
    RAW --> GTeams[graph-teams/\nYYYY-MM.json + .meta.json\nchat-states.json]
    RAW --> RGIT[git/\nYYYY-MM.json + .meta.json]
    RAW --> RSVN[svn/\nYYYY-MM.json + .meta.json]
    RAW --> RZ[zucchetti/\nYYYY-MM.json + .meta.json]
    RAW --> RBC[browser-chrome/\nYYYY-MM.json + .meta.json]
    RAW --> RBF[browser-firefox/\nYYYY-MM.json + .meta.json]
```

Each source directory has a `.meta.json` sidecar recording the last extraction date and sources scanned per month — enabling smart skip: completed past months are never re-fetched unless sources change or `--force` is passed.
