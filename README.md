# FocusLens 🎯

### Understand your browsing habits. Take control of your focus.

FocusLens is a local-first browser activity tracker for Chrome, Microsoft Edge, and Brave. It records active browsing time, groups related subdomains under one root website, and shows activity in a dashboard so you can better understand your online habits.

FocusLens is designed to keep activity on your device. It stores tracking data in IndexedDB and settings in browser storage. It does not collect page paths, searches, or browsing history.

---

## ✨ Why FocusLens?

Time online can mean many things: studying, coding, communicating, shopping, or taking a break. A simple list of visits can make the same website appear repeatedly and obscure the bigger picture.

FocusLens combines local activity tracking, root-domain grouping, built-in website categories, and optional AI suggestions to make browsing summaries easier to interpret. Suggestions are always manual: FocusLens only contacts a classification provider after you request a suggestion.

## 🚀 Features

### 📊 Browsing activity analytics

- Track time on the active website while the browser window is focused and you are not idle.
- Group subdomains under their registrable root domain using the Public Suffix List. For example, `mail.google.com` and `drive.google.com` are grouped as `google.com`.
- Aggregate repeated visits and remove overlapping intervals before calculating activity totals.
- View a 12-month activity calendar, daily totals, a timeline, and website usage summaries.
- Inspect a selected day's website totals and individual activity intervals.
- See current and longest activity streaks.
- View time by website category and sort website activity by time or name.

### 🗂️ Website categories

FocusLens assigns conservative default categories to known domains. Mixed-use sites can be categorized as neutral, and unknown sites remain **Unknown** until you choose a category or accept a suggestion. You can change a website's category from the **Websites** page; your choice is stored locally.

### 🧠 Optional Jev category suggestions

FocusLens integrates the open-source [Simple Jev](https://github.com/featherless-ai/simple-jev) classification API. When enabled, you can manually request a category suggestion for an unknown website. FocusLens does not apply the suggestion until you accept it.

The default configuration uses the hosted Featherless demo endpoint and the `featherless-ai/Qwen3.6-35B-A3B-classifier` model. It requires an internet connection and does not require an API key. The public demo may be rate limited. You can also configure compatible providers in Settings; API keys for those providers are stored in browser session storage and cleared when the browser session ends.

Only the selected hostname is sent for a website suggestion. No activity history, URL path, or search query is sent. Suggestions are estimates and can be wrong.

### 📈 Dashboard and popup

- **Overview:** today's totals, top websites, streaks, and the activity calendar.
- **Activity:** daily timeline with date range filters.
- **Websites:** aggregated time, categories, category editing, and optional suggestions.
- **Categories:** time and website counts grouped by category.
- **Settings:** tracking preferences, optional classifiers, and local data export or deletion.
- **Popup:** current tracking status and today's active browsing time.

YouTube playback contributes to activity under `youtube.com`. Video-level category analytics are not currently part of the dashboard.

## 🛠️ Technology and development tools

- **React 19** and **TypeScript** for the dashboard and popup.
- **Tailwind CSS 4** for styling.
- **WXT** and **Vite** for browser-extension development and builds.
- **IndexedDB** and Chromium extension storage for local activity and settings.
- **tldts** for Public Suffix List-based root-domain grouping.
- **Simple Jev** and optional Gemini, Grok, or OpenAI-compatible classification providers.
- **Vitest** for unit tests, **ESLint** for linting, and **TypeScript** for type checking.
- **npm** for dependency and script management; **Git** for version control.

## 🧰 Set up from a clone

### Requirements

- Git
- Node.js 22 or newer
- npm (included with Node.js)
- Chrome, Edge, or Brave

### Clone and install

```sh
git clone <repository-url>
cd FocusLens
npm install
```

Replace `<repository-url>` with the URL of your FocusLens Git repository. If you downloaded the project as a ZIP instead, extract it and open a terminal in the extracted `FocusLens` folder.

### Run the development build

```sh
npm run dev
```

WXT starts a development build and prints its output location. Load the generated unpacked extension in your browser. For Edge, use `npm run dev:edge`.

### Build and load the production extension

```sh
npm run build
```

In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`; in Brave, open `brave://extensions`. Turn on **Developer mode**, choose **Load unpacked**, and select the generated `.output/chrome-mv3` folder. Reload the extension after rebuilding it, then refresh any open FocusLens dashboard tab.

FocusLens uses tab access to identify the active website's hostname, idle and alarm APIs to pause and checkpoint tracking, and local storage to save records and settings. The extension requests access to a classification host only when you enable a provider in Settings.

## ✅ Run checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## 🔎 Try it in the browser

1. Load or reload the unpacked extension, then open a few websites in regular tabs.
2. Switch between tabs and subdomains; check that the website summary groups them together and adds their time.
3. Open the dashboard and review **Overview**, **Activity**, **Websites**, and **Categories**.
4. In Settings, enable Simple Jev. Accept the host access prompt.
5. On **Websites**, choose **Suggest** for an **Unknown** site, review the result, and accept it only if it looks appropriate.
6. Pause tracking in Settings and confirm that new activity stops being recorded.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the code structure and data flow.

---

**FocusLens — Make every minute online count.**
