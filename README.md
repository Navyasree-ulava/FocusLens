# FocusLens

FocusLens is a local-first Chromium browser extension for understanding browsing patterns. It targets Chrome, Microsoft Edge, and Brave, with no account, backend, or browsing-history uploads.

## Current status

Phase 0 foundation and Phase 1 tracking are implemented. The extension records only the hostname of an eligible active tab and its active time. It excludes background tabs, unfocused browser windows, idle periods, unsupported browser pages, and incognito browsing. Activity and tracker state stay in local IndexedDB; no page paths, query strings, titles, or content are saved.

The popup shows current tracking state, current domain, and today's active browsing duration from stored intervals. Categories and reports will arrive in later phases. This build has passed automated checks; the real browser smoke test is still pending.

## Requirements

- Node.js 22 or newer and npm
- Chrome, Edge, or Brave for loading the extension

## Setup

```sh
npm install
npm run dev
```

For an unpacked production build, use `npm run build`, then load `.output/chrome-mv3` from the browser's extension page. Chrome: `chrome://extensions`; Edge: `edge://extensions`; Brave: `brave://extensions`. Turn on Developer mode and select **Load unpacked**.

Tracking requires the `tabs`, `idle`, and `alarms` permissions in addition to `storage`. The browser uses these to identify the active tab's domain, detect focus/idle transitions, checkpoint local activity, and persist state. FocusLens does not read page paths or transmit data.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Manual smoke test needed

After loading the unpacked extension, keep a normal web tab in front for about a minute. Open the FocusLens popup and confirm its status says **Tracking**, the current website is only the hostname, and the duration advances. Then switch to another tab and confirm its hostname replaces the previous one. The popup duration should not rise while another application has browser focus. Idle detection uses a 60-second threshold and conservatively excludes that threshold window when idle begins.

To inspect locally stored intervals, open the popup's developer tools and inspect IndexedDB database `focuslens-local`, object store `activity`. Records contain a domain and start/end/duration timestamps only.

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [TODO.md](TODO.md).
