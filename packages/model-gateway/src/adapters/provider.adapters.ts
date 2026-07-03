import { ModelProviderAdapter, ModelCallParams, ModelResponse } from '../types.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper that catches transient errors and retries with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, label = 'call'): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') throw lastError;
      if (lastError.message?.includes('429') || lastError.message?.includes('rate_limit')) {
        // Rate limited — wait longer
        const delay = Math.pow(4, i) * 1000;
        console.warn(`${label} rate limited, retry ${i + 1}/${retries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      if (i < retries) {
        const delay = Math.pow(2, i) * 1000;
        console.warn(`${label} attempt ${i + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  throw lastError || new Error(`${label} failed after ${retries + 1} attempts`);
}

/**
 * Parse a model response body into a ModelResponse, handling various JSON shapes.
 */
/** Shape of standard OpenAI-compatible chat completion response (also handles Ollama). */
interface ChatApiResponse {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  message?: { content?: string };
  /** Some APIs return content/text at root level */
  content?: string;
  text?: string;
  /** Ollama /api/chat returns these at root level, not inside usage */
  prompt_eval_count?: number;
  eval_count?: number;
  /** Ollama response key (for /api/chat) */
  response?: string;
}

function parseChatResponse(data: ChatApiResponse, modelName: string): ModelResponse {
  // OpenAI / OpenRouter / Ollama-compatible shape
  if (data.choices?.[0]) {
    return {
      content: data.choices[0].message?.content || data.choices[0].text || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      raw: data as unknown as Record<string, unknown>,
    };
  }

  // Ollama /api/chat response shape
  if (data.message?.content) {
    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      raw: data as unknown as Record<string, unknown>,
    };
  }

  // Generic fallback
  return {
    content: data.response || data.text || data.content || JSON.stringify(data),
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    raw: data as unknown as Record<string, unknown>,
  };
}

export class OpenAICompatibleAdapter implements ModelProviderAdapter {
  constructor(
    protected baseUrl: string,
    protected modelName: string,
    protected apiKey?: string,
    protected timeoutMs = 60000,
  ) {}

  async call(params: ModelCallParams): Promise<ModelResponse> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: params.messages,
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens,
          response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `OpenAI API error ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`,
        );
      }

      const data = await response.json();
      return parseChatResponse(data, this.modelName);
    }, 2, `openai:${this.modelName}`);
  }

  async *streamCall(params: ModelCallParams): AsyncIterable<ModelResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens,
        response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `OpenAI API error ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield {
                  content,
                  usage: parsed.usage ? {
                    promptTokens: parsed.usage.prompt_tokens || 0,
                    completionTokens: parsed.usage.completion_tokens || 0,
                    totalTokens: parsed.usage.total_tokens || 0,
                  } : undefined,
                  raw: parsed,
                };
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, modelName: string) {
    super('https://openrouter.ai/api/v1', modelName, apiKey, 120000);
  }

  async call(params: ModelCallParams): Promise<ModelResponse> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/mberkanbicer/research-workbench',
          'X-Title': 'AI Research Workbench',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: params.messages,
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens,
          response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`OpenRouter API error: ${(errorBody as { error?: { message?: string } })?.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return parseChatResponse(data, this.modelName);
    }, 2, `openrouter:${this.modelName}`);
  }
}

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(baseUrl: string, modelName: string) {
    // Ollama's OpenAI compatibility endpoint
    super(`${baseUrl.replace(/\/$/, '')}`, modelName, undefined, 120000);
  }

  async call(params: ModelCallParams): Promise<ModelResponse> {
    // Ollama's /api/chat endpoint has a different shape than OpenAI
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages: params.messages,
          options: {
            temperature: params.temperature ?? 0.2,
            num_predict: params.maxTokens,
          },
          stream: false,
          format: params.responseFormat === 'json' ? 'json' : undefined,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Ollama API error ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`);
      }

      const data = await response.json();
      return parseChatResponse(data, this.modelName);
    }, 2, `ollama:${this.modelName}`);
  }

  async *streamCall(params: ModelCallParams): AsyncIterable<ModelResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: params.messages,
        options: {
          temperature: params.temperature ?? 0.2,
          num_predict: params.maxTokens,
        },
        stream: true,
        format: params.responseFormat === 'json' ? 'json' : undefined,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Ollama API error ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                yield {
                  content: parsed.message.content,
                  usage: parsed.prompt_eval_count != null ? {
                    promptTokens: parsed.prompt_eval_count || 0,
                    completionTokens: parsed.eval_count || 0,
                    totalTokens: (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0),
                  } : undefined,
                  raw: parsed,
                };
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
