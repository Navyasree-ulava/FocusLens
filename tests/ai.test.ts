import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { TrackingEngine } from '../src/tracking/engine';
import { AI_API_KEY_SESSION_KEY, AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS, aiEndpointOrigin, aiHostPermissionPattern, endpointForProvider, loadAIAPIKey, loadAISettings, parseAISettings, saveAIAPIKey, saveAISettings } from '../src/ai/settings';
import { OpenAIResponsesProvider } from '../src/ai/responses-provider';
import { AIWebsiteClassifier } from '../src/ai/website-provider';
import { AIYouTubeClassifier } from '../src/ai/youtube-provider';
import { SimpleJevClassifier } from '../src/ai/simple-jev';

beforeEach(async () => {
  await browser.storage.local.clear();
  await browser.storage.session.clear();
});

describe('AI provider settings', () => {
  it('keeps AI disabled by default and rejects insecure remote endpoints', () => {
    expect(parseAISettings(undefined).enabled).toBe(false);
    expect(parseAISettings(undefined).provider).toBe('jev');
    expect(parseAISettings(undefined)).toMatchObject({ endpoint: 'https://simple-jev-demo-api.featherless.ai/v1/classifier', model: 'featherless-ai/Qwen3.6-35B-A3B-classifier' });
    expect(endpointForProvider('gemini')).toContain('generativelanguage.googleapis.com');
    expect(endpointForProvider('jev')).toBe(DEFAULT_AI_SETTINGS.endpoint);
    expect(endpointForProvider('grok')).toBe('https://api.x.ai/v1/responses');
    expect(parseAISettings({ enabled: false, endpoint: 'https://api.openai.com/v1/responses', model: '' }).provider).toBe('openai');
    expect(parseAISettings({ enabled: true, endpoint: 'http://example.com/v1/responses', model: 'x' })).toMatchObject({ enabled: false });
    expect(parseAISettings({ enabled: true, endpoint: 'https://user:pass@example.com/v1/responses', model: 'x' })).toMatchObject({ enabled: false });
    expect(() => aiEndpointOrigin('http://example.com/v1/responses')).toThrow();
    expect(aiEndpointOrigin('https://api.example.com/v1/responses')).toBe('https://api.example.com');
    expect(aiEndpointOrigin('http://localhost:11434/v1/responses')).toBe('http://localhost:11434');
    expect(aiHostPermissionPattern('http://localhost:11434/v1/responses')).toBe('http://localhost/*');
  });

  it('saves Simple Jev without retaining an API key', async () => {
    await saveAIAPIKey('previous-provider-key');
    const settings = await saveAISettings({
      enabled: true,
      provider: 'jev',
      endpoint: endpointForProvider('jev'),
      model: DEFAULT_AI_SETTINGS.model,
    });
    expect(settings).toMatchObject({ enabled: true, provider: 'jev' });
    expect(await loadAIAPIKey()).toBeNull();
  });

  it('keeps the API key in session storage and clears it when AI is disabled', async () => {
    await saveAISettings({ enabled: false, provider: 'openai', endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-example' });
    await saveAIAPIKey('session-secret-key');
    expect(await loadAISettings()).toMatchObject({ enabled: false, model: 'gpt-example' });
    expect(await loadAIAPIKey()).toBe('session-secret-key');
    expect((await browser.storage.local.get(null))[AI_API_KEY_SESSION_KEY]).toBeUndefined();
    expect((await browser.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY]).toMatchObject({ enabled: false });
    await saveAISettings({ enabled: false, provider: 'openai', endpoint: 'https://api.openai.com/v1/responses', model: '' });
    expect(await loadAIAPIKey()).toBeNull();
  });
});

describe('AI website classification', () => {
  it('sends only the selected hostname to Gemini and validates the suggested category', async () => {
    let requestBody = '';
    let authorization = '';
    const classifier = new AIWebsiteClassifier({
      enabled: true,
      provider: 'gemini',
      endpoint: endpointForProvider('gemini'),
      model: 'gemini-test',
    }, 'gemini-test-key', async (_input, init) => {
      requestBody = String(init?.body);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ category: 'Academic', confidence: 0.94, reason: 'The hostname is a classroom platform.' }) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await expect(classifier.classify('https://classroom.vendor.edu/course/private-path?student=1')).resolves.toEqual({
      category: 'Academic', confidence: 0.94, reason: 'The hostname is a classroom platform.',
    });
    expect(authorization).toBe('Bearer gemini-test-key');
    const body = JSON.parse(requestBody) as { messages: { content: string }[]; response_format: unknown };
    expect(body.messages[1]?.content).toContain('classroom.vendor.edu');
    expect(body.messages[1]?.content).not.toContain('private-path');
    expect(body.messages[1]?.content).not.toContain('student=1');
    expect(body.response_format).toBeDefined();
  });

  it('supports Grok Responses and rejects invalid categories', async () => {
    const classifier = new AIWebsiteClassifier({ enabled: true, provider: 'grok', endpoint: endpointForProvider('grok'), model: 'grok-test' }, 'grok-test-key', async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ category: 'Not a category', confidence: 0.8, reason: 'Invalid test result.' }),
    }), { status: 200 }));
    await expect(classifier.classify('unknown.example')).rejects.toThrow('invalid website category');
  });
});

