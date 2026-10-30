# Architecture

## Phase 0 foundation

WXT owns file-based extension entrypoints and generates the Manifest V3 manifest. The React module provides the popup UI, Tailwind CSS v4 styles the UI, strict TypeScript checks application code, ESLint enforces basic static rules, and Vitest is wired to WXT's browser-aware plugin. Empty states use stored activity only and never sample data.

## Phase 1 tracking

- **Background coordinator:** `entrypoints/background.ts` registers tab, window-focus, idle, alarm, install, and startup listeners synchronously. Event work is serialized through a promise queue and browser state is re-read before interval transitions.
- **Tracking engine:** A pure state transition component starts and closes a single active interval. It closes the previous interval on tab/domain changes, window blur, idle, or an unsupported page. All intervals use Unix milliseconds and are split at local midnight.
- **Idle handling:** The browser idle threshold is 60 seconds. On the idle transition, the engine closes at the event time minus that threshold, excluding the transition grace window conservatively. Locked state also counts as idle.
- **Checkpoint/recovery:** A one-minute browser alarm rechecks current browser and idle state, then checkpoints the open interval. Each checkpoint commits activity rows and tracker state together in one IndexedDB transaction. An open interval survives service-worker termination. A `storage.session` marker distinguishes a worker restart from a new browser session; a browser restart closes the old interval at its last durable checkpoint. If event observation is delayed by more than two checkpoint periods, the tracker closes at the last durable checkpoint and starts a fresh interval when state is next observed. This may undercount a long gap, but does not count unknown time as active.
- **Storage:** IndexedDB database `focuslens-local` contains `activity` (domain and interval only) and `metadata` (the current state needed for recovery). The popup reads this same store. No full URL, title, page content, or account data is collected.
- **Popup:** Shows real current tracking state, active hostname, and today's total from records plus the current open interval. It refreshes while open. It has no active pause control yet; wellbeing controls are Phase 5.

## Planned modules

- **Classification:** Explicit domain/video rules, user overrides, and category metadata. A user's choice wins over defaults. Unknown remains a valid result.
- **YouTube content script:** A narrowly scoped script for video metadata and player state only. Validate page-derived values and do not inspect forms or collect unrelated page text.
- **Analytics:** Aggregations over stored intervals only. Ratios use classified browsing time and must be labeled as browsing classifications, not human productivity.
- **Dashboard:** Reports, settings, sessions, and true empty states until records exist.
- **Optional AI:** No provider or external processing by default. Any future integration must be opt-in, disclosed, and abstracted behind a typed provider contract.

## Manifest V3 permissions and limits

The manifest requests `storage`, `tabs`, `idle`, and `alarms`. The `tabs` permission is needed to read the active tab's hostname as the browser changes tabs; `idle` reports system idle/locked state; `alarms` reawakens the service worker for periodic durable checkpoints; `storage` enables a browser-session marker. The `incognito` manifest setting is `not_allowed`.

MV3 service workers can stop at any time, so correctness comes from persisted state plus event-driven reconciliation, not an in-memory timer. Chrome alarms can be delayed. The tracker uses a one-minute alarm and conservatively drops time when it detects a gap longer than two minutes. Browser APIs also cannot reconstruct the user's exact last physical input time; the idle grace interval is excluded to avoid counting idle time, at the cost of some undercounting around idle transitions.

Chrome, Edge, and Brave share Chromium APIs but differ in release timing, policy, and distribution. A Chrome build is the shared Chromium artifact; load and test it separately in each browser before claiming compatibility there.

## Future data boundaries

All timestamps are Unix milliseconds. Do not collect incognito browsing, keystrokes, screenshots, passwords, form values, or browsing data for a server. Export and delete controls must cover every local store when implemented.
