# FocusLens

FocusLens is a local-first Chromium browser extension for understanding browsing patterns. It is designed for Chrome, Microsoft Edge, and Brave, with no account, backend, or browsing-history uploads.

## Current status

Phase 0 foundation is implemented. The popup is a visual shell only: it does not read browser activity or fabricate metrics. Tracking, categories, dashboard data, and focus controls are intentionally unavailable until their implementation phases are complete.

## Requirements

- Node.js 22 or newer and npm
- Windows, macOS, or Linux for development

## Setup

```sh
npm install
npm run dev
```

Load the generated `.output/chrome-mv3` directory as an unpacked extension in Chromium. For a production build, use `npm run build`. Edge uses `npm run build:edge`; Brave uses the Chrome Chromium build from `npm run build:brave`.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Privacy

The initial manifest asks only for the `storage` permission. No activity is collected in Phase 0. Future permissions must be tied to a specific feature, explained in the UI/docs, and kept as narrow as browser APIs allow. All event and page metadata is intended to remain local.

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [TODO.md](TODO.md).

