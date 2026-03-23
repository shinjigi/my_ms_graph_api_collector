# Plan: Timesheet Bugs, UX, Architecture Cleanup & Documentation

## Context

The Activity Portal has accumulated several bugs in the timesheet component, missing features in the dashboard, empty detail views, project file disorganization, and lacks operational documentation. This plan addresses all issues raised, organized by priority and dependency order.

---

## Phase 1 — Critical Bug Fixes

### 1.1 "Ore TP" header ignores pinned rows + delta reconciliation broken (A1 + A3)

**Root cause confirmed:** `totalsRow` computed (line 151-153 of `useTimesheetStore.ts`) sums only `active.value`, excluding `pinned.value`. When the user edits hours on a pinned row (one with 0 logged hours), the "Ore TP" total and `delta` don't update. This also breaks the delta reconciliation in `TimeCellWidget.vue` — since `dayDelta` stays stale, the condition `Math.abs(d) < 0.5` never triggers.

**Fix:**

- `web/src/stores/useTimesheetStore.ts` line 153: change `active.value.reduce(...)` → `[...active.value, ...pinned.value].reduce(...)`

**Complexity:** S — single line change, fixes both A1 and A3.

---

### 1.2 "Invia a TP" button stays active after successful submit (A2)

**Root cause:** `submitWeekHours()` returns the API result but never clears `hoursEdits` or reloads data. The `pendingEditsCount` computed in `TsTpBar.vue` still counts entries → button stays enabled.

**Fix:**

- `web/src/stores/useTimesheetStore.ts`:
  - Add `clearEdits()` method: resets `hoursEdits.value = {}` and `noteEdits.value = {}`
  - In `submitWeekHours()`: after successful API call, call `clearEdits()` then `await fetchWeekData(currentMonday.value!)` to reload fresh TP data
  - Export `clearEdits` from the store return object
- `web/src/components/timesheet/TsTpBar.vue`: no changes needed — button reactively reads `hoursEdits`

**Complexity:** S

---

### 1.3 Submit to TP from Dashboard (B)

**Current state:** Dashboard `WorkTpPanel.vue` edits go to `useDayStore.setTpHours()` which only updates local state, disconnected from `useTimesheetStore.hoursEdits`. No submit button exists.

**Fix:**

- `web/src/stores/useDayStore.ts`: modify `setTpHours()` to also call `ts.setHours(tpId, dayIdx, val)` to keep timesheet store in sync
- `web/src/stores/useTimesheetStore.ts`: add `submitDayHours(dayIdx: number)` method that filters `hoursEdits` to only entries matching that day index, then calls the existing submit API
- `web/src/components/dashboard/WorkTpPanel.vue`: add "Invia a TP" button (reuse same styling as `TsTpBar.vue`), calling `ts.submitDayHours(picker.selectedDayIdx)`

**Files:**

- `web/src/stores/useDayStore.ts`
- `web/src/stores/useTimesheetStore.ts`
- `web/src/components/dashboard/WorkTpPanel.vue`

**Complexity:** M

---

## Phase 2 — UX Improvements

### 2.1 Recurring Activities filter/sort (C)

**Current:** Pinned section in `TimesheetTable.vue` (lines 31-58) shows all `ts.pinned` rows without filtering or sorting.

**Target:** Mirror the Dashboard "Log rapido" pattern (`WorkTpPanel.vue` lines 60-115) — add text search, signal filter, and 3-field sort (state, ore, chiusura).

**Approach:**

- `web/src/stores/useUiStore.ts`: add `pinnedSearch`, `pinnedFilterSignals`, `pinnedSort` state + `sortPinned()` method
- `web/src/components/timesheet/TimesheetTable.vue`: add filter toolbar above pinned section, add `filteredPinned` local computed applying filter/sort
- Reuse same filter/sort logic pattern from `WorkTpPanel.vue` — no shared component needed (rendering differs: TsRow grid vs compact cards)

**Complexity:** M

---

### 2.2 Dashboard → Detail View navigation (I)

**Current:** StatStrip cards and SignalsGrid sections are display-only, no click navigation.

**Fix:**

- `web/src/components/dashboard/StatStrip.vue`: add `@click` + `cursor-pointer` on:
  - Commit card → `/activity/:date`
  - Meeting card → `/teams/:date`
  - Email card → (future, no-op for now)
- `web/src/components/dashboard/SignalsGrid.vue`: add `@click` on section headers:
  - Git/SVN → `/activity/:date`
  - Teams → `/teams/:date`
  - Browser → `/browser/:date`
  - Email → (future)

**Complexity:** S

---

## Phase 3 — Architecture Cleanup

### 3.1 Commit deleted orphaned files (D1)

Files already deleted in working tree: `check_ids.js`, `debug_map.js`, `extract_pins.js`, `find_o13.js`, `map_tooltips.js`. Stage and commit.

### 3.2 Move standalone script directories (D2-D3)

| From                           | To                         | Update                      |
| ------------------------------ | -------------------------- | --------------------------- |
| `tp/*.ts` + `tp/tsconfig.json` | `scripts/tp/`              | `package.json` script paths |
| `nibol_automation/*.ts`        | `scripts/nibol/`           | `package.json` script paths |
| `portal/index.html`            | `docs/archive/portal.html` | —                           |
| `plans/`                       | `docs/plans/`              | —                           |

