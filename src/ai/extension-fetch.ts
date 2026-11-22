export async function fetchFromExtensionWorker(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  const result = await browser.runtime.sendMessage({
    type: 'focuslens-ai-fetch',
    url,
    method: init?.method ?? 'GET',
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: typeof init?.body === 'string' ? init.body : null,
  }) as { status?: number; body?: string; error?: string } | undefined;
  if (!result) throw new Error('FocusLens background service did not respond. Reload the extension and dashboard.');
  if (result.error) throw new Error(result.error);
  return new Response(result.body ?? '', { status: result.status ?? 500 });
}
