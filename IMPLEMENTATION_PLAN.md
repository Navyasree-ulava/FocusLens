# Implementation plan

Follow phases in order. Do not begin a later phase until the current phase's build and tests pass and the user reviews the result.

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0 — Foundation | WXT + React + TypeScript, Tailwind, lint/test setup, popup shell, docs | Typecheck, lint, unit test, Chrome MV3 build pass | Complete |
| 1 — Tracking engine | Active tab/window, idle/focus, interval accounting, worker recovery, IndexedDB | Unit tests prove no overlap and exclude idle/background; event reconciliation documented | Not started |
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

## Technical risks to resolve during implementation

1. MV3 service worker suspension makes timer-based accounting unreliable; persist a recoverable open interval and reconcile browser state on each relevant event/startup.
2. Tab URLs may be unavailable without suitable permissions; determine and explain the least-privilege permission model before enabling tracking.
3. YouTube is a single-page app and its player can buffer or remain paused; use navigation and player events, not periodic assumptions alone.
4. Chromium derivatives need independent smoke checks despite sharing the build target.

