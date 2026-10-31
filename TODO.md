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
- [ ] Phase 6: optional, opt-in AI provider interface.
