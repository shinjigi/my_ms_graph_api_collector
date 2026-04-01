# AI Analysis — Architecture & Data Flow

→ [README](../README.md) | [Operator Runbook](./OPERATOR.md) | [Data Strategy](./DATA-STRATEGY.md)

This document describes the complete AI analysis pipeline: how raw activity signals are collected, aggregated, transformed into an AI prompt, processed by an LLM, and rendered in the frontend.

---

## 1. High-level pipeline

```mermaid
flowchart TD
    subgraph COLLECT["① Collect  —  src/collectors/"]
        C1[Graph Calendar]
        C2[Graph Email]
        C3[Graph Teams]
        C4[Git / SVN]
        C5[Zucchetti]
        C6[Browser]
    end

    subgraph RAW["② Raw files  —  data/raw/&lt;source&gt;/YYYY-MM.json"]
        R1[graph-calendar]
        R2[graph-email]
        R3[graph-teams]
        R4[git · svn]
        R5[zucchetti]
        R6[browser]
    end

    subgraph AGG["③ Aggregate  —  data/aggregated/YYYY-MM-DD.json"]
        A[AggregatedDay]
    end

    subgraph KB["④ Knowledge base  —  data/kb/us-summaries.json"]
        K[KbEntry&#91;&#93;]
    end

    subgraph PROMPT["⑤ Prompt builder  —  analyzer.ts"]
        AN["filterKbByPeriod\nsortKbByRelevance\nfitKbItems  ← provider.kbItemCap\nbuildUserPromptBatched"]
    end

    subgraph CHAIN["⑥ Provider chain  —  AnalyzerProvider&#91;&#93;"]
        P1[ClaudeApiProvider]
        P2[OpenAiCompatibleProvider]
        P3[GeminiProvider]
        P4[ClaudeCliProvider]
        P1 -->|fail| P2
        P2 -->|fail| P3
        P3 -->|fail| P4
    end

    subgraph OUT["⑦ Proposals  —  data/proposals/YYYY-MM-DD.json"]
        PR[DayProposal]
    end

    subgraph FE["⑧ Frontend  —  Vue 3"]
        FE1[Dashboard · AI Proposal card]
        FE2[Timesheet · TpSubmitPopover]
    end

    COLLECT --> RAW
    RAW     --> AGG
    AGG     --> PROMPT
    KB      --> PROMPT
    PROMPT  --> CHAIN
    CHAIN   --> OUT
    OUT     --> FE
```

---

## 2. Raw data sources — fields relevant to AI analysis

### 2.1 Graph Calendar → `CalendarEventRaw`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| `subject` | `calendar[].subject` | ✅ full text | Primary signal for meeting-task attribution |
| `start.dateTime` | `calendar[].start.dateTime` | ✅ sliced to `HH:mm` | Used to infer duration |
| `end.dateTime` | `calendar[].end.dateTime` | ✅ sliced to `HH:mm` | — |
| `attendees` | `calendar[].attendees` | ✅ count only | Full list stripped to reduce tokens |
| `isOnlineMeeting` | not forwarded | ❌ | Not in current prompt |
| `organizer` | not forwarded | ❌ | Not in current prompt |

### 2.2 Graph Email → `EmailRaw`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| *(all fields)* | `emails[]` | ✅ count only (`emailsReceived`) | Subject/body never sent to avoid privacy leakage and token waste |

### 2.3 Graph Teams → `TeamsMessageRaw`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| *(all fields)* | `teams[]` | ✅ count only (`teamsMessages`) | Message content never sent |

### 2.4 Git commits → `GitCommit`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| `repo` | `gitCommits[].repo` | ✅ | Helps attribute to projects |
| `message` | `gitCommits[].message` | ✅ | Key signal: contains `#TASKID` references |
| `hash`, `author`, `email`, `date` | aggregated | ❌ | Stripped from AI payload |

### 2.5 SVN commits → `SvnCommit`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| `message` | `svnCommits[].message` | ✅ | Same role as git commit messages |
| `revision`, `author`, `date`, `paths` | aggregated | ❌ | Stripped from AI payload |

