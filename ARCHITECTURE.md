# Architecture

## Phase 0 foundation

WXT owns file-based extension entrypoints and generates the Manifest V3 manifest. The React module provides the popup UI, Tailwind CSS v4 styles the UI, strict TypeScript checks application code, ESLint enforces basic static rules, and Vitest is wired to WXT's browser-aware plugin. The current popup is deliberately an honest shell: absent activity is shown as unavailable, never as zero or sample data.

## Planned modules

- **Background coordinator:** MV3 service worker listening to tab, window, idle, and runtime events. It will reconcile state on startup and after worker suspension rather than relying on in-memory timers.
- **Tracking engine:** Pure interval/state transitions, with boundaries for active tab, focused window, idle state, tracking pause, and local day changes. Activity intervals must be closed before a new one opens.
- **Local storage:** IndexedDB for append/update activity and video records; `chrome.storage.local` for user preferences and small configuration values. Persist enough tracker state to recover after service worker termination.
- **Classification:** Explicit domain/video rules, user overrides, and category metadata. A user's choice wins over defaults. Unknown remains a valid result.
- **Content scripts:** A narrowly scoped YouTube content script for visible video metadata and player state only. Validate page-derived values and do not inspect forms or collect page text outside required metadata.
- **Analytics:** Aggregations over stored intervals only. Ratios use classified browsing time and must be labeled as browsing classifications, not human productivity.
- **UI:** Popup for quick status and a dashboard page for reports, settings, and sessions. Empty states remain empty until records exist.
- **Optional AI:** No provider or external processing by default. Any future integration must be opt-in, disclosed, and abstracted behind a typed provider contract.

## Manifest V3 risks and constraints

- Service workers can be stopped at any time; correctness must come from persisted state plus event-driven reconciliation, not long-lived timers.
- Browser idle detection has a configurable threshold and cannot establish human attention with certainty. Excluded/idle intervals must not be counted.
- Exact URLs generally require broader permissions than domain labels. Request the narrowest permissions that still support user-visible features, and explain permission use.
- Chrome/Edge/Brave share Chromium APIs but differ in release timing, policy, and distribution. A Chrome build is the shared Chromium artifact; verify loading and APIs separately in each browser before claiming support.
- Browser APIs cannot observe every edge case (browser crash, OS sleep, delayed events) with perfect wall-clock precision. The tracker should close/reconcile intervals conservatively and document boundaries.

## Data boundaries

All timestamps are Unix milliseconds. The system must not collect incognito browsing. Never capture keystrokes, screenshots, form values, or browsing data to a server. Export and delete operations must cover all local stores.
