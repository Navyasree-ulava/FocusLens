# Architecture

## Phase 0 foundation

WXT owns file-based extension entrypoints and generates the Manifest V3 manifest. The React module provides the popup UI, Tailwind CSS v4 styles the UI, strict TypeScript checks application code, ESLint enforces basic static rules, and Vitest is wired to WXT's browser-aware plugin. Empty states use stored activity only and never sample data.

## Phase 1 tracking

- **Background coordinator:** `entrypoints/background.ts` registers tab, window-focus, idle, alarm, install, startup, and popup-port listeners synchronously. Event work is serialized through a promise queue and browser state is re-read before interval transitions.
- **Popup focus behavior:** The popup keeps a runtime port open while displayed. If opening the browser-action popup temporarily clears browser-window focus, the background worker uses the last-focused normal tab as the current website while that port exists. A real focus change closes the popup port and normal blur pauses tracking.
- **Tracking engine:** A pure state transition component starts and closes a single active interval. It closes the previous interval on tab/domain changes, window blur, idle, or an unsupported page. All intervals use Unix milliseconds and are split at local midnight.
- **Idle handling:** The browser idle threshold is 60 seconds. On the idle transition, the engine closes at the event time minus that threshold, excluding the transition grace window conservatively. Locked state also counts as idle.
- **Checkpoint/recovery:** A one-minute browser alarm rechecks current browser and idle state, then checkpoints the open interval. Each checkpoint commits activity rows and tracker state together in one IndexedDB transaction. An open interval survives service-worker termination. A `storage.session` marker distinguishes a worker restart from a new browser session; a browser restart closes the old interval at its last durable checkpoint. If event observation is delayed by more than two checkpoint periods, the tracker closes at the last durable checkpoint and starts a fresh interval when state is next observed. This may undercount a long gap, but does not count unknown time as active.
- **Storage:** IndexedDB database `focuslens-local` contains `activity` (domain and interval only) and `metadata` (the current state needed for recovery). The popup reads this same store. No full URL, title, page content, or account data is collected.
- **Popup:** Shows real current tracking state, active hostname, and today's total from records plus the current open interval. It refreshes while open. It has no active pause control yet; wellbeing controls are Phase 5.

## Phase 2 classification

- **Categories:** Learning, Coding & Development, Documentation, Academic, Professional Work, Communication, Social Media, Entertainment, Gaming, Shopping, and Unknown.
- **Domain defaults:** `src/classification/domain-rules.ts` maps known hostnames to purpose categories. Rules match exact hostnames and subdomains using label boundaries, with the most specific rule first. YouTube is Entertainment/neutral; mixed-use social, coding, work, and communication domains stay neutral by default.
- **User rules:** Validated with Zod and saved in `chrome.storage.local`. An override includes domain, category, productivity intent, and update timestamp. The longest matching user domain wins and a user rule takes precedence over defaults. Changes apply to historical stored intervals when totals are recomputed.
- **Summary math:** The popup aggregates stored intervals by category and by productive, recreational, neutral, or unknown intent. Its classified-time ratio is productive ÷ (productive + recreational + neutral); unknown is excluded. An empty or fully unknown dataset has no ratio.
- **Editing:** Users can change the current domain's category/intent or add/remove rules for any domain from the popup.

## Phase 3 YouTube intelligence

- **Collection boundary:** A content script runs only on `www.youtube.com`. It reads the current video ID, title, channel label, canonical watch/Shorts URL, and the `<video>` playback state. It does not read transcript, comments, search text, or unrelated page content.
- **Foreground accounting:** The background coordinator sends current browser-tab/focus/idle state to the YouTube content script. YouTube playback and browsing segments are counted only while the tab is the foreground active tab in a focused, non-idle browser window. The popup port maintains this context while the browser action is open.
- **Player lifecycle:** Media events, YouTube SPA navigation events, URL/history changes, visibility changes, and DOM changes update the segment tracker. It separates playing, paused, buffering, and browsing; long missed-checkpoint gaps are excluded conservatively.
- **Classification:** Video and channel overrides take precedence, followed by matching learning goals and conservative title/channel keywords. Uncertain content remains Unknown. Shorts are identified from their canonical path when available.
- **Persistence and reports:** Validated YouTube segments live in the local IndexedDB `youtube` store. Learning goals and video/channel rules live in `chrome.storage.local`. The popup calculates learning, entertainment, Shorts, paused, buffering, and browsing totals from stored records only.
- **Privacy detail:** YouTube reports require locally storing video titles, channel names, and canonical video IDs/URLs. General browsing storage remains hostname-only. No YouTube data is uploaded.

## Planned modules

- **Analytics:** Aggregations over stored intervals only. Ratios use classified browsing time and must be labeled as browsing classifications, not human productivity.
- **Dashboard:** Reports, settings, sessions, and true empty states until records exist.
- **Optional AI:** No provider or external processing by default. Any future integration must be opt-in, disclosed, and abstracted behind a typed provider contract.

## Manifest V3 permissions and limits

The manifest requests `storage`, `tabs`, `idle`, and `alarms`. The `tabs` permission is needed to read the active tab's hostname as the browser changes tabs; `idle` reports system idle/locked state; `alarms` reawakens the service worker for periodic durable checkpoints; `storage` enables settings and a browser-session marker. The `incognito` manifest setting is `not_allowed`.

MV3 service workers can stop at any time, so correctness comes from persisted state plus event-driven reconciliation, not an in-memory timer. Chrome alarms can be delayed. The tracker uses a one-minute alarm and conservatively drops time when it detects a gap longer than two minutes. Browser APIs also cannot reconstruct the user's exact last physical input time; the idle grace interval is excluded to avoid counting idle time, at the cost of some undercounting around idle transitions.

Chrome, Edge, and Brave share Chromium APIs but differ in release timing, policy, and distribution. A Chrome build is the shared Chromium artifact; load and test it separately in each browser before claiming compatibility there.

## Future data boundaries

All timestamps are Unix milliseconds. Do not collect incognito browsing, keystrokes, screenshots, passwords, form values, or browsing data for a server. Export and delete controls must cover every local store when implemented.
