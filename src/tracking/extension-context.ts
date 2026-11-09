export function isBrowserExtensionContext(
  runtime?: { id?: string },
): boolean {
  if (arguments.length > 0) return Boolean(runtime?.id);
  return typeof browser !== 'undefined' && Boolean(browser.runtime?.id);
}