describe('Simple Jev classification', () => {
  const settings = {
    enabled: true,
    provider: 'jev' as const,
    endpoint: endpointForProvider('jev'),
    model: DEFAULT_AI_SETTINGS.model,
  };

  it('scores website categories using only the normalized hostname', async () => {
    let requestBody = '';
    let authorization: string | null = null;
    const classifier = new SimpleJevClassifier(settings, async (_input, init) => {
      requestBody = String(init?.body);
      authorization = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify({ answers: { website_category: { type: 'choice', choice: 'D', confidence: 0.82, probabilities: {} } } }), { status: 200 });
    });
    await expect(classifier.classifyWebsite('https://classroom.example.edu/course/private?user=1')).resolves.toMatchObject({ category: 'Academic', confidence: 0.82 });
    const request = JSON.parse(requestBody) as { model: string; state: { website: string; description: string }; questions: { website_category: { type: string; criteria: Record<string, string> } } };
    expect(request.model).toBe(settings.model);
    expect(request.state.website).toBe('classroom.example.edu');
    expect(request.state.description).toBeTruthy();
    expect(request.questions.website_category.type).toBe('choice');
    expect(request.questions.website_category.criteria.D).toContain('Academic');
    expect(requestBody).toContain('website_category');
    expect(requestBody).toContain('featherless-ai/Qwen3.6-35B-A3B-classifier');
    expect(requestBody).not.toContain('private');
    expect(requestBody).not.toContain('user=1');
    expect(authorization).toBeNull();
  });

  it('scores video metadata only and rejects choices outside the supplied set', async () => {
    let requestBody = '';
    const classifier = new SimpleJevClassifier(settings, async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ answers: { youtube_category: { type: 'choice', choice: 'A', confidence: 0.91 } } }), { status: 200 });
    });
    await expect(classifier.classifyYouTube({ title: 'TypeScript course', channelName: 'Code Lab', isShort: false })).resolves.toMatchObject({ category: 'Technical Learning', confidence: 0.91 });
    expect(requestBody).toContain('TypeScript course');
    expect(requestBody).not.toContain('videoId');
    expect(requestBody).not.toContain('videoUrl');
    expect(requestBody).toContain('youtube_category');

    const invalid = new SimpleJevClassifier(settings, async () => new Response(JSON.stringify({ answers: { youtube_category: { type: 'choice', choice: 'Z', confidence: 0.9 } } }), { status: 200 }));
    await expect(invalid.classifyYouTube({ title: 'A title', channelName: null, isShort: false })).rejects.toThrow('outside the supplied options');
  });

  it('surfaces endpoint failures and timeouts without accepting a category', async () => {
    const unavailable = new SimpleJevClassifier(settings, async () => new Response('server unavailable', { status: 503 }));
    await expect(unavailable.classifyWebsite('example.com')).rejects.toThrow('temporarily unavailable');
    const limited = new SimpleJevClassifier(settings, async () => new Response('rate limited', { status: 429 }));
    await expect(limited.classifyWebsite('example.com')).rejects.toThrow('rate limited');
    const timedOut = new SimpleJevClassifier(settings, async () => { throw new DOMException('aborted', 'AbortError'); });
    await expect(timedOut.classifyWebsite('example.com')).rejects.toThrow('timed out');
    let calls = 0;
    const disabled = new SimpleJevClassifier({ ...settings, enabled: false }, async () => { calls += 1; return new Response('{}'); });
    await expect(disabled.classifyWebsite('example.com')).rejects.toThrow('Enable Simple Jev');
    expect(calls).toBe(0);
  });

  it.each([
    [400, 'rejected the request'],
    [401, 'denied access'],
    [403, 'denied access'],
    [429, 'rate limited'],
    [503, 'temporarily unavailable'],
  ])('shows an actionable message for HTTP %i', async (status, message) => {
    const classifier = new SimpleJevClassifier(settings, async () => new Response('provider error', { status }));
    await expect(classifier.classifyWebsite('example.com')).rejects.toThrow(message);
  });

  it('rejects malformed answers, invalid confidence, and malformed JSON', async () => {
    const invalidConfidence = new SimpleJevClassifier(settings, async () => new Response(JSON.stringify({ answers: { website_category: { type: 'choice', choice: 'A', confidence: 1.1 } } }), { status: 200 }));
    await expect(invalidConfidence.classifyWebsite('example.com')).rejects.toThrow('invalid category answer');
    const missingAnswer = new SimpleJevClassifier(settings, async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }));
    await expect(missingAnswer.classifyWebsite('example.com')).rejects.toThrow('invalid category answer');
    const malformedJson = new SimpleJevClassifier(settings, async () => new Response('{broken', { status: 200 }));
    await expect(malformedJson.classifyWebsite('example.com')).rejects.toThrow('invalid JSON');
  });

  it('keeps tracking and durable activity writes independent of Jev failures', async () => {
    const store = new IndexedDbActivityStore(`focuslens-jev-isolation-${crypto.randomUUID()}`);
    const tracker = new TrackingEngine(store, { idleThresholdMs: 60_000, createId: () => 'jev-isolation-record' });
    const classifier = new SimpleJevClassifier(settings, async () => { throw new TypeError('offline'); });
    const classificationFailure = expect(classifier.classifyWebsite('example.com')).rejects.toThrow('Could not reach');
    await tracker.reconcile({ observedAt: 1_000, focused: true, idle: false, context: { tabId: 1, windowId: 1, domain: 'example.com' } });
    await tracker.reconcile({ observedAt: 5_000, focused: false, idle: false, context: null });
    await classificationFailure;
    expect(await store.listRecords(0, 10_000)).toMatchObject([{ domain: 'example.com', startedAt: 1_000, endedAt: 5_000, durationMs: 4_000 }]);
  });
});

