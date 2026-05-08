# FE Hours State Analysis — Design Issues

**Data:** 2026-05-08  
**Scope:** gestione ore TP, hint AI, draft locali nel timesheet Vue

## File coinvolti

| File | Ruolo |
|------|-------|
| `web/src/stores/useTimesheetStore.ts` | store principale: serverHours, hoursEdits, pendingSubmissions, getHours |
| `web/src/stores/useAnalysisStore.ts` | store AI: weekHints (proposals da server), status hint |
| `web/src/components/timesheet/TsRow.vue` | celle task: acceptHint, computeCellMode, TimeCellWidget |
| `web/src/components/timesheet/TsTotals.vue` | righe Ore TP / Zucchetti / Delta |
| `web/src/components/timesheet/TsVerificaModal.vue` | riepilogo settimana + contatore pending |
| `web/src/components/TimeCellWidget.vue` | widget ±0.5h / input / clear |
| `web/src/api.ts` | fetchTpWeekHours, fetchWeekProposals, submitWeekHours, saveProposal |
| `data/proposals/YYYY-MM-DD.json` | proposals AI persistiti su disco (server-side) |

---

## 1. I tre layer di dati

```
serverHours    allTasks[row].hours[dayIdx]       da fetchTpWeekHours — stato reale su TP
hoursEdits     localStorage "ts.draft_hours"     draft locale utente (priority override)
weekHints      data/proposals/*.json (server)    suggerimenti AI con campo status
```

### `getHours(tpId, dayIdx)` — unica funzione, due semantiche

```typescript
if (key in hoursEdits.value) return hoursEdits.value[key]; // draft locale
return serverHours;                                         // TP reale
```

**Problema:** un'unica lettura per "cosa c'è su TP adesso" e "cosa voglio inviare".
Non esiste modo programmatico di distinguere i due senza accedere direttamente a `allTasks`.

---

## 2. Come entra qualcosa in `pendingSubmissions`

### Path A — edit manuale
```typescript
hasManual = key in hoursEdits.value
→ targetHours = hoursEdits[key]
→ filtrato se |targetHours - serverHours| < 0.05
```

### Path B — hint AI ✅ opt-in dopo B1
```typescript
hint = getHint(tpId, i, monday)               // null se dismissed
skip se: !hint || inferredHours <= 0 || status !== "accepted"   // B1: solo "accepted"
skip se: serverHours > 0
→ targetHours = hint.inferredHours
```

### Conflitto tra path

| Condizione | Cosa succede |
|---|---|
| `hoursEdits[key]` esiste | Path A vince, Path B ignorato |
| `hoursEdits[key]` assente, hint `"suggested"` | ~~Path B → auto-queued~~ **✅ ignorato (B1 fix)** |
| `hoursEdits[key]` assente, hint `"accepted"` | Path B safety net (se hoursEdits perso) |
| `hoursEdits[key]` assente, hint `"applied"` | nessuno dei due → corretto, già su TP |
| `hoursEdits[key]` esiste, hint qualsiasi | Path A invia il valore edit |

---

## 3. ✅ FIXED (B1): hint opt-out → opt-in

~~Status default dopo analisi AI = `"suggested"`. `pendingSubmissions` include tutti gli hint `!== "applied"`. → ogni proposta AI è auto-queued per l'invio a TP senza azione esplicita dell'utente.~~

**Fix:** Path B ora filtra `status !== "accepted"` → solo hint esplicitamente accettati entrano in pendingSubmissions. `acceptHint()` e `quickAdd()` scrivono `"accepted"` su disco (era `"applied"`). Hint `"suggested"` sono visibili nell'UI ma non auto-queued.

---

## 4. ✅ FIXED (B3): flusso `acceptHint` + `"overridden"`

```typescript
// TsRow.vue → acceptHint()
ts.setHours(props.row.tpId, dayIdx, hint.inferredHours); // scrive hoursEdits
analysis.setEntryStatus(dateStr, props.row.tpId, "accepted"); // ✅ era "applied"

// TsRow.vue → handleCellUpdate() — modifica post-accept
ts.setHours(props.row.tpId, dayIdx, val);
if (hint?.status === "accepted" && val !== hint.inferredHours)
    analysis.setEntryStatus(dateStr, props.row.tpId, "overridden"); // ✅ nuovo
```