### 2.6 Zucchetti → `ZucchettiDay`

| Raw field | Aggregated as | Sent to AI | Notes |
|-----------|---------------|------------|-------|
| `hOrd` | `oreTarget` (parsed to decimal) | ✅ | Core constraint: AI must fill exactly this many hours |
| `orario` | `isWorkday` flag | ✅ indirect | `"DOM"`/`"SAB"` → skip day entirely |
| `giustificativi[].text` | `location` (derived) | ✅ as `location` string | `"SMART WORKING"` → `"smart"`, office otherwise |
| `timbrature`, `hEcc`, `richieste` | `zucchetti` field | ❌ | Not forwarded to AI prompt |

### 2.7 Browser history → `BrowserVisit`

| Raw field | Sent to AI | Notes |
|-----------|------------|-------|
| `url`, `title`, `visitTime` | ❌ | Never sent — privacy + token cost |

---

## 3. Aggregation — `AggregatedDay` construction

```mermaid
flowchart TD
    subgraph Inputs["Monthly raw files (all sources)"]
        I1["graph-calendar/YYYY-MM.json\n→ CalendarEventRaw&#91;&#93;"]
        I2["graph-email/YYYY-MM.json\n→ EmailRaw&#91;&#93;"]
        I3["graph-teams/YYYY-MM.json\n→ TeamsMessageRaw&#91;&#93;"]
        I4["git/YYYY-MM.json\n→ GitCommit&#91;&#93;"]
        I5["svn/YYYY-MM.json\n→ SvnCommit&#91;&#93;"]
        I6["zucchetti/YYYY-MM.json\n→ ZucchettiDay&#91;&#93;"]
        I7["browser-*/YYYY-MM.json\n→ BrowserVisit&#91;&#93;"]
        I8["nibol/ (on-demand only)"]
    end

    subgraph Aggregator["aggregator.ts — per calendar day"]
        AGG["AggregatedDay\n─────────────────\ndate: YYYY-MM-DD\nisWorkday: bool  ← zucchetti.orario\noreTarget: float ← zucchetti.hOrd parsed\nlocation: enum   ← giustificativi keywords\nnibol: NibolBooking | null\nzucchetti: ZucchettiDay | null\ncalendar: CalendarEventRaw&#91;&#93;\nemails: EmailRaw&#91;&#93;\nteams: TeamsMessageRaw&#91;&#93;\ngitCommits: GitCommit&#91;&#93;\nsvnCommits: SvnCommit&#91;&#93;\nbrowserVisits: BrowserVisit&#91;&#93;"]
    end

    subgraph Output["data/aggregated/YYYY-MM-DD.json"]
        OUT[One file per calendar day]
    end

    I1 & I2 & I3 & I4 & I5 & I6 & I7 & I8 --> AGG --> OUT
```

**Location derivation** (from `giustificativi[].text`):

| Zucchetti text contains | `location` value |
|-------------------------|-----------------|
| `SMART WORKING` | `"smart"` |
| `TRASFERTA` | `"travel"` |
| `ESTERNO` | `"external"` |
| Office (no giustificativo) | `"office"` |
| Multiple matching | `"mixed"` |
| No Zucchetti data | `"unknown"` |

---

## 4. KB filtering and ranking

Before the AI prompt is built, the knowledge base (`KbEntry[]`) is reduced to the most relevant items for the batch period.

```mermaid
flowchart TD
    KB["us-summaries.json\nAll KbEntry items"]
    FILTER["filterKbByPeriod()\n─────────────────\nKeep open items always\nKeep closed items only if\ncreateDate or lastActivityDate\nis within ±window days of batch"]
    SORT["sortKbByRelevance()\n─────────────────\nScore each item:\n+10 if name/summary matches\n    a keyword from commit/calendar\n+5  if lastActivityDate == batch date\n+2  if lastActivityDate in window\n+1  if isFinalState === false\nSort descending"]
    FIT["fitKbItems()\n─────────────────\nSlice to fit char budget\n(60% of provider.maxInputChars)\nHard cap = 20 items for Ollama\nto prevent hallucinations"]
    PROMPT["KB section of prompt\narray of { id, entityType,\nname, summary? }"]

    KB --> FILTER --> SORT --> FIT --> PROMPT
```

