# TODO

## Phase 0 — Foundation
- [x] Create WXT, React, TypeScript, and Tailwind project structure.
- [x] Configure linting, typechecking, and Vitest.
- [x] Add privacy-honest extension popup shell.
- [x] Document architecture, risks, and phased acceptance criteria.
- [x] Install dependencies, typecheck, lint, run tests, and build the Chrome MV3 extension.

## Phase 1 — Tracking engine
- [x] Track only the active web tab in a focused browser window.
- [x] Exclude idle, locked, background, incognito, and unsupported pages.
- [x] Persist atomic activity intervals and recover after worker/browser restarts.
- [x] Show actual tracking state, hostname, and today's time in the popup.
- [x] Add automated tests for tab changes, focus, idle, checkpointing, midnight, storage, and recovery.
- [ ] Reload the updated extension and verify the popup remains in Tracking state while open.

## Phase 2 — Classification
- [x] Add all requested website categories and conservative domain defaults.
- [x] Allow per-domain category and productive/recreational/neutral/unknown overrides.
- [x] Add custom domain rules, persistence, and deletion.
- [x] Aggregate actual stored time by category and intent, with a documented ratio formula.
- [x] Test override precedence, input validation, and ratio calculations.
- [ ] In the browser, save a current-domain override, reopen the popup, and verify it persists.

## Later phases
- [x] Phase 3: YouTube metadata and playback tracking, local rules, and popup summaries.
- [ ] Reload the updated extension, watch a video, pause it, navigate to another video, then verify the popup's YouTube totals and title.
- [x] Phase 4: analytics dashboard from actual stored activity, with trends, intent bars, website ranking, activity timeline, and YouTube reports.
- [ ] Open the dashboard from the popup and verify its overview, tabs, totals, and empty state in the browser.
- [x] Phase 5: focus sessions with pause/resume/target completion and classified activity summaries.
- [x] Add daily time goal, global tracking pause, excluded domains, optional break and recreational-site reminders.
- [x] Add local JSON export and delete-all-data controls.
- [ ] In the browser, create and pause a focus session; verify domain exclusions and pause tracking; grant notifications only if testing reminders; verify export and delete confirmation.
- [x] Phase 6: optional OpenAI-compatible Responses provider, disabled by default.
- [x] Require an explicit endpoint host permission and API key before enabling AI; keep the key in session storage.
- [x] Send only current video title, channel name, and Shorts status after the user selects Classify with AI.
- [x] Validate structured category, confidence, and reason; keep low-confidence results from changing reports until accepted.
- [ ] Configure a provider in the browser and verify one unknown video classification and one user override.
- [x] Phase 7: Add an Insights dashboard view for productive browsing hours, recreational-site totals, week-over-week browsing change, and time matched to saved YouTube learning goals.
- [x] Cover insight calculations with local-date, user-rule, and playback tests.
- [ ] Open Insights in a browser with and without activity and learning goals; verify figures and empty states.
- [x] Phase 8: Simplify the popup to today's active browsing total and website-category breakdown, with a single dashboard link.
- [x] Clip activity to the current day, prevent overlapping or invalid intervals from inflating the displayed daily total, and cover this with a regression test.
- [ ] Reload the popup and confirm today's total and category breakdown stay within the elapsed day and update while browsing.
