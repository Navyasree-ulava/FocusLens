# Implementation plan

Follow phases in order. Do not begin a later phase until the current phase's build and automated tests pass and its real-browser smoke test has been reviewed.

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0 — Foundation | WXT + React + TypeScript, Tailwind, lint/test setup, popup shell, docs | Typecheck, lint, unit test, Chrome MV3 build pass | Complete |
| 1 — Tracking engine | Active tab/window, idle/focus, interval accounting, worker recovery, IndexedDB | Automated interval/recovery tests and Chrome build pass; manual browser smoke test | Awaiting manual browser check |
| 2 — Classification | Categories, domain defaults, user overrides, classified-time aggregates | Override precedence and unknown behavior tested | Not started |
| 3 — YouTube | Metadata/player extraction, navigation transitions, playback timing, categories | SPA, pause, buffering, video-transition cases tested | Not started |
| 4 — Dashboard | Overview, activity, websites, YouTube analytics and timeline | All charts reconcile with stored records; true empty states | Not started |
| 5 — Wellbeing | Focus sessions, goals, configurable reminders, privacy controls/export/delete | Data controls and session summaries tested | Not started |
| 6 — AI (optional) | Provider abstraction, opt-in ambiguous classification, structured confidence and feedback | Disabled by default; consent and failure cases tested | Not started |

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
- Run automated checks after each phase. Actual browser behavior still needs confirmation by loading the extension in Chrome.

## Technical risks

1. MV3 worker suspension makes timer-based accounting unreliable; persist intervals and reconcile browser state on event/startup.
2. The idle API does not expose exact last-input timestamps. Excluding the full threshold can undercount active time near the transition.
3. Alarm delivery can be delayed; large observation gaps are intentionally undercounted.
4. Chromium derivatives need independent smoke checks despite sharing a build target.
