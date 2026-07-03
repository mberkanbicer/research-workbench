import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAICompatibleAdapter,
  OpenRouterAdapter,
  OllamaAdapter,
} from './provider.adapters.js';

// ---------------------------------------------------------------------------
// Mock fetch for controlled HTTP responses
// ---------------------------------------------------------------------------
function mockFetch(responseBody: any, status = 200, statusText = 'OK') {
  const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(bodyStr),
    json: () => Promise.resolve(typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody),
  });
}

describe('OpenAICompatibleAdapter', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  it('parses a standard OpenAI chat completion response', async () => {
    global.fetch = mockFetch({
      choices: [{ message: { content: '{"result":"ok"}' } }],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
    });

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model', 'sk-test');
    const result = await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.content).toBe('{"result":"ok"}');
    expect(result.usage?.promptTokens).toBe(50);
    expect(result.usage?.completionTokens).toBe(30);
    expect(result.usage?.totalTokens).toBe(80);
  });

  it('handles API error responses gracefully', async () => {
    global.fetch = mockFetch({ error: { message: 'Invalid API key' } }, 401, 'Unauthorized');

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model', 'bad-key');
    await expect(adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(/401/);
  });

  it('handles empty response body', async () => {
    global.fetch = mockFetch({ choices: [{ message: { content: '' } }] });

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model');
    const result = await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.content).toBe('');
  });

  it('handles missing usage data', async () => {
    global.fetch = mockFetch({
      choices: [{ message: { content: 'response' } }],
    });

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model');
    const result = await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.content).toBe('response');
    expect(result.usage?.promptTokens).toBe(0);
  });

  it('sends correct request headers and body', async () => {
    let capturedRequest: Request | null = null;
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedRequest = { url, ...opts } as any;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
        json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      });
    });

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'gpt-4', 'sk-test');
    await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.5,
      maxTokens: 500,
      responseFormat: 'json',
    });

    const body = JSON.parse((capturedRequest as any)?.body || '{}');
    expect(body.model).toBe('gpt-4');
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(500);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('retries on transient failure', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
        json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      });
    });

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model', undefined, 5000);
    const result = await adapter.call({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(result.content).toBe('ok');
    expect(callCount).toBe(3); // initial + 2 retries
  });

  it('throws after exhausting retries', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Persistent failure'));

    const adapter = new OpenAICompatibleAdapter('http://localhost:1234/v1', 'test-model');
    await expect(adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(/Persistent failure/);
  });
});

describe('OpenRouterAdapter', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  it('sends correct OpenRouter-specific headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedHeaders = opts?.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
        json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      });
    });

    const adapter = new OpenRouterAdapter('sk-or-v1-test-key', 'openai/gpt-4o');
    await adapter.call({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(capturedHeaders['Authorization']).toBe('Bearer sk-or-v1-test-key');
    expect(capturedHeaders['HTTP-Referer']).toBe('https://github.com/mberkanbicer/research-workbench');
    expect(capturedHeaders['X-Title']).toBe('AI Research Workbench');
  });

  it('parses error from OpenRouter error body', async () => {
    global.fetch = mockFetch(
      { error: { message: 'Insufficient credits' } },
      402,
      'Payment Required',
    );

    const adapter = new OpenRouterAdapter('sk-or-v1-test-key', 'openai/gpt-4o');
    await expect(adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(/Insufficient credits/);
  });

  it('uses 120s timeout', async () => {
    global.fetch = mockFetch({ choices: [{ message: { content: 'ok' } }] });

    const adapter = new OpenRouterAdapter('sk-or-v1-test-key', 'openai/gpt-4o');
    const result = await adapter.call({ messages: [{ role: 'user', content: 'Hello' }] });
    expect(result.content).toBe('ok');
  });
});

describe('OllamaAdapter', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  it('calls /api/chat endpoint', async () => {
    let calledUrl = '';
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({
          message: { content: 'Ollama response' },
          prompt_eval_count: 40,
          eval_count: 20,
        })),
        json: () => Promise.resolve({
          message: { content: 'Ollama response' },
          prompt_eval_count: 40,
          eval_count: 20,
        }),
      });
    });

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3');
    const result = await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
    });

    expect(calledUrl).toContain('/api/chat');
    expect(result.content).toBe('Ollama response');
    expect(result.usage?.promptTokens).toBe(40);
    expect(result.usage?.completionTokens).toBe(20);
  });

  it('sends JSON format flag when responseFormat is json', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedBody = JSON.parse(opts?.body as string);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ message: { content: '{}' } })),
        json: () => Promise.resolve({ message: { content: '{}' } }),
      });
    });

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3');
    await adapter.call({
      messages: [{ role: 'user', content: 'Return JSON' }],
      responseFormat: 'json',
    });

    expect(capturedBody.format).toBe('json');
  });

  it('handles Ollama timeouts gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3');
    await expect(adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toThrow(/aborted/);
  });

  it('handles empty Ollama response', async () => {
    global.fetch = mockFetch({});

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3');
    const result = await adapter.call({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    // Should fall through to generic fallback
    expect(result.content).toBe('{}');
    expect(result.usage?.totalTokens).toBe(0);
  });
});
