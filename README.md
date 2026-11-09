# FocusLens

FocusLens is a local-first Chromium browser extension for understanding browsing patterns. It targets Chrome, Microsoft Edge, and Brave, with no account, backend, or browsing-history uploads.

## Current status

Phases 0–13 are implemented: active website and YouTube tracking, classification, an analytics dashboard and Insights view, focus sessions, wellbeing settings, local data controls, optional category suggestions, a simplified daily-usage popup, expanded default categories with dashboard editing for visited sites, corrected live/daily YouTube analytics, and user-reviewed YouTube category suggestions, popup-focus recovery, and support for both YouTube hostnames. The popup shows today's active total and category breakdown; detailed controls remain in the dashboard. Its summary clips intervals to the current day and counts overlapping time once. Insights calculate productive browsing hours, recreational-site totals, week-over-week browsing time, and YouTube time matching saved learning goals. Suggestions are off by default. Website intervals and YouTube segments live in IndexedDB; rules and preferences live in `chrome.storage.local`. Website paths and searches are not collected. YouTube titles, channel names, canonical video IDs, playback state, and accepted classifications are stored locally for reports.

Coding, social media, professional work, and communication default to neutral intent. YouTube is categorized as Entertainment while its website-level intent stays neutral until individual videos are classified in Phase 3. Unknown domains remain unknown until the user adds a rule.

Typecheck, lint, unit tests, and Chrome, Edge, and Brave-targeted builds pass. Real-browser checks for the simplified popup, website rules, YouTube playback, dashboard navigation and Insights, reminders, and privacy controls are still pending.

## Optional category suggestions

Open the dashboard's **Settings** view to configure optional classification. For an open source option, choose **Simple Jev (open source)** and run a compatible [Simple Jev server](https://github.com/featherless-ai/simple-jev) locally. The default endpoint is `http://127.0.0.1:8000/v1/classifier`; enter the model ID that your server exposes. Enabling it requests access to that endpoint, and no API key is used. Gemini, Grok, and OpenAI remain available with a model name and API key. Keys stay in browser session storage and are cleared when the browser closes.

Suggestions never run automatically. On **Websites** or **YouTube**, request one suggestion, review it, and accept it before it changes a saved category. Simple Jev sends only the selected hostname or the selected video's title, channel name, and Shorts flag to the configured endpoint. Its scores are not calibrated probabilities and do not guarantee a correct label, so treat them as suggestions.

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