**Why the 20-item hard cap for Ollama?**
Small local models (≤8B params) tend to hallucinate task IDs or invent tasks when given long KB lists. Restricting to the top-20 most relevant items drastically reduces fabricated attributions at the cost of slightly lower coverage.

---

## 5. Prompt construction

```mermaid
flowchart LR
    subgraph SystemPrompt["SYSTEM_PROMPT (static)"]
        SP["Rules:\n1. Output ONLY valid JSON array\n2. One object per day\n3. date + entries fields\n4. Sum of inferredHours == oreTarget\n5. Use signals to infer tasks\n6. Distribute remaining hours\n7. Keep pre-seeded entries"]
    end

    subgraph UserPrompt["buildUserPromptBatched()"]
        UP_KB["activeTasks: KbEntry&#91;&#93;\n(filtered + sorted + fitted)"]
        UP_DAYS["days&#91;&#93;:\n  date\n  oreTarget\n  remainingHours  ← oreTarget - recurring\n  location\n  signals:\n    calendarEvents&#91;&#93;  ← subject + HH:mm + attendees count\n    teamsMessages    ← count only\n    gitCommits&#91;&#93;     ← repo + message\n    svnCommits&#91;&#93;     ← message only\n    emailsReceived   ← count only\n  preSeededEntries&#91;&#93;  ← from defaults.json"]
        UP_INS["instruction: string"]
    end

    SystemPrompt --> Provider
    UP_KB & UP_DAYS & UP_INS --> Provider["AI Provider\n(JSON.stringify → string)"]
```

**What is stripped from the prompt (to save tokens):**

| Field present in `AggregatedDay` | Reason for exclusion |
|----------------------------------|----------------------|
| `browserVisits` | Privacy + irrelevant to task attribution |
| `emails[].subject/body` | Privacy; only count forwarded |
| `teams[].body.content` | Privacy; only count forwarded |
| `gitCommits[].hash/author/email/date` | Redundant; message+repo is sufficient |
| `svnCommits[].revision/author/date/paths` | Same as above |
| `zucchetti.*` (raw fields) | Already translated to `oreTarget` + `location` |
| `nibol.*` | Not relevant for task attribution |

---

## 6. `AnalyzerProvider` interface — common contract

All four provider implementations satisfy the same interface defined in `src/analysis/base.ts`. `analyzer.ts` never calls a provider directly — it only calls through the interface. This makes switching or adding providers transparent.

```mermaid
classDiagram
    class AnalyzerProvider {
        <<interface>>
        +string name
        +number maxInputChars
        +isAvailable() Promise~boolean~
        +analyzeBatch(system, user) Promise~DayResult[]~
    }

    class ClaudeApiProvider {
        +name = "claude:anthropic-api"
        +maxInputChars ← CLAUDE_MODEL_MAX_TPM × 4
        +isAvailable() probe via models.list()
        +analyzeBatch() Anthropic SDK messages.create()
    }

    class OpenAiCompatibleProvider {
        +name = "openai-compat"
        +maxInputChars ← OPENAI_MODEL_MAX_TPM × 4
        +isAvailable() probe via GET /models
        +analyzeBatch() SSE streaming /chat/completions
    }

    class GeminiProvider {
        +name = "gemini:&lt;model&gt;"
        +maxInputChars ← GEMINI_MODEL_MAX_TPM × 4
        +isAvailable() probe via models list REST
        +analyzeBatch() generateContent + responseSchema
    }

    class ClaudeCliProvider {
        +name = "claude:cli"
        +maxInputChars ← CLAUDE_CLI_MAX_TPM × 4
        +isAvailable() probe via claude --version
        +analyzeBatch() spawn claude -p
    }

    AnalyzerProvider <|.. ClaudeApiProvider
    AnalyzerProvider <|.. OpenAiCompatibleProvider
    AnalyzerProvider <|.. GeminiProvider
    AnalyzerProvider <|.. ClaudeCliProvider
```

