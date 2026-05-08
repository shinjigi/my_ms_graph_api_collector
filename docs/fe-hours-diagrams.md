# FE Hours — Diagrammi architetturali

**Scope:** hint AI, draft locali, sincronizzazione FE↔BE↔TP  
**Complementare a:** `fe-hours-state-analysis.md`

---

## 1. Struttura dati e layer di persistenza

```mermaid
classDiagram
    direction TB

    class ProposalEntry {
        +taskId : number
        +inferredHours : number
        +confidence : high|medium|low
        +status : suggested|applied|dismissed
        +comment : string
        +reasoning : string
    }

    class DayProposal {
        +date : string
        +entries : ProposalEntry[]
        +provider : string
        +generatedAt : string
    }

    class TimesheetStore {
        <<Pinia store — memory>>
        allTasks : TsRow[]
        hoursEdits : Record~string,number~
        noteEdits : Record~string,string~
        currentMonday : Date
        pendingSubmissions : computed
        ——
        getHours(tpId, dayIdx) number
        setHours(tpId, dayIdx, val) void
        submitWeekHours() Promise
        clearEdits() void
    }

    class AnalysisStore {
        <<Pinia store — memory>>
        weekHints : Record~string,DayProposal~
        ——
        getHint(tpId, dayIdx, monday) ProposalEntry|null
        dismissHint(tpId, dayIdx, monday) void
        setEntryStatus(date, tpId, status) Promise
        loadWeekHints(monday) Promise
    }

    class LocalStorage {
        <<Browser — persiste su setHours()>>
        portal_hours → hoursEdits
        portal_ts_notes → noteEdits
        portal_us_extra → usExtra
    }

    class ProposalsDisk {
        <<data/proposals/YYYY-MM-DD.json>>
        DayProposal (JSON)
    }

    class ExpressServer {
        <<Express — localhost:3001>>
        GET  /api/week/:date/tp-hours
        POST /api/week/:date/submit
        GET  /api/proposals/:date
        PATCH /api/proposals/:date
        POST /api/analyse/:date
    }

    class TargetProcess {
        <<TargetProcess API — esterno>>
        ore loggate per task
    }

    TimesheetStore --> LocalStorage : persiste ogni setHours()
    TimesheetStore --> ExpressServer : GET tp-hours<br />POST submit
    AnalysisStore --> ExpressServer : GET proposals<br />PATCH proposals
    ExpressServer --> ProposalsDisk : read/write JSON
    ExpressServer --> TargetProcess : logga ore
    AnalysisStore "1" *-- "0..7" DayProposal : weekHints[YYYY-MM-DD]
    DayProposal "1" *-- "1..*" ProposalEntry
```

### Chiave: cosa vive dove

| Dato | Dove | Quando scritto | Quando letto |
|------|------|----------------|--------------|
| `allTasks[].hours[]` | memory (Pinia) | `fetchWeekData()` | `getHours()` fallback |
| `hoursEdits[tpId_i]` | **localStorage** `portal_hours` | ogni `setHours()` | `getHours()` priority, `pendingSubmissions` Path A |
| `noteEdits[tpId_i]` | **localStorage** `portal_ts_notes` | ogni `setNote()` | `getNote()` |
| `weekHints[date]` | memory (Pinia) | `loadWeekHints()` | `getHint()`, `pendingSubmissions` Path B |
| `ProposalEntry.status` | **disk** `data/proposals/*.json` | `setEntryStatus()` via PATCH | `loadWeekHints()` su mount / post-analisi |
| ore loggate | **TargetProcess** | `submitWeekHours()` | `fetchTpWeekHours()` |

---

## 2. Ciclo di vita di un hint — stato post-fix

