# Discrepanze Documentazione ↔ Codice

> Generato il: 2026-03-31 — Aggiornato dopo correzioni applicate  
> ✅ = corretto nella stessa sessione | ⏳ = da fare/verificare manualmente  
> Analisi effettuata su: README.md, CLAUDE.md, DEVELOPER.md, FUNCTIONAL.md, docs/OPERATOR.md, docs/DATA-STRATEGY.md, docs/azure-guide.md, docs/plans/*

---

## 🔴 ERRORI / INCOERENZE SIGNIFICATIVE

### 1. `graphClient.js` vs `graphClient.ts`

**File:** `DEVELOPER.md` (riga 13), `CLAUDE.md` (riga 62)  
**Problema:** Entrambi i documenti riferiscono il file come `graphClient.js` con nota `(CJS)`. Il file reale nel progetto è `src/graphClient.ts` (TypeScript puro, non un `.js`).

```
# DEVELOPER.md (riga 13):
│   ├── graphClient.js                  # MSAL device-code auth + Graph client (CJS)
                                                           ^^ SBAGLIATO: è .ts

# CLAUDE.md (riga 62):
`graphClient.js` uses MSAL's `PublicClientApplication` ...
```

**Realtà nel codice:** Il file `src/graphClient.ts` è TypeScript al 100%, usa import ES (`import * as fs from 'node:fs'`) e viene compilato da `tsx` a runtime. Non è un modulo CommonJS distinto.

---

### 2. Fallback chain del provider AI — catena errata/incompleta

**File:** `CLAUDE.md` (riga 33), `DEVELOPER.md` (riga 268–282), `DATA-STRATEGY.md` (riga 81–83), `FUNCTIONAL.md` (riga 135)  
**Problema:** La documentazione descrive la fallback chain come `Claude API → Gemini → Claude CLI` (3 provider). Il codice reale ha **4 provider**:

```typescript
// src/analysis/analyzer.ts (riga 169–170):
// Default order: Claude API → Ollama/OpenAICompat → Gemini → Claude CLI
return [all["claude"], all["ollama"], all["gemini"], all["cli"]];
```

L'`OpenAiCompatibleProvider` (Ollama/LM Studio/OpenRouter) è il **secondo provider** nella chain, frapposto tra Claude API e Gemini — completamente assente da tutta la documentazione del fallback.

Anche il diagramma mermaid in `DEVELOPER.md` è errato:
```
# DEVELOPER.md (riga 270–281):
A{CLAUDE_API_KEY set?} → B[Anthropic SDK]
                       ↓ no
C{OPENAI_BASE_URL set?} → D[OpenAI-compatible HTTP]
                        ↓ no
E[claude CLI -p]

# Manca Gemini! Il CLI è l'ultimo, ma Gemini è rimasto fuori dal diagramma.
```

**Realtà:** `Claude API → OpenAI-compat (Ollama etc.) → Gemini → Claude CLI`

---

### 3. Provider names — nomi interni diversi da quelli documentati

**File:** `CLAUDE.md` (riga 11)  
**Problema:** La documentazione usa i nomi "claude", "gemini", "cli" per i provider. Il codice usa nomi interni diversi nei log:

```typescript
// claudeProvider.ts:
readonly name = "claude:anthropic-api"   // ← non "claude"
readonly name = "openai-compat"          // ← non documentato
readonly name = "claude:cli"             // ← non "cli"
```

Solo `GeminiProvider` usa `"gemini"` come nome. Questo impatta i log operativi e potrebbe confondere chi monitora i log.

---

### 4. `FUNCTIONAL.md` — Nibol collector nel posto sbagliato

**File:** `FUNCTIONAL.md` (riga 277)  
**Problema:**
```
# FUNCTIONAL.md (riga 277):
Nibol is the desk booking system. `src/collectors/nibol.ts` uses Playwright ...
```

Il file `src/collectors/nibol.ts` **non esiste**. Il collector Nibol è in `src/collectors/nibol/index.ts` (directory con file `index.ts`). Gli script di booking sono in `scripts/nibol/` (book_desk.ts, getCalendar.ts).

---

### 5. `DEVELOPER.md` — `collectorGemini.ts` non esiste

**File:** `DEVELOPER.md` (riga 51)  
**Problema:**
```
│   │   └── collectorGemini.ts          # KB update via Gemini
```

Il file `src/targetprocess/collectorGemini.ts` **non esiste**. La funzionalità Gemini per il KB è implementata direttamente dentro `src/targetprocess/collector.ts` come classe `GeminiKbProvider`. Non è un file separato.

---

### 6. `DEVELOPER.md` — Route `analyze.ts` non nella lista directory ma nel codice

**File:** `DEVELOPER.md` (riga 43), `src/server/app.ts`  
**Problema:** Il server monta **due route aggiuntive** non documentate nella struttura directory:

```typescript
// src/server/app.ts:
import { signalsRouter } from './routes/signals';   // /api/day
import { syncRouter }    from './routes/sync';       // /api/sync
```

Nelle route esistono i file `signals.ts` e `sync.ts` (confermato dalle dimensioni dei file), ma non compaiono nella struttura directory di `DEVELOPER.md`.

---

### 7. `CLAUDE.md` — Endpoint `/api/week/:date` non completo

**File:** `CLAUDE.md` (riga 27)  
**Problema:**
```
/api/week/:date, /api/zucchetti/*, /api/analyze/*
```

Mancano dall'elenco:
- `/api/day/*` (signals router — dati per giorno singolo)
- `/api/sync/*` (sync router)
- `/api/health` (health check endpoint)
- `/api/week/:date/tp-hours` (TP hours per settimana)
- `/api/week/:date/submit` (submit settimanale)

---

### 8. `DEVELOPER.md` — `analyze.ts` route non nella struttura directory

**File:** `DEVELOPER.md` (riga 42–47)  
**Problema:** La struttura directory elenca le routes ma omette `signals.ts` e `sync.ts`:
```
├── routes/
│   ├── week.ts
│   ├── analyze.ts
│   ├── proposals.ts
│   ├── submit.ts
│   ├── zucchetti.ts
│   └── hooks.ts
# Mancano: signals.ts, sync.ts
```

---

## 🟡 INCOERENZE MINORI / ROBE STRANE

### 9. `FUNCTIONAL.md` — `AggregatedDay.location` ha un tipo diverso dal codice

**File:** `FUNCTIONAL.md` (riga 112), `shared/aggregator.ts` (riga 87)  
**Problema:**

`FUNCTIONAL.md` descrive:
```
+location: office|smart|mixed|unknown
```

Il tipo reale in `shared/aggregator.ts` è:
```typescript
location: "office" | "smart" | "travel" | "external" | "mixed" | "unknown"
```

Mancano `"travel"` ed `"external"` dalla documentazione. Importante perché la logica in `aggregator.ts` gestisce esplicitamente `TRASFERTA` → `"travel"` e `SERVIZIO ESTERNO` → `"external"`.

---

### 10. `FUNCTIONAL.md` — `DayProposal` non ha il campo `provider`

**File:** `FUNCTIONAL.md` (riga 148–153), `shared/analysis.ts`  

Il classDiagram in `FUNCTIONAL.md` non mostra il campo `provider?:string` che esiste in `shared/analysis.ts` (riga 19) e viene sempre popolato dal codice (`analyzer.ts` riga 302).

---

### 11. `CLAUDE.md` — Percorso key types: `ZucchettiDay` non è in `src/collectors/zucchetti/index.ts`

**File:** `CLAUDE.md` (riga 86)  
```
- `ZucchettiDay` — `src/collectors/zucchetti/index.ts`
```

Il tipo `ZucchettiDay` è definito in `shared/zucchetti.ts` (il modulo condiviso), non in `src/collectors/zucchetti/index.ts`. Il collector lo importa da `@shared/zucchetti`.

---

### 12. `DEVELOPER.md` — `WORKDAY_HOURS` / `HALF_WORKDAY_HOURS` in `web/src/mock/data.ts`

**File:** `FUNCTIONAL.md` (riga 219)  
```
Defined as `WORKDAY_HOURS` / `HALF_WORKDAY_HOURS` in `web/src/mock/data.ts`.
```

Il file `web/src/mock/data.ts` sembra essere un file di mock/test. Queste costanti dovrebbero probabilmente essere nel codice di produzione. Potrebbe essere che i valori siano stati spostati altrove. Da verificare se il file esiste ancora o se la definizione è migrata.

---

### 13. `DATA-STRATEGY.md` — Env var `GEMINI_API_KEY` non documentata in `DEVELOPER.md`

**File:** `DATA-STRATEGY.md` (riga 81), `DEVELOPER.md` (tabella env vars riga 242–264)  
**Problema:** Il file `DATA-STRATEGY.md` e il codice (`geminiProvider.ts`, `collector.ts`) usano `GEMINI_API_KEY` e `GEMINI_MODEL`. Queste variabili **non appaiono** nella tabella delle env vars in `DEVELOPER.md`.

Stessa cosa per:
- `GEMINI_MODEL` — modello Gemini
- `GEMINI_MODEL_MAX_TPM` — limite token Gemini
- `CLAUDE_MODEL_MAX_TPM` — limite token Claude  
- `OPENAI_MODEL_MAX_TPM` — limite token OpenAI-compat
- `OPENAI_NUM_CTX` — context window per Ollama
- `OPENAI_REQUEST_TIMEOUT_MS` — timeout richieste OpenAI-compat
- `KB_RELEVANCE_WINDOW_DAYS` — finestra di rilevanza KB (usata in `analyzer.ts` riga 187)
- `SERVER_PORT` — porta del server Express (usata in `app.ts`, default 3001)

---

### 14. `azure-guide.md` — Usa `npm start` invece di `npm run serve`

**File:** `docs/azure-guide.md` (riga 124)  
```powershell
npm start
```

`npm start` corrisponde (da `package.json`) all'alias di `tsx src/index.ts` — il **collector**, non il server. Per avviare il server si usa `npm run serve`. L'istruzione è quindi fuorviante: non si avvia la web UI con `npm start`.

---

### 15. `DEVELOPER.md` — Diagramma data flow usa `claudeAnalyzer.ts` (nome sbagliato)

**File:** `DEVELOPER.md` (riga 176)  
```
AGGF --→ ANA["npm run analyze\nclaudeAnalyzer.ts"]
```

Il file si chiama `analyzer.ts` (non `claudeAnalyzer.ts`). `claudeAnalyzer.ts` era il nome precedente alla refactoring unitaria con fallback chain.

---

### 16. `DEVELOPER.md` — `scripts/test-nibol.ts` non nella struttura directory

**File:** `DEVELOPER.md` (riga 87–93)  
La struttura `scripts/` nel documento non include `test-standup-paginate.ts`, `test-teams-filter.ts`, `test-teams-thursday.ts` che esistono nella cartella reale:

```
scripts/
├── analyze-ollama-remote.sh      ← non in DEVELOPER.md
├── bootstrap-env.ps1
├── launch-nibol-setup.ps1        ← non in DEVELOPER.md
├── morning-automation.ps1
├── schedule-morning.ps1
├── test-nibol.ts                 ← indicato come "Nibol connection test"
├── test-standup-paginate.ts      ← non documentato
├── test-teams-filter.ts          ← non documentato
├── test-teams-thursday.ts        ← non documentato
├── rewrite_git_commit.sh         ← non in DEVELOPER.md
├── nibol/                        ← book_desk.ts, getCalendar.ts  ✓
└── tp/                           ← più file TP ✓
```

---

### 17. `docs/plans/new_css_implementation_plan.md` — Piano mai completato / stante

**File:** `docs/plans/new_css_implementation_plan.md`  
**Nota strana:** Questo file è un *piano di implementazione generato da AI* (proposta design Neon Nebula vs Zenith Mono) che sembra non essere mai stato approvato né archiviato. Il file è in `docs/plans/` ma ha lo stile di un artifact di assistente AI, non di una specifica tecnica. Non è né un documento operativo né una specifica definitiva.

Se il design non è stato scelto, questo file andrebbe rimosso o spostato in `docs/archive/`. Se invece il design è già stato implementato, andrebbe aggiornato con lo stato finale o eliminato.

---

### 18. `CLAUDE.md` — Nibol: percorso sbagliato per booking

**File:** `CLAUDE.md` (riga 58)  
```
- **Nibol** (desk booking): Playwright automation via `scripts/nibol/` (`npm run nibol:book`, `npm run nibol:calendar`)
```

La descrizione è corretta per gli script di booking, ma manca di menzionare che il **collector Nibol** (che salva dati in `data/raw/nibol/`) è in `src/collectors/nibol/index.ts` ed è chiamato durante `npm run collect` in `src/index.ts` (riga 20, 73). L'architettura è split: collector in `src/`, script autonomi in `scripts/nibol/`.

---

## 🟢 COSE CORRETTE (confermate dall'analisi del codice)

- La struttura `data/raw/<source>/YYYY-MM.json` è corretta
- Il meccanismo di `.meta.json` sidecar è corretto
- I percorsi `data/aggregated/` e `data/proposals/` sono corretti
- Il device code flow MSAL è implementato correttamente
- Le env vars principali (`TENANT_ID`, `CLIENT_ID`, `TP_BASE_URL`, `TP_TOKEN`, `CLAUDE_API_KEY`) sono documentate correttamente
- Gli script `npm run collect/aggregate/analyze/serve/all` corrispondono a `package.json`
- Il formato `ZucchettiDay` flat array e il handling di entrambi i formati (flat e `{days:[]}`) sono correttamente documentati in `CLAUDE.md`
- Il tipo `AggregatedDay` è quasi corretto (mancano solo `travel` e `external` da location)
- Gli npm scripts TP (`tp:log-time`, `tp:projects`, ecc.) corrispondono a `package.json`
- Il tipo `DayProposal` / `ProposalEntry` in `shared/analysis.ts` corrisponde alla documentazione (con l'eccezione del campo `provider?`)

---

## RIEPILOGO PRIORITÀ

| # | Gravità | File doc | Problema |
|---|---------|----------|----------|
| 1 | 🔴 Alta | DEVELOPER.md, CLAUDE.md | `graphClient.js` → è `.ts` |
| 2 | 🔴 Alta | CLAUDE.md, DEVELOPER.md, DATA-STRATEGY.md | Fallback chain manca `OpenAI-compat` (Ollama) come 2° provider |
| 3 | 🔴 Alta | CLAUDE.md | Provider names nei log sono diversi da quelli documentati |
| 4 | 🔴 Alta | FUNCTIONAL.md | `src/collectors/nibol.ts` non esiste — è `src/collectors/nibol/index.ts` |
| 5 | 🔴 Alta | DEVELOPER.md | `collectorGemini.ts` non esiste |
| 6 | 🟡 Media | DEVELOPER.md, CLAUDE.md | Route `signals` e `sync` non documentate |
| 9 | 🟡 Media | FUNCTIONAL.md | Location type manca `travel` e `external` |
| 13 | 🟡 Media | DEVELOPER.md | `GEMINI_API_KEY`, `GEMINI_MODEL` e molte altre env vars mancanti dalla tabella |
| 14 | 🟡 Media | azure-guide.md | `npm start` avvia il collector, non il server |
| 15 | 🟡 Media | DEVELOPER.md | Diagramma usa `claudeAnalyzer.ts` (nome vecchio) |
| 17 | 🟡 Media | docs/plans/ | Piano CSS mai completato/archiviato |
| 11 | 🟢 Bassa | CLAUDE.md | `ZucchettiDay` location sbagliata (è in `shared/`, non in `../zucchetti/index.ts`) |
| 16 | 🟢 Bassa | DEVELOPER.md | Script aggiuntivi in `scripts/` non documentati |