**Sequenza dopo fix:**

1. Accept hint 3h → `hoursEdits[key] = 3`, hint `"accepted"` su disco
2. Utente modifica a 4h → `hoursEdits[key] = 4`, hint → `"overridden"` su disco
3. `computeCellMode()` → `hint-differ`: widget mostra 4h con hint 3h come riferimento passivo
4. ~~Nessun modo di tornare~~ → `inferredHours` ancora visibile come `hint-val` in `TimeCellWidget`

> Nota: il layer `acceptedHints` separato (proposta §9) non è stato implementato — `hoursEdits` continua a contenere sia edit manuali che valori da hint accepted. Lo stato su disco (`"accepted"` / `"overridden"`) distingue i due casi.

---

## 5. ✅ FIXED (B2): dismiss ora cancella `hoursEdits`

```typescript
// TsRow.vue → dismissHint()
function dismissHint(dayIdx: number) {
    analysis.dismissHint(props.row.tpId, dayIdx, ts.currentMonday); // status "dismissed" su disco
    ts.clearCellEdit(props.row.tpId, dayIdx);                        // ✅ delete hoursEdits + noteEdits
}
```

`clearCellEdit(tpId, dayIdx)` aggiunto a `useTimesheetStore` — rimuove sia `hoursEdits[key]` che `noteEdits[key]`. Dismiss ora è idempotente: il submit non include più la cella dismessa.

---

## 6. ✅ FIXED (B4): `TsVerificaModal` ora mostra TP ora vs Da inviare

```typescript
// useTimesheetStore — nuovo computed
const serverTotalsRow = computed(() =>
    days.value.map((_, i) =>
        +allRowsFlattened.value.reduce((acc, r) => acc + (r.hours?.[i] ?? 0), 0).toFixed(1)
    )
);
```

`TsVerificaModal` ora mostra tre colonne distinte: **Zucchetti** | **TP ora** (serverTotalsRow — reale su TP) | **Da inviare** (totalsRow.tp — post-edit intended). Celle "TP ora" in giallo quando divergono da "Da inviare".

---

## 7. ✅ FIXED (B5): invio di `0` ora mostra warning esplicito

`pendingSubmissions` ora include `isDelete: targetHours === 0 && serverHours > 0`.  
`TsVerificaModal` mostra alert rosso prima del submit:

```
⚠ Attenzione: N entry verranno cancellate da TP (ore → 0): Task A, Task B
```

Il comportamento delete su TP è invariato (0 = delete), ma l'utente è informato prima di confermare.

---

## 8. Mappa del problema — stato dopo fix

| Azione utente | ~~Effetto precedente~~ | Effetto attuale |
|---|---|---|
| Carica settimana con proposals su disco | ~~hint auto-queued~~ | hint visibili come suggerimenti, non in pending ✅ |
| Accept hint, poi modifica ore | ~~hint "applied", no traccia~~ | hint → "overridden", `inferredHours` resta come ref passiva ✅ |
| Dismiss hint già accepted | ~~hoursEdits rimane, ore inviate~~ | `clearCellEdit()` rimuove il draft ✅ |
| Clear site data | hoursEdits svuotato, hints ricaricati da server | invariato (by design) |
| Imposta ore a 0 su entry esistente | ~~delete silenzioso~~ | warning rosso nel modal pre-submit ✅ |

---

## 9. Refactor proposto

### Separare i tre layer esplicitamente

```typescript
serverHours   // solo lettura — mai esposto come "ore correnti" nel widget
draftHours    // solo edit manuali puri (non da accept hint)
acceptedHints // hint accettati — separati da draftHours
```

### Nuovi status hint