```mermaid
stateDiagram-v2
    direction LR

    [*] --> suggested : POST /api/analyse/:date<br />AI → proposals/*.json status="suggested"<br />loadWeekHints() ricarica weekHints

    suggested --> accepted : acceptHint() o quickAdd()<br />① setHours() → ts.draft_hours localStorage<br />② setEntryStatus("accepted") → PATCH proposals/*.json

    accepted --> overridden : handleCellUpdate(val != inferredHours)<br />hoursEdits[key] aggiornato<br />setEntryStatus("overridden") → PATCH proposals/*.json

    accepted --> dismissed : dismissHint()<br />① setEntryStatus("dismissed") → PATCH<br />② clearCellEdit() → rimuove hoursEdits[key] ✅

    overridden --> dismissed : dismissHint()<br />clearCellEdit() rimuove hoursEdits[key] ✅

    suggested --> dismissed : dismissHint()<br />clearCellEdit() (no-op se nessun edit)

    accepted --> [*] : submitWeekHours() OK<br />hoursEdits[key] rimosso<br />clearWeekHints() svuota memory<br />serverHours aggiornato da TP

    overridden --> [*] : submitWeekHours() OK<br />(stesso path di accepted)

    dismissed --> [*] : hint invisibile in UI<br />hoursEdits[key] rimosso ✅<br />nessun pending

    note right of suggested
        NOT in pendingSubmissions ✅
        (opt-in: richiede azione utente)
    end note

    note right of accepted
        Path A: hoursEdits[key] = inferredHours
        Path B safety net se hoursEdits perso
        computeCellMode = hint-match o hint-differ
    end note

    note right of overridden
        Path A: hoursEdits[key] = val modificato
        hint-val ancora visibile come riferimento
        computeCellMode = hint-differ
    end note
```

---

## 3. Sequence: caricamento settimana

```mermaid
sequenceDiagram
    participant U  as Utente
    participant FE as Vue (mount)
    participant TS as TimesheetStore
    participant AS as AnalysisStore
    participant BE as Express
    participant TP as TargetProcess
    participant DISK as proposals/*.json

    U->>FE: naviga /#/timesheet/YYYY-MM-DD
    FE->>TS: fetchWeekData(monday)
    par TP hours
        TS->>BE: GET /api/week/:date/tp-hours
        BE->>TP: query ore settimanali per task
        TP-->>BE: entries[]{tpId, hours[5], notes[5]}
        BE-->>TS: ApiTpWeekResponse
        TS->>TS: allTasks = entries (memory)<br />serverHours = hours[]
    and Week signals
        TS->>BE: GET /api/week/:date
        BE-->>TS: ApiWeekResponse (zucHours, holiday…)
        TS->>TS: days[] aggiornato
    end
    FE->>AS: loadWeekHints(monday)
    AS->>BE: GET /api/proposals/:date ×5 (Mon–Fri)
    BE->>DISK: readJson(YYYY-MM-DD.json) ×5
    DISK-->>BE: DayProposal[]
    BE-->>AS: {proposal, signals} ×5
    AS->>AS: weekHints[date] = DayProposal (memory)

    Note over FE,DISK: localStorage già caricato da Pinia persist plugin (hoursEdits, noteEdits)

    FE->>FE: render: getHours() = hoursEdits[key] ?? serverHours<br />computeCellMode() = hint-only | user-edit | hint-match | hint-differ | clean
```

---

## 4. Sequence: richiesta analisi AI

```mermaid
sequenceDiagram
    participant U  as Utente
    participant FE as Vue
    participant AS as AnalysisStore
    participant BE as Express
    participant AI as AI Provider
    participant DISK as proposals/*.json
    participant AGG as aggregated/*.json

    U->>FE: click "Analizza settimana"
    FE->>AS: runWeek(date, force)
    AS->>BE: POST /api/analyse/week/:date
    BE-->>AS: {jobId}
    AS->>AS: startPolling() ogni 2s

    loop polling
        AS->>BE: GET /api/analyse/status/:jobId
        BE-->>AS: {status: "pending"|"running"|"done"}
    end

    BE->>AGG: legge segnali aggregati (calendar, email, teams, vcs…)
    BE->>AI: prompt + segnali + master-rules.md
    AI-->>BE: ProposalEntry[] con inferredHours e status="suggested"
    BE->>DISK: writeJson(YYYY-MM-DD.json, DayProposal)

    BE-->>AS: {status: "done", completed: {date: DayProposal}}
    AS->>AS: stopPolling()
    AS->>BE: GET /api/proposals/:date ×5
    DISK-->>AS: DayProposal aggiornati
    AS->>AS: weekHints aggiornati (memory)
    FE->>FE: re-render: celle con status="suggested" → hint-only button (pulsante)
```

