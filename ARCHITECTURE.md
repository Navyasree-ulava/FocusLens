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
- **Connection recovery:** Failed or blocked database opens clear the cached open promise so later tracker events can retry. Connections close and clear the cache on `versionchange`, allowing a new schema connection after old pages close.
- **Popup:** Shows real current tracking state and today's total from records plus the current open interval. It refreshes while open. Tracking preferences live in the dashboard Settings.

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

## Phase 4 dashboard

- **Data source:** `entrypoints/dashboard/App.tsx` reads activity intervals, tracker state, website overrides, and settings from the same local IndexedDB and `chrome.storage.local` stores as the popup. All displayed totals come from normalized intervals, so overlapping or duplicated rows count once.
- **Aggregation:** `src/analytics/activity.ts` owns local date keys, day bounds, duration formatting, heatmap intensity, calendar layout, and streak math. `buildActivityDays` clips records at local midnights, which handles variable-length days. The current open interval is projected only up to the current time and only while the browser is focused, non-idle, and tracking.
- **Overview:** Today's active browsing time, the number of distinct websites visited today, the most-visited website today, the current and longest active-day streak, a 12-month heatmap, and a ranked website list. No intent ratios or secondary analytics cards.
- **Heatmap:** Twelve calendar months in seven weekday rows and horizontally scrolling weeks. Level 0 means no activity; any recorded activity is at least level 1 even below the streak minimum. Hovering renders an accessible tooltip with the full date, exact duration, website count, and interval count. Selecting a day reveals its total, websites, and intervals with **Today** and **Close** controls; future days are disabled.
- **Streak rule:** A local calendar day is active when it has at least the configurable minimum active browsing time (default one minute). Current streak counts back from today, or from yesterday when today is still below the minimum. Longest streak covers all recorded history: the dashboard reads the full activity store once and merges it with the fresher 12-month day summaries. Future days and idle time never count.
- **Activity page:** Chronological foreground intervals grouped by local date with Today, 7-day, 30-day, and single-date filters. Rows show domain, start time, and duration; sub-minute intervals are shown in seconds rather than rounded up or hidden.
- **Websites page:** Ranked domains with total time, category, optional manual category editing, and sorting by most time, least time, or alphabetically. Simple Jev suggestions remain manual and review-before-save.
- **YouTube:** Tracking, metadata, and segmented playback remain unchanged and are stored in the `youtube` store. YouTube browsing time appears under `youtube.com` in Activity and Websites; the separate YouTube analytics and learning-goal surfaces were removed.
- **Navigation:** Four sections (Overview, Activity, Websites, Settings). The popup opens the dashboard in a browser tab, and the dashboard refreshes from stored data every 30 seconds and on tracker messages.

## Phase 5 settings and data controls

- **Tracking controls:** Global pause, excluded hostnames, and the minimum active-day threshold (one to 60 minutes, default one) are validated with Zod and stored in `chrome.storage.local`. Exclusions match the exact domain and its subdomains. The background tracker enforces pause and exclusions before it starts a new interval.
- **Settings page:** Tracking preferences, excluded domains, optional Simple Jev configuration, data export, and delete-all. Removed feature settings (daily goals, reminders, learning goals) are ignored by the settings schema and safely dropped on the next save.
- **Data controls:** Export downloads a JSON snapshot of activity, YouTube segments, tracker state, legacy focus sessions, AI classifications, and extension settings. Delete-all clears every FocusLens IndexedDB store and local/session settings after an explicit confirmation.
- **Legacy storage:** The `focusSessions` object store stays at schema version 4 so existing data remains readable, exportable, and deletable. No UI writes focus sessions anymore; deleting the store would require a migration and is not necessary for the simplification.

## Phase 6 optional classification providers

- **Provider contract:** `src/ai/types.ts` contains provider settings and result types. Gemini, Grok, and OpenAI use structured text APIs. `SimpleJevClassifier` uses the open Simple Jev `/v1/classifier` choice API for website and video categories.
- **Opt-in boundary:** Classification starts disabled. Settings require an endpoint and model; hosted text providers also require an API key. Simple Jev defaults to Featherless' hosted demo endpoint and served Qwen classifier model and does not use a key. Enabling requests optional host access for that endpoint origin; HTTPS endpoints or loopback HTTP endpoints are accepted. Hosted provider keys live in `chrome.storage.session` and are removed when disabled or the browser session ends.
- **Request scope:** No classification request runs automatically. The user requests one website or video suggestion. Website requests include only the normalized hostname; video requests include only title, channel name, and Shorts status. Video ID, URL, browsing history, and learning goals are excluded.
- **Result handling:** Responses are validated against the allowed category list, confidence range, and reason length. AI results only classify videos that remain Unknown under user rules and metadata heuristics, and only when confidence is at least 0.6. Results are stored locally. Saving one as a user rule gives the user's choice precedence over AI and metadata.
- **Failure behavior:** Network errors, timeouts, non-2xx responses, invalid JSON, and invalid structured fields surface an error and do not change local classification. Every suggestion stays review-before-save. Simple Jev confidence is a model score, not a calibrated probability or a guarantee of correctness. Tests inject fetch responses and do not contact a provider.

## Planned modules

- **Analytics:** Aggregations over stored intervals only, shared by the dashboard and popup through one deduplicated interval source.
- **Dashboard:** Four sections (Overview, Activity, Websites, Settings) with true empty states until records exist.

## Manifest V3 permissions and limits

The manifest requests `storage`, `tabs`, `idle`, and `alarms`. The `tabs` permission is needed to read the active tab's hostname as the browser changes tabs; `idle` reports system idle/locked state; `alarms` reawakens the service worker for periodic durable checkpoints; `storage` enables settings and a browser-session marker. The `incognito` manifest setting is `not_allowed`.

MV3 service workers can stop at any time, so correctness comes from persisted state plus event-driven reconciliation, not an in-memory timer. Chrome alarms can be delayed. The tracker uses a one-minute alarm and conservatively drops time when it detects a gap longer than two minutes. Browser APIs also cannot reconstruct the user's exact last physical input time; the idle grace interval is excluded to avoid counting idle time, at the cost of some undercounting around idle transitions.

Chrome, Edge, and Brave share Chromium APIs but differ in release timing, policy, and distribution. A Chrome build is the shared Chromium artifact; load and test it separately in each browser before claiming compatibility there.

## Future data boundaries

All timestamps are Unix milliseconds. Do not collect incognito browsing, keystrokes, screenshots, passwords, form values, or browsing data for a server. Export and delete controls must cover every local store when implemented.
