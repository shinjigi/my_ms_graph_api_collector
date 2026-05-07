# Master Rules — AI Reasoning Guidance
#
# PURPOSE: This file contains ONLY behavioural rules for the AI analyzer.
# It tells the AI HOW to reason about signals, priorities, and task attribution.
#
# What does NOT belong here:
#   - Hours, recurring flags, auto-approve → config/defaults.json
#   - Task names, summaries, tags → data/kb/us-summaries.json (auto-generated)
#   - Prompt structure, output format → src/analysers/prompts.ts
#
# This file is injected into the system prompt at runtime by analyzer.ts.
# Edits take effect on the next analyzeBatch() call — no restart needed.

## 1. Signal hierarchy — confidence weights

When signals conflict, apply this priority order:

| Rank | Source                          | Weight | Notes                                                                                      |
| ---- | ------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| 1    | Git / SVN commits               | 90%    | Code present = work done. Commits on day X may relate to day X−1 work.                     |
| 2    | Calendar events                 | 70%    | Planned truth. Include staff meetings, standups, kick-offs even if not pre-seeded.          |
| 3    | Sent emails                     | 60%    | Active engagement — sending/replying/forwarding = direct work signal. Extract task IDs.     |
| 4    | Teams messages / Browser visits | 50%    | "Silent work" indicator. Look for task IDs (#NNNNNN), untracked calls, research sessions.  |
| 5    | Received emails                 | 30%    | Passive signal — useful for Ops/Maintenance triggers and context.                          |

---

## 2. Signal → task attribution rules

BAU ("BAU - Your Team Name") contains multiple User Stories. Map each signal to the most specific ID.

### 2a. Support / Operations US — signal mapping

| Trigger signals                                                                         | TP ID       |
| --------------------------------------------------------------------------------------- | ----------- |
| Daily standup, staff meetings, all-hands, kick-offs, internal meetings not tied to a specific project | **#324911** |
| Time reporting, reading general emails not tied to a project, PC/network/VPN issues, hardware/software troubleshooting | **#324913** |
| "incident", "ticket", "SD-", "support request", "disservizio"; service desk follow-ups  | **#324893** |
| TeamCity emails, "build failed", "pipeline", "deploy"; Sitecore deploy/publish; Uptrends alerts | **#324895** |
| Cross-team requests, back-office tasks, non-tech stakeholder requests                   | **#324910** |
| Calculators, forms, cookie banners, ARR, email templates, generic web fixes             | **#324912** |
| Pluralsight, LinkedIn Learning, AI research, Confluence read-only, developer digest     | **#329300** |
| SnapTest case updates, regression test runs, STA/PRO label fixes                        | **#324894** |

### 2b. Vertical US (highest priority — feature work)

Always prefer over support US when signals are specific.
Keywords: `Credit Broker`, `VW`, `LawSuits`, `Coupon`, `Landing`, `Satispay`, `Sitecore` (feature work), `Promositi`, `Elty`, `Mutui`, `AC Scan`, `IAC`, `Leonteq`.

### 2c. Final fallback

Use generic "BAU - Your Team Name" ONLY if no specific vertical/support US matches AND no relevant signals exist in the last 3 days.

---

## 3. Scenario rules

### Standup & staff meetings → #324911
Every morning standup appears in the Teams chat "Standup". Attribute to #324911. Also attribute internal staff meetings (not project-specific) to #324911. Hours are pre-seeded — do not override unless signals contradict (e.g. sick/travel day).

### Company events
Calendar events with 5+ attendees OR subjects containing "staff", "obiettivi", "all hands", "kick-off", "team meeting", "sprint review" → dedicated entry on #324911 even if not pre-seeded.

### Overhead / general email / PC issues → #324913
Generic non-project email reading, time reporting itself, PC/network troubleshooting → attribute to #324913. Hours are pre-seeded — do not override unless signals contradict.

### Untracked calls
Dense Teams message bursts without a matching calendar event → 0.5–1h to the most relevant open US. Comment: `"Untracked call — <topic>"`.

### Received emails → Ops triggers
- **Uptrends** alerts → #324895: `"Platform health check"`
- **TeamCity / CI** failure → #324895: `"CI pipeline investigation — <build name>"`
- **Sitecore deploy** (including cancelled) → #324895: `"Sitecore deploy monitoring"`
- **Service desk / incident** → #324893: `"Incident response — <brief description>"`
- **Confluence** notifications → #329300 (learning) or #324910 (action required)
- **HR / company news** → #324910, 0.25h max: `"Internal communications review"`

### Sent emails → active engagement
Sent emails are strong work signals — the user actively composed them. Prioritise over received:
- **Reply/forward on a task thread** → attribute to the referenced task. Look for #NNNNNN IDs or KB task names in subject/recipients.
- **Sent to deploy/CI lists** → #324895: `"Deploy coordination — <subject>"`
- **Sent to incident/support threads** → #324893: `"Incident follow-up — <subject>"`
- **Sent to stakeholders/POs** → #324910 or the relevant vertical US: `"Stakeholder communication — <subject>"`
- **Multiple sent emails on same topic** within a day → consolidate into one higher-hour entry, not multiple micro-entries.

### Commit cross-day attribution
Commits on day X may relate to day X−1 work. If a commit references a task with stronger signals on the previous day, note: `"Commit day X — work relates to <task> from prior day"`.

### #NNNNNN references in chat or email
5–6 digit ID preceded by `#` in Teams/email subjects = TargetProcess task ID. Prioritise allocation to that task if in active KB.

---

## 4. Anti-fragmentation

- **Default cap: 4–5 entries per day.** Merge micro-tasks into one entry (e.g. multiple monitoring emails → one "Monitoring & Ops" entry).
- **Precision overrides the cap** when multiple distinct task IDs are identified or signals are unambiguous.
- Minimum entry granularity: 0.25h.

---

## 5. Comment quality

Every `comment` must be: English, one sentence, describing the work itself.

**NEVER reference how the work was detected.** Do not write phrases like:
- "based on calendar event", "based on email acceptance", "per Teams message"
- "based on commit", "based on browser history", "following Uptrends alert"
- "based on SVN activity", "based on calendar acceptance"

Comments must read as if written by the person who did the work.
Examples: `"Investigation of #329300 — learning session"`, `"Platform health check"`, `"Deploy coordination — release thread"`.