---

## 5. Sequence: accept hint

```mermaid
sequenceDiagram
    participant U  as Utente
    participant VC as TsRow.vue
    participant TS as TimesheetStore
    participant AS as AnalysisStore
    participant LS as localStorage
    participant BE as Express
    participant DISK as proposals/*.json

    U->>VC: click hint button (modo hint-only)
    VC->>VC: acceptHint(dayIdx)
    VC->>TS: setHours(tpId, dayIdx, hint.inferredHours)
    TS->>TS: hoursEdits["tpId_i"] = inferredHours
    TS->>LS: persist ts.draft_hours
    VC->>TS: setNote(tpId, dayIdx, hint.comment)
    TS->>LS: persist ts.draft_notes

    VC->>AS: setEntryStatus(dateStr, tpId, "accepted")
    AS->>AS: entry.status = "accepted" (weekHints in memory)
    AS->>BE: PATCH /api/proposals/:date {entries: [...]}
    BE->>DISK: writeJson(YYYY-MM-DD.json, updated DayProposal)
    DISK-->>BE: ok
    BE-->>AS: DayProposal aggiornato

    Note over TS: pendingSubmissions Path A (hoursEdits wins)<br />Path B safety net (status="accepted" AND serverHours==0)
    Note over VC: computeCellMode() → hint-match o hint-differ<br />(non più hint-only)
```

---

## 6. Sequence: dismiss hint

```mermaid
sequenceDiagram
    participant U  as Utente
    participant VC as TsRow.vue
    participant AS as AnalysisStore
    participant TS as TimesheetStore
    participant LS as localStorage
    participant BE as Express
    participant DISK as proposals/*.json

    U->>VC: click ✕ (dismiss button)
    VC->>VC: dismissHint(dayIdx)
    VC->>AS: analysis.dismissHint(tpId, dayIdx, monday)
    AS->>AS: setEntryStatus(date, tpId, "dismissed")
    AS->>AS: weekHints[date].entry.status = "dismissed" (memory)
    AS->>BE: PATCH /api/proposals/:date {entries: [...]}
    BE->>DISK: writeJson(YYYY-MM-DD.json)
    BE-->>AS: ok
    VC->>TS: ts.clearCellEdit(tpId, dayIdx)
    TS->>TS: delete hoursEdits["tpId_i"]
    TS->>TS: delete noteEdits["tpId_i"]
    TS->>LS: persist ts.draft_hours (chiave rimossa)

    Note over AS: getHint() → null (filtra dismissed)
    Note over VC: computeCellMode() → clean (hint button sparisce)
    Note over TS,LS: ✅ hoursEdits[key] rimosso — nessun pending al submit
```

---

## 7. Sequence: modifica ore post-accept

```mermaid
sequenceDiagram
    participant U  as Utente
    participant VC as TsRow.vue / TimeCellWidget
    participant TS as TimesheetStore
    participant AS as AnalysisStore
    participant LS as localStorage
    participant DISK as proposals/*.json

    Note over U,DISK: Stato iniziale: acceptHint() già fatto<br />hoursEdits["tpId_i"] = 3h, status="accepted" su disco

    U->>VC: modifica ore da 3h a 4h (TimeCellWidget @update)
    VC->>VC: handleCellUpdate(dayIdx, 4)
    VC->>TS: setHours(tpId, dayIdx, 4)
    TS->>TS: hoursEdits["tpId_i"] = 4
    TS->>LS: persist ts.draft_hours

    VC->>VC: hint.status === "accepted" && 4 !== 3 → setEntryStatus("overridden")
    VC->>AS: setEntryStatus(dateStr, tpId, "overridden")
    AS->>AS: entry.status = "overridden" (memory)
    AS->>BE: PATCH /api/proposals/:date {entries: [...]}
    BE->>DISK: writeJson — status="overridden" persistito

    Note over VC: computeCellMode() → hint-differ (4h != 3h hint)<br />hint-val=3h ancora visibile come riferimento passivo ✅
    Note over AS,DISK: ✅ status "overridden" su disco — distingue accepted da modified
```

