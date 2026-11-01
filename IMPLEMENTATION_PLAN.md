# Implementation plan

Implement phases sequentially. Automated build, lint, typecheck, and phase tests pass before moving to the next phase. Browser-specific behavior still needs live checks in Chrome, Edge, and Brave.

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0 — Foundation | WXT + React + TypeScript, Tailwind, lint/test setup, popup shell, docs | Typecheck, lint, unit test, Chrome MV3 build pass | Complete |
| 1 — Tracking engine | Active tab/window, idle/focus, interval accounting, worker recovery, IndexedDB | Interval/recovery tests and Chromium builds pass; popup focus fix has a screenshot regression test | Automated checks complete; updated browser check pending |
| 2 — Classification | Categories, domain defaults, user overrides, classified-time aggregates | Override precedence, validation, neutral defaults, and ratio math tested | Automated checks complete; popup rule test pending |
| 3 — YouTube | Metadata/player extraction, navigation transitions, playback timing, categories | SPA, pause, buffering, video-transition cases tested | Automated checks complete; live YouTube playback check pending |
| 4 — Dashboard | Overview, activity, websites, YouTube analytics and timeline | Analytics reconcile with stored records; true empty states | Automated checks complete; browser UI check pending |
| 5 — Wellbeing | Focus sessions, goals, configurable reminders, privacy controls/export/delete | Session summaries, settings, exclusions, and active-time reminders tested | Automated checks complete; permission and browser UI check pending |
| 6 — AI (optional) | Provider abstraction, opt-in ambiguous classification, structured confidence and feedback | Disabled by default; explicit provider permission; structured response and failure cases tested | Automated checks complete; provider opt-in smoke check pending |
| 7 — Insights | Best classified productive hour, largest recreational source, weekly comparison, YouTube learning-goal time | Calculations use stored intervals, user classifications, local calendar weeks, and playback time; empty states are honest | Implemented; browser dashboard check pending |
| 8 — Popup simplification | Focus the popup on today's total and website-category breakdown | Compact view hides advanced controls; daily data is clipped to today and overlapping intervals count once | Implemented; browser popup check pending |
| 9 — Category coverage and editing | Add common classroom, education, productivity, and communication defaults; let users edit visited domains in the dashboard | Classroom sites receive sensible defaults; unknown sites can be reclassified and persist across views | Implemented; browser rule-edit check pending |
| 10 — Bring-your-own AI | Add Gemini and Grok options and explicit one-domain website suggestions | Provider formats validated; only the clicked hostname is sent; suggestion is previewed and saved only on acceptance | Implemented with mocked provider checks; live provider check pending a user API key |
| 11 — YouTube analytics correction | Show daily totals from local-day-clipped playback records, include the active segment in live summaries, and refresh on playback updates | Totals reconcile to non-overlapping stored intervals plus at most one fresh active segment; live playback still needs a browser smoke check | Automated checks and Chromium builds complete; live YouTube check pending |
| 12 — YouTube category correction | Let users edit an unknown video category or request an optional Gemini/Grok suggestion | Metadata-only request; confidence-validated response; category is saved only after user acceptance; provider tests pass | Automated provider checks complete; browser workflow pending a user API key |
| 13 — Popup tracking recovery | Keep the normal browser tab as the tracking context while the action popup is open, recover its active tab when window results omit tabs, and inject YouTube tracking on both `youtube.com` and `www.youtube.com` | Popup-focus fallback and hostname regression tests pass; browser reload check confirms active tracking | Automated checks and Chromium builds complete; reload check pending |

## Phase 0 decisions

- Keep the generated manifest limited to the `storage` permission. Tracking permissions are not needed for a foundation shell.
- Use WXT's React module and generated MV3 manifest rather than hand-maintained generated files.
- Use Tailwind CSS v4 through its Vite plugin.
- Keep UI values unavailable until real persisted activity exists.
- Provide a compact unit test to prove the test runner and formatting utility are wired correctly.

## Phase 1 decisions

- Store only hostnames, timestamps, and durations; do not persist paths, query strings, titles, or page content.
- Use IndexedDB transactions to commit closed intervals and tracker state atomically.
- Use a one-minute alarm to recheck browser state and checkpoint intervals, and `storage.session` to distinguish worker restarts from browser restarts.
- End intervals at the last durable checkpoint after a browser restart or a detected observation gap.
- Treat idle and locked states as not trackable, and exclude the 60-second idle threshold conservatively.
- Keep tracking active while the action popup is open; re-read actual browser focus after it closes.

## Phase 2 decisions

- Separate purpose categories from productivity intent so a site's topic does not dictate how an individual uses it.
- Default mixed-use social, coding, communication, and work sites to neutral. Keep YouTube neutral at the domain level until video-level classification exists.
- Let user rules match a domain and its subdomains, with the most specific rule taking precedence.
- Calculate the browsing ratio as productive time divided by all known intent time; exclude unknown time and state the formula in the UI.
- Apply the current domain rule when aggregating historical records rather than storing redundant classification on each interval.

## Technical risks

1. MV3 worker suspension makes timer-based accounting unreliable; persist intervals and reconcile browser state on event/startup.
2. The idle API does not expose exact last-input timestamps. Excluding the full threshold can undercount active time near the transition.
3. Alarm delivery can be delayed; large observation gaps are intentionally undercounted.
4. Chromium derivatives need independent smoke checks despite sharing a build target.
5. Insights describe browsing classifications and goal phrase matches; they are estimates based on available local metadata, not measures of work quality or learning outcomes.