describe('AI YouTube classification', () => {
  it('uses the selected free provider with only video metadata and validates its category', async () => {
    let requestBody = '';
    const classifier = new AIYouTubeClassifier({ enabled: true, provider: 'gemini', endpoint: endpointForProvider('gemini'), model: 'gemini-test' }, 'gemini-test-key', async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ category: 'Technical Learning', confidence: 0.91, reason: 'The title is a programming lesson.' }) } }] }), { status: 200 });
    });
    await expect(classifier.classify({ title: 'TypeScript tutorial', channelName: 'Code Lab', isShort: false })).resolves.toEqual({ category: 'Technical Learning', confidence: 0.91, reason: 'The title is a programming lesson.' });
    const body = JSON.parse(requestBody) as { messages: { content: string }[] };
    expect(body.messages[1]?.content).toContain('TypeScript tutorial');
    expect(body.messages[1]?.content).not.toContain('https://');
  });

  it('supports Grok and rejects malformed category responses', async () => {
    const classifier = new AIYouTubeClassifier({ enabled: true, provider: 'grok', endpoint: endpointForProvider('grok'), model: 'grok-test' }, 'grok-test-key', async () => new Response(JSON.stringify({ output_text: JSON.stringify({ category: 'Wrong', confidence: 0.8, reason: 'Invalid category.' }) }), { status: 200 }));
    await expect(classifier.classify({ title: 'A video', channelName: null, isShort: false })).rejects.toThrow('invalid YouTube category');
  });
});

