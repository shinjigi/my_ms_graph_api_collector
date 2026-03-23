# Operator Runbook

→ [README](../README.md) | [Developer Guide](../DEVELOPER.md) | [Data Strategy](./DATA-STRATEGY.md)

This document describes the day-to-day operating procedures for the Activity Portal. Each use case is self-contained and lists prerequisites, steps, and expected outcomes.

**Prerequisites for all use cases:** Express server running (`npm run serve`) and frontend dev server running (`cd web && npm run dev`). Open `http://localhost:5173` in the browser.

---

## Use case 1 — Morning startup: check data freshness

**Goal:** Verify that data for yesterday (and the current week) is collected, aggregated, and ready to use.

**Steps:**
1. Open the portal. The **WeekStrip** at the top shows Mon–Fri of the current week.
2. Each day card shows Zucchetti hours and a rendicontazione status dot (green = OK, orange = partial, red = missing data or not logged).
3. Click yesterday's card. The **StatStrip** shows Commit, Meeting, and Email counts for that day.
   - If counts are 0 and no events appear in the Timeline, data may not be collected yet.
4. If data is stale or missing, run the collection pipeline from a terminal:
   ```bash
   npm run collect -- --date=YYYY-MM-DD   # yesterday's date
   npm run aggregate
   ```
5. Reload the portal (F5) — the day's data should now appear.

**Expected outcome:** StatStrip shows real commit/meeting/email counts. Timeline is populated.

---

## Use case 2 — Daily data collection pipeline

**Goal:** Collect all sources for the current day (or a past day) and rebuild aggregated bundles.

**Steps:**
1. Ensure you are on the corporate network or VPN (required for SVN and TargetProcess).
2. Run from a terminal:
   ```bash
   npm run collect                        # all sources, today and any gaps
   npm run aggregate                      # rebuild all aggregated day files
   ```
3. For a specific date only:
   ```bash
   npm run collect -- --date=2026-03-21
   npm run aggregate
   ```
4. To force re-fetch even if data appears complete (e.g. after a late commit):
   ```bash
   npm run collect -- --force
   npm run aggregate
   ```

**Notes:**
- Graph (calendar, email, teams) requires a valid device-code token. If prompted, open the URL in a browser, enter the code, and wait.
- SVN collection fails silently without VPN — gracefully writes `[]` and marks the month done.
- Zucchetti collection opens a headless browser; set `ZUCCHETTI_HEADLESS=false` in `.env` to watch it.

---

## Use case 3 — View and edit a specific day's timesheet

**Goal:** Open a past or future day and inspect/edit hours and notes per US.

**Steps:**
1. Use the **day picker header** to navigate to the target month. Click the day button.
2. The URL updates to `/#/dashboard/YYYY-MM-DD`. The Dashboard shows that day's events.
3. Click **Verifica** (top right of dashboard) or click **Timesheet** in the sidebar.
4. The Timesheet view shows all active TP user stories in a weekly grid.
5. Click a cell or use the `+`/`−` buttons to adjust hours. The delta row updates live.
6. To add a note to a cell, click the note icon in the row.
7. The **Attività ricorrenti** section at the bottom shows US with no hours this week. Use the search/filter/sort toolbar to find the right one, then edit its cells.

**Notes:**
- Edits are stored in `localStorage` and persist across page reloads.
- The `+` button smart-increments: if the remaining delta for the column is < 0.5h and in the right direction, it adds exactly the delta instead of a full 0.5h.

---

## Use case 4 — Submit hours to TargetProcess

**Goal:** Send logged hours from the portal to TargetProcess.

### Option A — Submit the entire week from the Timesheet view

1. Navigate to the Timesheet view.
2. Edit hours across any day of the week.
3. Click **Invia a TP** in the toolbar. The badge shows the number of pending edits.
4. On success: the button resets, edits are cleared, and the week data reloads from the API.

### Option B — Submit a single day from the Dashboard

1. Navigate to the Dashboard for the target day.
2. Edit hours in the **Lavoro · TP** panel (US cards section).
3. Click **Invia a TP** in the panel header. Only that day's edits are submitted.
4. On success: the badge disappears and a confirmation message appears.

**Notes:**
- Requires `TP_BASE_URL` and `TP_TOKEN` set in `.env`.
- If any entry fails, edits are NOT cleared — fix the error and retry.

---

## Use case 5 — Log SW, ferie, or half-day in Zucchetti

**Goal:** Register a smart-working day, a leave, or a half-day attendance in Zucchetti.

**Steps:**
1. Run the Zucchetti update script with the appropriate parameters:
   ```bash
   npm run zucchetti:update
   ```
   The script opens a browser session (headless by default) and submits the activity request.
