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
- [x] Phase 9: Expand defaults for classroom, education, Google/Microsoft work tools, and common communication platforms.
- [x] Restore per-website category and intent editing in the dashboard Websites view so unknown domains can be corrected without making the popup complex.
- [ ] Change an unknown website to a category in the dashboard, reload, and confirm the saved rule changes daily category totals.
- [x] Phase 10: Add Gemini, Grok, and OpenAI provider choices for opt-in AI website suggestions.
- [x] Send only the selected unknown hostname, validate the structured response, and require the user to accept the suggestion before storing a website rule.
- [ ] Configure a Gemini or Grok API key in Dashboard → Settings and classify one selected Unknown domain; verify the request succeeds and the accepted category persists.

- [x] Phase 11: Fix YouTube analytics windows, overlap inflation, and delayed dashboard refreshes; project only the fresh active segment and show the current video state.
- [x] Add regression tests for local-day clipping, overlapping segments, and live-segment projection.
- [ ] Reload the extension, watch and pause YouTube, and verify the live card and today's category totals update and stop when YouTube is no longer active.
- [x] Phase 12: Add YouTube video category editing and optional Gemini/Grok suggestions for ambiguous videos.
- [x] Keep video suggestions review-before-save and store accepted results locally; provider requests include only title, channel, and Shorts status.
- [ ] Configure a Gemini or Grok key and model in Dashboard → Settings; suggest and accept a category for an Unknown video and verify the report updates.
- [x] Phase 13: Preserve active-tab context when the browser action popup is focused, and enable YouTube capture on both apex and `www` hosts.
- [x] Add regression tests for popup-focus context recovery, omitted tab-list fallback, and YouTube host matching.
- [ ] Reload the updated extension in Chrome and confirm the popup reports Tracking and today's usage increases on a `youtube.com` page.

## Reliability and Simple Jev follow-up
- [x] Clear failed or blocked IndexedDB open promises and reopen connections after `versionchange` so tracking can recover without restarting the worker.
- [x] Show a clear extension-context message instead of crashing when popup or dashboard pages are opened outside the extension.
- [x] Add optional Simple Jev category suggestions using its structured choice endpoint; keep requests user initiated and review-before-save.
- [x] Test blocked storage recovery, Jev request privacy, response validation, timeout, and server errors.
- [ ] Load the updated extension in a Chromium browser and run the tracking, settings, website suggestion, and YouTube suggestion flows.

## Phase 14 — Product simplification
- [x] Reduce navigation to Overview, Activity, Websites, and Settings and remove focus sessions, learning goals, Insights, intent ratios, and the separate YouTube analytics view.
- [x] Add a 12-month GitHub-style contribution heatmap with hover details, intensity levels, and click-to-inspect day details.
- [x] Centralize interval deduplication, local-date grouping, duration formatting, heatmap intensity, and streak math in `src/analytics/activity.ts`.
- [x] Keep YouTube tracking and historical IndexedDB data readable; only remove UI surfaces and dead calculations.
- [x] Add deterministic tests for deduplication, midnight grouping, calendar range, tooltips, streaks, local date keys, and open-interval projection.
- [ ] Load the built extension in Chrome and verify heatmap hover/selection, Activity filters, Website editing, tracking while switching tabs, and YouTube time.
