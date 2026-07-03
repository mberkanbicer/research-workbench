export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelCallParams {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
  /** Optional metadata for persisting model call records */
  metadata?: {
    projectId: string;
    modelConfigId: string;
    taskLabel?: string;
  };
}

export interface ModelResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: Record<string, unknown>;
}

export interface ModelProviderAdapter {
  call(params: ModelCallParams): Promise<ModelResponse>;
  /** Optional streaming method. Yields partial responses as they arrive. */
  streamCall?(params: ModelCallParams): AsyncIterable<ModelResponse>;
}
