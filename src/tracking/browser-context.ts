import type { ActiveContext } from './types';

export interface BrowserContextSnapshot {
  focused: boolean;
  context: ActiveContext | null;
}

export function contextFromWindow(
  window: Browser.windows.Window,
  allowBrowserPopupFocus = false,
): BrowserContextSnapshot {
  const focused = window.focused || allowBrowserPopupFocus;
  if (!focused) return { focused: false, context: null };
  if (window.incognito) return { focused: true, context: null };

  const activeTab = window.tabs?.find((tab) => tab.active);
  if (!activeTab || activeTab.id === undefined || window.id === undefined || activeTab.incognito) {
    return { focused: true, context: null };
  }

  const domain = getTrackableDomain(activeTab.url);
  return {
    focused: true,
    context: domain ? { tabId: activeTab.id, windowId: window.id, domain } : null,
  };
}

export async function readBrowserContext(allowBrowserPopupFocus = false): Promise<BrowserContextSnapshot> {
  // Action popups may be surfaced as a focused popup window without tabs.
  // Ask for the last normal browser window so opening our own popup cannot
  // replace the active website with an empty extension window.
  const window = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
  if (window.id === undefined || window.incognito) return contextFromWindow(window, allowBrowserPopupFocus);

  // Do not trust the optionally populated `window.tabs` array here. Chromium
  // can omit it (or return an empty array) around action-popup focus changes.
  // Query the active tab explicitly for the selected normal window instead.
  const activeTabs = await browser.tabs.query({ active: true, windowId: window.id });
  const activeTab = activeTabs.find((tab) => tab.windowId === window.id);
  const snapshot = contextFromWindow({ ...window, tabs: activeTab ? [activeTab] : [] }, allowBrowserPopupFocus);
  if (snapshot.context || !allowBrowserPopupFocus || !activeTab || activeTab.id === undefined || activeTab.incognito) return snapshot;
  const domain = getTrackableDomain(activeTab.url);
  return { focused: true, context: domain ? { tabId: activeTab.id, windowId: window.id, domain } : null };
}

export function getTrackableDomain(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
