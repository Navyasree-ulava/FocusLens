import type { ActiveContext } from './types';

export interface BrowserContextSnapshot {
  focused: boolean;
  context: ActiveContext | null;
}

export async function readBrowserContext(): Promise<BrowserContextSnapshot> {
  const window = await browser.windows.getLastFocused({ populate: true });
  if (!window.focused) return { focused: false, context: null };
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
