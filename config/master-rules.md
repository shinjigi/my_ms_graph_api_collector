## 0. Language rule (mandatory)

ALL output text (taskName, reasoning, comment fields) MUST be in English.
Internal reasoning may be in any language, but every field written to the proposal JSON must be formal, technical English.

---

## 1. Signal hierarchy — confidence weights

When signals conflict, apply this priority order strictly:

| Rank | Source                          | Weight | Notes                                                                                                    |
| ---- | ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| 1    | Git / SVN commits               | 90%    | Code present = work is there. Commits on day X may relate to work from day X−1.                          |
| 2    | Calendar events                 | 70%    | Planned truth. Prioritise "Staff Meeting", "Standup", "Kick-off", company events even if not pre-seeded. |
| 3    | Teams messages / Browser visits | 50%    | Critical for "silent work". Look for task IDs (#NNNNNN), untracked calls, research sessions.             |
| 4    | Email / Alert notifications     | 30%    | Trigger for Ops/Maintenance tasks only.                                                                  |

---

## 2. BAU is a cluster — NOT a single bucket

BAU ("BAU - Team ITA Web") contains multiple distinct User Stories. Do not collapse all generic hours into one entry. Map each activity signal to the most specific ID below.

### 2a. Support / Operations US (use these before the generic fallback)

| Category                 | TP ID       | US Name                                              | Trigger signals                                                                                                                                                                                |
| ------------------------ | ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incidents / Service Desk | **#324893** | Incident #2026                                       | Emails with "incident", "ticket", "SD-", "support request", "disservizio"; opening or following up on a service desk ticket; user-reported issues on Sitecore, CaaS, Bookshop                  |
| Deploy / CI / Monitoring | **#324895** | Deploy process #2026                                 | TeamCity emails ("build failed", "pipeline", "deploy", "triggered"); Sitecore deploy/publish/cancelled emails; post-release regression checks; Uptrends alerts implying platform health checks |
| Business Support         | **#324910** | Business support / Other teams support #2026         | Cross-team requests, generic back-office tasks, requests from non-tech stakeholders, "Annega" personal/side-project activity here                                                              |
| Web Maintenance          | **#324912** | calculators/serv/sel/forms updates/ARR/Cookies #2026 | Changes to calculators, forms, cookie banners, ARR, email templates, generic web fixes not tied to a vertical feature                                                                          |
| Training & Research      | **#329300** | Formazione 2026 IA AI agenti                         | Pluralsight, LinkedIn Learning, AI research, Confluence read-only sessions, developer digest; any knowledge-acquisition activity                                                               |
| Testing / QA             | **#324894** | SnapTest #2026                                       | SnapTest case updates, regression test runs, STA/PRO label fixes                                                                                                                               |

### 2b. Vertical US (highest priority — feature work)

Always prefer these over support US when signals are specific.
Recognised keywords that trigger vertical attribution: `Credit Broker`, `VW`, `LawSuits`, `Coupon`, `Landing`, `Satispay`, `Sitecore` (feature work), `Promositi`, `Elty`, `Mutui`, `AC Scan`, `IAC`, `Leonteq`.

### 2c. Final fallback

Use the generic "BAU - Team ITA Web" project-level US **only** if:

- No specific vertical or support US can be identified, AND
- There are no relevant activity signals in the last 3 days.

---

## 3. Specific scenario rules

### Daily Standup

Every morning, a standup meeting occurs (0.5h–1h). Exact timings and "hints" regarding what was done are often found in the Teams chat named "Standup". Use these chat signals to verify the meeting's presence and duration even if not in the calendar.
Comment example: `"Daily standup"`.

### Staff meetings & company events

If a calendar event has 5+ attendees OR the subject contains "staff", "obiettivi", "all hands", "kick-off", "team meeting", "company goals", "sprint review" — add a dedicated entry even if it was not pre-seeded. Comment example: `"Staff meeting — company goals alignment"`.

### Untracked calls

If Teams messages spike within a short window (dense burst) without a corresponding calendar event, allocate 0.5–1h to the most relevant open US. Comment: `"Untracked Teams call — technical sync on <topic>"`.

### Email notifications → Ops time

- **Uptrends** alerts → #324895, comment: `"Platform health check following Uptrends alert"`
- **TeamCity / CI** failure → #324895, comment: `"CI pipeline investigation — <build name>"`
- **Sitecore deploy** (including cancelled) → #324895, comment: `"Sitecore deploy monitoring — post-release check"`
- **Service desk / incident** → #324893, comment: `"Incident response — <brief description>"`
- **Confluence / wiki** update notifications → #329300 (if read-for-learning) or #324910 (if cross-team action required)
- **HR / company news** emails → #324910, 0.25h max, comment: `"Internal communications review"`

### Commit cross-day attribution

Commits on day X may relate to work started on day X−1. If a commit message references a task that had stronger signals (calendar, Teams) on the previous day, weight that task for the current day and note: `"Commit day X — work relates to <task> from prior day"`.

### #NNNNNN references in chat or email

If a 5- or 6-digit ID preceded by `#` appears in Teams messages or email subjects, treat it as a TargetProcess task ID. Prioritise allocating hours to that task if it appears in the active KB.

---

## 4. Anti-fragmentation — entry count rules

- **Default cap: 4–5 entries per day.** Merge micro-tasks into the most appropriate single entry (e.g. consolidate multiple monitoring emails into one "Monitoring & Ops" entry on #324895).
- **Precision overrides the cap** when: signals are unambiguous, multiple distinct vertical US IDs are identified, or a specific #NNNNNN reference is present. In that case, create separate entries even beyond 5.
- Minimum entry granularity: 0.25h. Do not create entries below this threshold.

---

## 5. Comment quality guidelines

Every `comment` field must be:

- Written in English (mandatory — see rule 0).
- One sentence, specific, referencing the strongest signal.
- Good examples:
  - `"Investigation of #329300 based on Teams discussion"`
  - `"Platform health check following Uptrends alert"`
  - `"Staff meeting regarding company goals"`
  - `"TeamCity deploy failure — root cause analysis"`
  - `"Pluralsight session — AI/LLM course"`