2. Alternatively, the **morning automation** (`scripts/morning-automation.ps1`) handles smart-working registration automatically at 08:30 on weekdays if scheduled.
3. After submission, re-run the Zucchetti collector to refresh the local data:
   ```bash
   npm run zucchetti:get
   npm run aggregate
   ```

**Notes:**
- For manual submissions with a visible browser: set `ZUCCHETTI_HEADLESS=false` in `.env`.
- The morning automation also handles Nibol desk booking — see use case 8.

---

## Use case 6 — Request AI analysis for a week

**Goal:** Generate timesheet proposals for all workdays of the current week using AI.

**Steps:**
1. Ensure aggregated data exists for the week (`npm run aggregate`).
2. In the **Timesheet view**, click **Analizza** in the toolbar. This triggers analysis for all 5 workdays of the week.
3. Monitor progress in the toolbar — it shows `X/5` completed.
4. Alternatively, from the **Dashboard StatStrip** (AI Proposal card), click **Analizza** for the selected day only.
5. To force re-analysis of already-analyzed days:
   ```bash
   npm run analyze -- --date=YYYY-MM-DD --force
   ```
6. To use a specific AI provider:
   ```bash
   npm run analyze:claude -- --date=YYYY-MM-DD
   npm run analyze:gemini -- --date=YYYY-MM-DD
   ```

**Notes:**
- The analyzer skips days that already have a `data/proposals/YYYY-MM-DD.json` file unless `--force` is passed.
- AI Proposal card in StatStrip shows provider name, last run time, and entry count.

---

## Use case 7 — Use AI proposals to pre-populate the timesheet

**Goal:** Apply AI-generated hour suggestions to the timesheet for review and submission.

**Steps:**
1. Complete use case 6 (analysis) first.
2. Open the Dashboard for the target day. The **AI Proposal** card in the StatStrip shows the number of proposal entries.
3. The proposal is visible in `data/proposals/YYYY-MM-DD.json`. The frontend can display and apply it via the proposals API.
4. Review the entries — the AI proposes hours per US based on commits, meetings, and email signals for that day.
5. Adjust hours manually in the Timesheet view if needed, then submit (use case 4).

**Notes:**
- The fallback chain (Claude → Gemini → Claude CLI) ensures analysis runs even without API credits.
- Update the US knowledge base periodically to keep AI context fresh: `npm run kb:update`.

---

## Use case 8 — Check and manage Nibol desk booking

**Goal:** Verify the desk booking for a given day or book manually.

**Steps:**
1. Check booking status:
   ```bash
   npm run nibol:status
   ```
2. Book desk for today:
   ```bash
   npm run nibol:book
   ```
3. Book desk for a specific date:
   ```bash
   npm run nibol:book:date    # edit the date in package.json or pass --date=YYYY-MM-DD
   ```
4. Fetch calendar data (for diagnostic purposes):
   ```bash
   npm run nibol:calendar
   ```
5. The **WeekStrip** in the portal shows a "nibol" label on days with an active booking.

**Notes:**
- Nibol automation uses Playwright with a persistent browser profile (`NIBOL_PROFILE_DIR` in `.env`).
- The morning automation handles daily booking automatically at 08:30 on weekdays.

---

## Use case 9 — Monthly reconciliation check

**Goal:** Verify that all workdays of the past month are fully reconciled (TP hours = Zucchetti hours).

**Steps:**
1. Navigate to the target month using the **day picker** (prev month arrow).
2. Scan the **WeekStrip** day cards for each week — days with a red dot are missing TP hours, orange dots indicate partial logging.
3. Click each red/orange day, open the Timesheet view, and complete the missing entries.
4. Submit hours (use case 4) for each day.
5. Re-run Zucchetti collection to ensure local data matches:
   ```bash
   npm run zucchetti:get:date    # edit year/month in package.json or in the script
   npm run aggregate
   ```
6. Verify that all days show a green dot in the WeekStrip.

---

## Use case 10 — Handle stale or missing data

**Goal:** Recover from situations where data is absent, outdated, or incorrect.

**Scenario A — Missing aggregated file for a day:**
```bash
npm run collect -- --date=YYYY-MM-DD --force
npm run aggregate
```

**Scenario B — Proposals file is wrong or outdated:**
```bash
npm run analyze -- --date=YYYY-MM-DD --force
```

**Scenario C — Graph token expired (device code prompt appears):**
Open the displayed URL in a browser, enter the code, and wait. The token is cached to `.token-cache.json` for future runs.

**Scenario D — Zucchetti data differs from what the portal shows:**
```bash
npm run zucchetti:get        # re-extract current month
npm run aggregate            # rebuild aggregated files
```
Then reload the portal (F5).

**Scenario E — SVN data missing (no VPN):**
SVN collection gracefully skips and writes `[]` when the SVN server is unreachable. Reconnect to VPN and re-run `npm run collect -- --force`.
