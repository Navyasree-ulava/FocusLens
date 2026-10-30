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
- [ ] Load the unpacked build in Chrome and verify permissions and live tracking.

## Later phases
- [ ] Phase 2: website categories, rules and user overrides.
- [ ] Phase 3: YouTube metadata and playback tracking.
- [ ] Phase 4: analytics dashboard from actual stored activity.
- [ ] Phase 5: focus sessions, wellbeing settings and data controls.
- [ ] Phase 6: optional, opt-in AI provider interface.
