export function normalizeDomain(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    return hostname && !hostname.includes('..') ? hostname : null;
  } catch {
    return null;
  }
}
