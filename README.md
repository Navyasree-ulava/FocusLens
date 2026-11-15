# FocusLens

FocusLens is a local-first Chromium browser extension for understanding browsing patterns. It targets Chrome, Microsoft Edge, and Brave, with no account, backend, or browsing-history uploads.

## Current status

FocusLens tracks foreground website and YouTube activity locally and presents four sections: **Overview**, **Activity**, **Websites**, and **Settings**. Overview shows today's active browsing time, today's website count and most-visited site, the current and all-time longest active-day streak, a 12-month GitHub-style activity heatmap, and the top websites. Hovering a heatmap day shows its exact date, active browsing duration, and website count; selecting a day shows that day's total, websites, and individual intervals. The popup shows today's active total and current tracking status. Focus sessions, learning goals, Insights, browsing-intent ratios, and the separate YouTube analytics view were removed; YouTube activity still counts under `youtube.com` in the activity timeline and website ranking. Website intervals and YouTube segments live in IndexedDB; rules and preferences live in `chrome.storage.local`. Website paths and searches are not collected.

Coding, social media, professional work, and communication default to neutral intent. YouTube is categorized as Entertainment while its website-level intent stays neutral until individual videos are classified in Phase 3. Unknown domains remain unknown until the user adds a rule.

Typecheck, lint, unit tests, and the Chrome MV3 build are the release checks. Run them before loading the unpacked extension.

## Optional category suggestions

Open the dashboard's **Settings** view to configure optional classification. For the open source [Simple Jev](https://github.com/featherless-ai/simple-jev) provider, FocusLens defaults to Featherless' hosted demo at `https://simple-jev-demo-api.featherless.ai/v1/classifier` and the served model `featherless-ai/Qwen3.6-35B-A3B-classifier`. It needs an internet connection and no API key. The public demo is rate limited; wait and manually request the suggestion again if limited. You can edit the endpoint and model in Settings to use another HTTPS Simple Jev server. Gemini, Grok, and OpenAI remain available with a model name and API key. Keys stay in browser session storage and are cleared when the browser closes.

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

Reload the unpacked extension after building. Open the popup from a regular HTTPS tab and confirm it reports **Tracking** and that today's total advances. Open the dashboard from the popup and confirm Overview shows today's time, website count, most visited website, current streak, and the heatmap. Hover heatmap cells to check the date, active browsing, and website count; select a day and confirm its websites and intervals appear, then use **Today** and **Close**. Switch tabs while browsing and confirm time is not lost, then check the Activity filters and Websites sorting. Change a website's category, reload the dashboard, and confirm it persists. Confirm YouTube playback still accrues time under `youtube.com`.

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [TODO.md](TODO.md).