**Common execution flow** — identical for every provider, enforced in `analyzeBatch()`:

```mermaid
sequenceDiagram
    participant ORC as analyzer.ts
    participant P   as AnalyzerProvider
    participant EXT as External API / process

    ORC->>P: isAvailable()
    P->>EXT: lightweight probe (model list / --version)
    EXT-->>P: ok / fail
    P-->>ORC: true / false

    ORC->>ORC: fitKbItems(sortedKb, provider.maxInputChars × 0.6)
    ORC->>ORC: buildUserPromptBatched(batch, kbItems, defaults)

    ORC->>P: analyzeBatch(systemPrompt, userPrompt)
    P->>EXT: API call / spawn
    EXT-->>P: raw response text
    P->>P: stripCodeFence() [+ stripJsonComments() for openai-compat]
    P->>P: JSON.parse()
    P-->>ORC: { date, entries }[]

    ORC->>ORC: discard results with dates outside batch window
    ORC->>ORC: recompute totalHours from entries
    ORC-->>ORC: DayProposal[]
```

**Where providers differ** (all other steps are identical):

| Step | ClaudeApiProvider | OpenAiCompatibleProvider | GeminiProvider | ClaudeCliProvider |
|------|-------------------|--------------------------|----------------|-------------------|
| Transport | Anthropic SDK | `fetch` SSE stream | `@google/genai` SDK | `spawn("claude", ["-p"])` |
| Structured output | ❌ (text + JSON.parse) | ❌ (+ stripJsonComments) | ✅ `responseSchema` | ❌ (text + JSON.parse) |
| Token usage logging | ✅ `input_tokens` / `output_tokens` | token count from stream | ❌ | ❌ |
| `kbItemCap` | ∞ (not declared) | **20** via `OPENAI_KB_ITEM_CAP` | ∞ (not declared) | ∞ (not declared) |
| Timeout env var | — | `OPENAI_REQUEST_TIMEOUT_MS` | — | — |

---

## 6b. Provider chain and token budgets

```mermaid
flowchart TD
    START([analyzeBatch called])
    P1{"ClaudeApiProvider\nANTHROPIC_API_KEY present?\nAPI reachable?"}
    P2{"OpenAiCompatibleProvider\nOPENAI_BASE_URL present?\n/models reachable?"}
    P3{"GeminiProvider\nGEMINI_API_KEY present?\nAPI reachable?"}
    P4{"ClaudeCliProvider\nclaude in PATH?"}
    ERR([Throw: no provider available])
    OK([Return DayProposal&#91;&#93;])

    START --> P1
    P1 -->|yes| OK
    P1 -->|no/fail| P2
    P2 -->|yes| OK
    P2 -->|no/fail| P3
    P3 -->|yes| OK
    P3 -->|no/fail| P4
    P4 -->|yes| OK
    P4 -->|no| ERR
```

| Provider | Default token budget | Env var | Notes |
|----------|---------------------|---------|-------|
| `ClaudeApiProvider` | 200 000 tokens → 800 000 chars | `CLAUDE_MODEL_MAX_TPM` | Anthropic API SDK |
| `OpenAiCompatibleProvider` | 5 000 tokens → 20 000 chars | `OPENAI_MODEL_MAX_TPM` | Ollama/LM Studio; SSE streaming |
| `GeminiProvider` | 1 000 000 tokens → 4 000 000 chars | `GEMINI_MODEL_MAX_TPM` | Structured output via `responseSchema` |
| `ClaudeCliProvider` | 200 000 tokens → 800 000 chars | `CLAUDE_CLI_MAX_TPM` | Claude Code subscription |

**Batch sizing:** The orchestrator uses the most restrictive active provider's budget to fit as many days as possible per API call, flushing the batch when the projected prompt exceeds the budget.

**Hallucination mitigations for local models (Ollama):**
- KB hard cap of 20 items (`fitKbItems`)
- `stripJsonComments` removes `//` comments injected by models like qwen2.5-coder
- Date validation: results with dates outside the batch window are silently discarded
- SSE streaming (`stream: true`) prevents proxy/OS TCP timeouts on long inference

