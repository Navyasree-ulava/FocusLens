# FocusLens

FocusLens is a local-first browser extension that shows where your active browsing time goes. It supports Chrome, Edge, and Brave. Activity records and settings stay in the browser profile; FocusLens does not collect page paths, searches, or browsing history.

## What it does

- Tracks the active website while the browser is focused and you are not idle.
- Combines subdomains under their registered domain (for example, `mail.google.com` and `drive.google.com` become `google.com`).
- Removes overlapping intervals before calculating totals.
- Shows daily activity, a 12-month calendar, website totals, category totals, and a timeline.
- Lets you correct a website category and optionally request a category suggestion.
- Stores activity in IndexedDB and preferences in browser storage.

YouTube contributes to website activity as `youtube.com`. Category suggestions are manual: FocusLens only sends the selected hostname, or selected video title/channel/Shorts flag, to the provider after you request a suggestion. You must accept a suggestion before it changes a category.

## Install for development

Requirements: Node.js 22 or newer, npm, and a Chromium based browser.

```sh
npm install
npm run dev
```

For a production build, run `npm run build`, then open `chrome://extensions` (or `edge://extensions` / `brave://extensions`), enable Developer mode, select **Load unpacked**, and choose `.output/chrome-mv3`.

The extension needs access to tabs to read the active tab's hostname, idle state to pause tracking while you are away, alarms for durable checkpoints, and storage for local records.

## Simple Jev suggestions

Simple Jev is the default provider. In the dashboard, open **Settings**, leave the provider as **Simple Jev**, and select **Enable and save**. It uses the hosted demo endpoint and model by default, requires internet access, and does not require an API key. The demo can be rate limited.

To try it, open **Websites**, find an entry categorized **Unknown**, select **Suggest**, review the returned category, then select the accept button to save it. This request sends only the hostname. A suggestion is not guaranteed to be correct.

The live hosted endpoint was checked on 22 November 2026 with a sample `github.com` request and returned HTTP 200 with a valid category response. To check it yourself, enable Simple Jev as above and request a suggestion for an Unknown site. A rate-limit or connection message means the service could not complete that request; retry later or check your connection and endpoint/model settings.

Gemini, Grok, and OpenAI providers are also available with an endpoint, model, and API key. API keys are kept in browser session storage and cleared when the browser session ends.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Manual check

After loading or reloading the unpacked extension, open a few sites and switch between tabs and subdomains. Verify the Websites and Categories views show one aggregated root-domain total. Check the Activity view for individual intervals, pause tracking in Settings, and verify a requested category suggestion is only saved after you accept it.

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details.