describe('Responses API provider', () => {
  it('sends only the current video metadata and parses a structured result', async () => {
    let sentBody = '';
    let sentAuthorization = '';
    const fetcher: typeof fetch = async (_input, init) => {
      sentBody = String(init?.body);
      sentAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ category: 'Educational', confidence: 0.91, reason: 'The title describes a science lesson.' }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const provider = new OpenAIResponsesProvider({ endpoint: 'https://api.example.com/v1/responses', model: 'test-model', apiKey: 'test-secret', fetcher });
    const result = await provider.classify({ metadata: { title: 'Science lesson', channelName: 'Example channel', isShort: false } });
    expect(result).toEqual({ category: 'Educational', confidence: 0.91, reason: 'The title describes a science lesson.' });
    expect(sentAuthorization).toBe('Bearer test-secret');
    const request = JSON.parse(sentBody) as { store: boolean; input: { content: string }[] };
    expect(request.store).toBe(false);
    expect(request.input[1]?.content).toContain('Science lesson');
    expect(request.input[1]?.content).toContain('Example channel');
    expect(request.input[1]?.content).not.toContain('videoId');
    expect(request.input[1]?.content).not.toContain('videoUrl');
  });

  it('rejects malformed, invalid, and failed provider responses', async () => {
    const badJson = new OpenAIResponsesProvider({
      endpoint: 'https://api.example.com/v1/responses', model: 'model', apiKey: 'secret',
      fetcher: async () => new Response(JSON.stringify({ output_text: '{bad' }), { status: 200 }),
    });
    await expect(badJson.classify({ metadata: { title: 'Video', channelName: null, isShort: false } })).rejects.toThrow('invalid JSON');
    const invalidCategory = new OpenAIResponsesProvider({
      endpoint: 'https://api.example.com/v1/responses', model: 'model', apiKey: 'secret',
      fetcher: async () => new Response(JSON.stringify({ output_text: JSON.stringify({ category: 'Definitely productive', confidence: 3, reason: 'Unknown' }) }), { status: 200 }),
    });
    await expect(invalidCategory.classify({ metadata: { title: 'Video', channelName: null, isShort: false } })).rejects.toThrow('invalid classification');
    const failed = new OpenAIResponsesProvider({
      endpoint: 'https://api.example.com/v1/responses', model: 'model', apiKey: 'secret',
      fetcher: async () => new Response('private provider error', { status: 500 }),
    });
    await expect(failed.classify({ metadata: { title: 'Video', channelName: null, isShort: false } })).rejects.toThrow('HTTP 500');
    const timedOut = new OpenAIResponsesProvider({
      endpoint: 'https://api.example.com/v1/responses', model: 'model', apiKey: 'secret',
      fetcher: async () => { throw new DOMException('aborted', 'AbortError'); },
    });
    await expect(timedOut.classify({ metadata: { title: 'Video', channelName: null, isShort: false } })).rejects.toThrow('timed out');
    await expect(timedOut.classify({ metadata: { title: null, channelName: null, isShort: false } })).rejects.toThrow('does not have a title');
  });

  it('persists AI classifications locally and removes them with all activity data', async () => {
    const store = new IndexedDbActivityStore(`focuslens-ai-${crypto.randomUUID()}`);
    const classification = { videoId: 'abcdefghijk', category: 'News' as const, confidence: 0.8, reason: 'The video is a news report.', classifiedAt: 10 };
    await store.saveAIClassification(classification);
    expect(await store.listAIClassifications()).toEqual([classification]);
    await store.clearAllData();
    expect(await store.listAIClassifications()).toEqual([]);
  });
});