### 3.3 Update package.json + CLAUDE.md

Update all script paths. Update CLAUDE.md architecture section with new directory structure.

**Complexity:** M (many small moves, reference updates)

---

## Phase 4 — Documentation

### 4.1 Scripts Reference (E)

Add to `DEVELOPER.md` a categorized scripts table:

| Category              | Scripts                                            |
| --------------------- | -------------------------------------------------- |
| **Pipeline (manual)** | `collect`, `aggregate`, `analyze`, `all`           |
| **Server/Dev**        | `serve`, `cd web && npm run dev`                   |
| **Operator CLI**      | `zucchetti:get`, `nibol:book`, `tp:log-time`, etc. |
| **AI Analysis**       | `analyze:claude`, `analyze:gemini`, `kb:update`    |
| **Scheduled**         | `scripts/morning-automation.ps1` (weekday 08:30)   |

### 4.2 Operator Use Cases (F)

Create `docs/OPERATOR.md` with 10 runbook-style use cases:

1. Morning startup — check data freshness indicators
2. Daily data collection pipeline
3. View/edit timesheet for a specific day
4. Submit hours to TP (day or week)
5. Log SW, ferie, half-day activities
6. Request AI analysis for a week
7. Use AI proposals to pre-populate timesheet
8. Check/manage Nibol desk booking
9. Monthly reconciliation check
10. Handle stale or missing data

### 4.3 Data Collection Strategy (G)

Create `docs/DATA-STRATEGY.md`:

| Source         | Frequency                   | Immutability       | Current skip logic   | Gap                 |
| -------------- | --------------------------- | ------------------ | -------------------- | ------------------- |
| Calendar/Email | Monthly files               | Past months frozen | `.meta.json` sidecar | None                |
| Teams          | Incremental per-chat        | Append-only        | `chat-states.json`   | None                |
| Git/SVN        | Monthly                     | Past months frozen | `.meta.json` sidecar | None                |
| Zucchetti      | Monthly (current refreshed) | Past months frozen | `.meta.json` sidecar | None                |
| Browser        | Monthly                     | Past months frozen | `.meta.json` sidecar | None                |
| **Aggregator** | All days rebuilt            | —                  | **None**             | Add hash-based skip |
| **Analyzer**   | Per-day proposal            | —                  | File-existence only  | Add hash comparison |

**Complexity:** M (writing, no code changes)

---

## Phase 5 — New Features (Detail Views)

### 5.1 Backend API endpoints

Add to `src/server/routes/` (new file `signals.ts` or extend `week.ts`):

- `GET /api/day/:date/commits` — git + SVN commits from aggregated data
- `GET /api/day/:date/teams` — teams messages from aggregated data
- `GET /api/day/:date/browser` — browser visits from aggregated data

### 5.2 Frontend API + views

- `web/src/api.ts`: add `fetchCommits()`, `fetchTeams()`, `fetchBrowser()`
- Replace placeholder templates in `web/src/views/PortalView.vue` with:
  - `ActivityView.vue` — commit timeline grouped by repo
  - `TeamsView.vue` — chat messages grouped by thread
  - `BrowserView.vue` — browsing history grouped by domain
- `web/src/components/dashboard/SignalsGrid.vue`: replace mock data (`TEAMS_MSG_COUNT`, `BROWSER_*`) with real data from stores

**Complexity:** L

---

## Phase 6 — Investigation

### 6.1 Nibol Calendar (J)

- Investigate `nibol_automation/test_calendar.ts` + `src/collectors/nibol/index.ts`
- Check: env var loading (dotenv path), Playwright navigation, DOM selectors, authentication
- Determine if the issue is path-based (cwd), auth-based, or DOM-based

**Complexity:** S-M (investigation, fix depends on findings)

---

## Execution Order

```
1.1 (Ore TP + delta) ──┐
1.2 (submit reset)  ───┤ Phase 1: bug fixes
1.3 (dashboard submit) ┘
        │
2.1 (pinned filter) ───┐ Phase 2: UX
2.2 (card navigation) ─┘
        │
3.x (file reorg) ──────── Phase 3: cleanup
        │
4.x (docs) ────────────── Phase 4: documentation
        │
5.x (detail views) ────── Phase 5: features (largest)
        │
6.1 (nibol) ───────────── Phase 6: investigation
```

## Verification

- **Phase 1**: Run `cd web && npx vue-tsc --noEmit` for type checks. Start server + frontend, edit hours on pinned rows → verify Ore TP updates. Submit → verify button resets and data reloads. Dashboard submit → verify single day submission.
- **Phase 2**: Verify pinned filter/sort controls appear and work. Click dashboard cards → verify navigation to detail views.
- **Phase 3**: `npx tsc --noEmit` after moves. All `npm run` scripts still work.
- **Phase 4**: Review documentation for accuracy.
- **Phase 5**: Navigate to Activity/Teams/Browser views → verify real data renders. Check SignalsGrid shows real counts.