---

## 8. Sequence: submit settimana

```mermaid
sequenceDiagram
    participant U  as Utente
    participant FE as Vue (TsVerificaModal)
    participant TS as TimesheetStore
    participant AS as AnalysisStore
    participant LS as localStorage
    participant BE as Express
    participant TP as TargetProcess
    participant DISK as proposals/*.json

    U->>FE: click "Invia settimana"
    FE->>TS: submitWeekHours()
    TS->>TS: pendingSubmissions computed<br />(Path A: hoursEdits, Path B: hints accepted+serverHours==0)

    TS->>BE: POST /api/week/:date/submit {edits: SubmitEdit[]}
    BE->>TP: logga ore per ogni entry (tpId, date, hours, description)
    TP-->>BE: risultati (ok/errors)
    BE-->>TS: {errors: []}

    TS->>TS: rimuove da hoursEdits le entry andate a buon fine
    TS->>LS: persist portal_hours (aggiornato)
    TS->>AS: clearWeekHints()
    AS->>AS: weekHints = {} (svuota memoria)

    Note over AS,DISK: weekHints svuotato in memoria ma proposals/*.json rimane su disco<br />col status="accepted"/"overridden" — ricaricato alla prossima loadWeekHints()<br />serverHours > 0 dopo submit → Path B non re-queued

    TS->>BE: GET /api/week/:date + GET /api/week/:date/tp-hours (force reload)
    BE->>TP: ore aggiornate
    TP-->>BE: serverHours aggiornati
    BE-->>TS: allTasks[] aggiornato
    FE->>FE: re-render: celle mostrano serverHours<br />hoursEdits vuoto → nessun draft pending
```

---

## 9. Logic di `pendingSubmissions` — decision tree

```mermaid
flowchart TD
    A[per ogni row × dayIdx] --> B{hoursEdits<br />tpId_i esiste?}
    B -- sì --> C[Path A<br />targetHours = hoursEdits<br />key]
    B -- no --> D{getHint<br />retorna hint?}
    D -- no / dismissed --> SKIP[skip]
    D -- sì --> E{hint.status<br />== accepted?}
    E -- no --> SKIP
    E -- sì --> F{serverHours<br />> 0?}
    F -- sì --> SKIP
    F -- no --> G[Path B safety net<br />targetHours = hint.inferredHours<br />isHint = true]
    C --> H{abs targetHours<br />- serverHours < 0.05?}
    G --> H
    H -- sì --> SKIP
    H -- no --> INCLUDE[include in pendingSubmissions]

    style B fill:#2d4a6b
    style E fill:#2d4a6b
    style F fill:#2d4a6b
    style H fill:#2d4a6b
    style SKIP fill:#3a3a3a
    style INCLUDE fill:#1a5c1a
    style G fill:#5c3a1a
    style C fill:#1a3d5c
```

---

## Riepilogo bug / gap — stato implementazione

| # | Bug/Gap | Path | Stato |
|---|---------|------|-------|
| B1 | hint `suggested` auto-queued senza azione utente | Path B | ✅ Path B filtra `status !== "accepted"` |
| B2 | `dismissHint()` non pulisce `hoursEdits` | Path A | ✅ `dismissHint()` chiama `clearCellEdit()` |
| B3 | nessuno stato `overridden` per accept+modifica | Path A | ✅ `handleCellUpdate()` → `"overridden"` su disco |
| B4 | `TsVerificaModal` mostra `getHours()` non `serverHours` | display | ✅ colonna "TP ora" (`serverTotalsRow`) + "Da inviare" |
| B5 | `hours: 0` invia delete silenzioso su entry TP esistente | Path A | ✅ `isDelete` flag + alert rosso nel modal |

**Residuo:** layer `acceptedHints` separato da `hoursEdits` (B3 full refactor) — non implementato. `hoursEdits` contiene ancora sia edit manuali che valori accepted; il tipo su disco (`accepted`/`overridden`) li distingue.