**Gemini specifics:**
- Uses `responseMimeType: "application/json"` + `responseSchema` for structured output — eliminates code fences and malformed JSON entirely
- System prompt merged into user content (Gemini v1beta does not have a separate system role)

---

## 7. AI output — `DayProposal` and `ProposalEntry`


```mermaid
classDiagram
    class DayProposal {
        +string date
        +number oreTarget
        +number totalHours
        +ProposalEntry[] entries
        +string generatedAt
        +string provider
    }

    class ProposalEntry {
        +number|null taskId
        +string entityType
        +string taskName
        +number inferredHours
        +string confidence
        +string reasoning
        +boolean approved
    }

    DayProposal "1" --> "*" ProposalEntry
```

**`entityType` values:** `UserStory` | `Task` | `Bug` | `recurring`

**`confidence` values:** `high` | `medium` | `low`

**Constraint enforced in prompt:** `sum(entries[].inferredHours) === oreTarget`

The orchestrator validates results post-parse:
- Dates outside the batch window → discarded (hallucination guard)
- `totalHours` is recomputed from entries (not trusted from model output)

---

## 8. Frontend consumption

```mermaid
flowchart TD
    API["GET /api/day/:date\n(Express — src/server/routes/day.ts)"]
    STORE["useDayStore.ts\nactiveTasks computed:\n  commits = git&#91;dayIdx&#93; + svn&#91;dayIdx&#93;\n  meetings = calEvents.length\n  proposal = DayProposal from /api/day"]
    TS_STORE["useTimesheetStore.ts\nhoursEdits: Map&lt;tpId_dayIdx, hours&gt;\nbuildEdits() → TP submission payload"]

    subgraph Dashboard["Dashboard view"]
        D1["StatStrip · AI Proposal card\n→ provider, generatedAt, entry count"]
        D2["StatStrip · Commits card\n→ git+svn count for selected day"]
        D3["DayTimeline\n→ calendar events"]
    end

    subgraph Timesheet["Timesheet view"]
        T1["TsRow (pinned rows)\n→ commit dots per day\n→ hh:mm hours\n→ TsNoteCell per day"]
        T2["TsTpBar · Analizza\n→ POST /api/analyze/week/:date\n→ polls /api/analyze/status/:jobId"]
        T3["TpSubmitPopover\n→ review pending edits\n→ POST /api/tp/time-entries"]
    end

    API --> STORE --> D1 & D2 & D3
    API --> TS_STORE --> T1 & T3
    T2 -->|force=true| API
```

### VCS signal attribution (client-side)

Commit messages are parsed client-side in `useTimesheetStore.fetchWeekData()` using:

```
/#(\d{5,6})\b/g
```

This maps each git/svn commit to the TP task IDs found in its message, building `TsRow.git[dayIdx]` and `TsRow.svn[dayIdx]` count arrays. These drive the commit dot badges in pinned rows and the `commits` count in `StatStrip`.

### Proposal → timesheet pre-fill flow

Currently proposals are read via `/api/day/:date` and displayed in the **AI Proposal** card on the Dashboard. Direct pre-population of `hoursEdits` from proposal entries is a planned feature (not yet implemented).

---

## 9. Data freshness and re-analysis triggers

```mermaid
stateDiagram-v2
    [*] --> NoData : day not yet collected
    NoData --> Aggregated : npm run collect + aggregate
    Aggregated --> Analyzed : Analizza button (POST /api/analyze/week)
    Analyzed --> Analyzed : re-open portal (cached on disk)
    Analyzed --> Aggregated : force=true (↺ Rigenera button)
    Aggregated --> Analyzed : analyzeBatch()

    note right of Analyzed
        data/proposals/YYYY-MM-DD.json exists
        Skipped on next run unless force=true
    end note
```

**API endpoints for analysis:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze/:date` | POST | Analyze single day (202 + jobId) |
| `/api/analyze/week/:date` | POST | Analyze all workdays in week (202 + jobId) |
| `/api/analyze/status/:jobId` | GET | Poll job status |
| `/api/sync` | POST | Re-collect Zucchetti + Nibol + re-aggregate for day/week |