```
"suggested"   → visibile nell'UI, NON in pendingSubmissions (opt-in)
"accepted"    → in pendingSubmissions via path dedicato
"overridden"  → utente ha accettato poi modificato — mostra tooltip con valore hint originale
"applied"     → già inviato a TP
"dismissed"   → nascosto + pulisce acceptedHints/draftHours per quella cella
```

### `pendingSubmissions` pulito

```
Path A: draftHours    (edit manuali puri, incluso delete esplicito con warning)
Path B: acceptedHints con status "accepted" o "overridden"
```

### `dismissHint` corretto

```typescript
function dismissHint(tpId, dayIdx, monday) {
    setEntryStatus(date, tpId, "dismissed");
    // pulisce anche il draft locale per quella cella
    delete hoursEdits.value[`${tpId}_${dayIdx}`];
    delete acceptedHints.value[`${tpId}_${dayIdx}`];
}
```

### `acceptHint` corretto

```typescript
function acceptHint(tpId, dayIdx, hintHours) {
    acceptedHints.value[`${tpId}_${dayIdx}`] = hintHours; // non tocca hoursEdits
    setEntryStatus(date, tpId, "accepted");
}
```

### Modifica post-accept

```typescript
// TimeCellWidget @update su cella con hint "accepted"
hoursEdits.value[key] = newVal;           // draft manuale
setEntryStatus(date, tpId, "overridden"); // hint resta visibile come riferimento
```

### `TsVerificaModal` separato

Aggiungere colonna "Attuale TP" (serverHours) e "Da inviare" (draftHours + acceptedHints)
per mostrare la diff prima di submitWeekHours.

---

## 10. Cosa vive in localStorage (e cosa no)

localStorage persiste **solo draft utente e preferenze UI** — non dati server.

| Chiave localStorage | Store | Contenuto | Vuoto/default se... |
|---|---|---|---|
| `ts.draft_hours` | TimesheetStore | `hoursEdits` | nessuna modifica manuale pending |
| `ts.draft_notes` | TimesheetStore | `noteEdits` | nessuna nota pending |
| `ts.extra_tasks` | TimesheetStore | `usExtra` | nessun task extra aggiunto |
| `ui.prefs` | UiStore | `activeView`, `weVisible`, `browserExpanded`, `quickFilterSignals`, `pinnedFilterSignals`, `quickSort`, `pinnedSort` | default store |
| `picker.selection` | PickerStore | `pickerSelected`, `pickerMonth` | data odierna |

**Non finiscono mai in localStorage:**

- `allTasks[]` / `serverHours` — fetchati da `GET /api/week/:date/tp-hours` ad ogni mount
- `weekHints` — ricaricati da `data/proposals/*.json` via `loadWeekHints()`
- `days[]`, `weekData` — fetchati da `GET /api/week/:date`

Vedere `hoursEdits: {}` su una settimana storica è **corretto**: significa zero draft pending
per quella settimana. Le ore già loggate su TP non sono mai in localStorage.

---

## 11. Fix — stato implementazione

| # | Bug | Stato | File modificati |
|---|-----|-------|----------------|
| **B1** | hint `suggested` auto-queued (opt-out) | ✅ **Implementato** | `useTimesheetStore.ts`, `TsRow.vue` |
| **B2** | `dismissHint()` non pulisce `hoursEdits` | ✅ **Implementato** | `useTimesheetStore.ts`, `TsRow.vue` |
| **B3** | nessuno stato `overridden` post-accept+modifica | ✅ **Implementato** (parziale: status su disco, no `acceptedHints` layer) | `shared/analysis.ts`, `TsRow.vue` |
| **B4** | `TsVerificaModal` mostra stato ambiguo | ✅ **Implementato** | `useTimesheetStore.ts`, `TsVerificaModal.vue` |
| **B5** | `hours: 0` = delete silenzioso | ✅ **Implementato** | `useTimesheetStore.ts`, `TsVerificaModal.vue` |

**Residuo non implementato:** layer `acceptedHints` separato da `hoursEdits` (B3 full refactor). Attualmente `hoursEdits` contiene sia edit manuali che valori da hint accepted — distinti solo dallo stato su disco.
