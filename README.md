# FocusLens

FocusLens is a local-first Chromium browser extension for understanding browsing patterns. It targets Chrome, Microsoft Edge, and Brave, with no account, backend, or browsing-history uploads.

## Current status

Phases 0–4 are implemented: the extension foundation, active website tracking, website categorization, YouTube video-level tracking, and an analytics dashboard. The popup shows actual stored time, website classification, YouTube playback summaries, and local learning-goal and video/channel rules. The dashboard reports daily trends, intent totals, visited websites, activity intervals, and YouTube viewing. User rules live in `chrome.storage.local`; activity intervals and YouTube segments live in IndexedDB. Website paths and searches are not collected. YouTube titles, channel names, canonical video IDs and playback state are stored locally for the requested video reports.

Coding, social media, professional work, and communication default to neutral intent. YouTube is categorized as Entertainment while its website-level intent stays neutral until individual videos are classified in Phase 3. Unknown domains remain unknown until the user adds a rule.

Typecheck, lint, unit tests, and Chrome and Edge builds pass; the Brave-targeted build shares the Chrome artifact. Real-browser checks for popup focus, website rules, YouTube playback, and dashboard navigation are still pending.

## Requirements

- Node.js 22 or newer and npm
- Chrome, Edge, or Brave for loading the extension

## Setup

```sh
npm install
npm run dev
```

For an unpacked production build, use `npm run build`, then load `.output/chrome-mv3` from the browser's extension page. Chrome: `chrome://extensions`; Edge: `edge://extensions`; Brave: `brave://extensions`. Turn on Developer mode and select **Load unpacked**.

Tracking requires the `tabs`, `idle`, and `alarms` permissions in addition to `storage`. FocusLens uses these to identify the active tab's domain, detect focus/idle transitions, checkpoint local activity, and persist state. It does not read page paths or transmit data.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Manual browser check

Reload the unpacked extension after building. Open the popup from a regular HTTPS tab and confirm it says **Tracking**, shows that tab's hostname, and continues advancing today's time while the popup stays open. Switch to another active tab and verify the hostname and category change. Set a category or intent override, close and reopen the popup, and confirm the selection persists. Under **Manage domains**, add a custom domain and check that its rule appears.

The productivity ratio is productive time divided by productive, recreational, and neutral browsing time; unknown time is excluded. It describes classifications of browsing time, not a measure of personal productivity.

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [TODO.md](TODO.md).
