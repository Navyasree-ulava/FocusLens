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
  const window = await browser.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
  const snapshot = contextFromWindow(window, allowBrowserPopupFocus);
  if (!allowBrowserPopupFocus || snapshot.context || window.id === undefined || window.incognito) return snapshot;

  // Some Chromium builds return the normal window without populated tabs when
  // an action popup owns focus. Query active tabs by window ID as a fallback.
  const activeTabs = await browser.tabs.query({ active: true });
  const activeTab = activeTabs.find((tab) => tab.windowId === window.id);
  if (!activeTab || activeTab.id === undefined || activeTab.incognito) return snapshot;
  const domain = getTrackableDomain(activeTab.url);
  return {
    focused: true,
    context: domain ? { tabId: activeTab.id, windowId: window.id, domain } : null,
  };
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
