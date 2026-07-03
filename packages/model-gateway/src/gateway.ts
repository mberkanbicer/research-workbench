import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ModelProviderAdapter, ModelCallParams, ModelResponse } from './types.js';

// Prisma instance for recording model calls.
// Set via ModelGateway.setPrisma() — avoids fragile dynamic imports.
let _prisma: any = null;
export function setGatewayPrisma(prisma: any): void {
  _prisma = prisma;
}

function getPrisma() {
  return _prisma;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class ModelGateway {
  constructor(
    private adapter: ModelProviderAdapter,
    private providerLabel: string = 'unknown',
    private modelLabel: string = 'unknown',
  ) {}

  async call(params: ModelCallParams, retries = 2): Promise<ModelResponse> {
    let lastError: Error | null = null;
    let response: ModelResponse | null = null;

    for (let i = 0; i <= retries; i++) {
      try {
        response = await this.adapter.call(params);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < retries) {
          const delay = Math.pow(2, i) * 1000;
          console.warn(`Model call attempt ${i + 1} failed: ${lastError?.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    if (response) {
      await this.recordCall(params, response, 'success', lastError?.message);
      return response;
    }
    await this.recordCall(params, null, 'failed', lastError?.message);
    throw lastError || new Error('Model call failed after all retries');
  }

  private async recordCall(params: ModelCallParams, response: ModelResponse | null, status: string, error?: string): Promise<void> {
    const meta = params.metadata;
    if (!meta?.projectId || !meta?.modelConfigId) return;

    try {
      const db = getPrisma();
      if (!db) return;

      await db.modelCall.create({
        data: {
          projectId: meta.projectId,
          modelConfigId: meta.modelConfigId,
          provider: this.providerLabel,
          model: this.modelLabel || meta.modelConfigId,
          messages: params.messages as any,
          responseText: response?.content || null,
          responseJson: null,
          usage: response?.usage || undefined,
          status,
          error: error || null,
        },
      });
    } catch (err) {
      console.warn('Failed to record model call (non-fatal):', (err as Error).message);
    }
  }

  async *streamCall(params: ModelCallParams): AsyncIterable<ModelResponse> {
    if (this.adapter.streamCall) {
      yield* this.adapter.streamCall(params);
    } else {
      // Fallback to non-streaming call
      const response = await this.call(params);
      yield response;
    }
  }

  async callJson<T>(params: ModelCallParams, schema: z.ZodSchema<T>, retries = 3): Promise<T> {
    let lastError: Error | null = null;

    const jsonSchema = zodToJsonSchema(schema);
    const schemaInstruction = `\n\nYou MUST respond with valid JSON matching this exact JSON Schema:\n${JSON.stringify(jsonSchema, null, 2)}\nDo not include markdown blocks or any other text, just the raw JSON object.`;

    const modifiedMessages = [...params.messages];
    const lastUserMessageIdx = modifiedMessages.map(m => m.role).lastIndexOf('user');

    if (lastUserMessageIdx !== -1) {
      modifiedMessages[lastUserMessageIdx] = {
        ...modifiedMessages[lastUserMessageIdx],
        content: modifiedMessages[lastUserMessageIdx].content + schemaInstruction
      };
    } else {
      modifiedMessages.push({ role: 'user', content: schemaInstruction });
    }

    for (let i = 0; i <= retries; i++) {
      try {
        // Pass retries=0 to call() because we are handling the retry loop here for parsing/validation errors
        const response = await this.call({ ...params, messages: modifiedMessages, responseFormat: 'json' }, 0);
        const cleaned = response.content
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '');
        const parsed = JSON.parse(cleaned);
        return schema.parse(parsed);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < retries) {
          // Build a feedback message with the parse error so the model can self-correct
          const parseErrorMsg = formatParseError(err);
          if (parseErrorMsg) {
            modifiedMessages.push({
              role: 'user',
              content: `Your previous response had a format error. Please fix it and try again.\n\nError: ${parseErrorMsg}\n\nRespond ONLY with valid JSON matching the schema above.`
            });
            // Add explicit structural guidance for common mistakes
            const guidance = buildStructuralGuidance(err);
            if (guidance) {
              modifiedMessages.push({
                role: 'user',
                content: guidance
              });
            }
          }
          const delay = Math.pow(2, i) * 1000;
          console.warn(`JSON call attempt ${i + 1} failed: ${lastError?.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw new Error(`Failed to get valid JSON after ${retries + 1} attempts: ${lastError?.message}`);
  }
}

function formatParseError(err: unknown): string {
  if (err instanceof z.ZodError) {
    // Return a concise summary: top 3 issues with field path and message
    return err.issues
      .slice(0, 3)
      .map(i => `- ${i.path.join('.') || '(root)'}: ${i.message}${'received' in i ? ` (got ${JSON.stringify((i as {received: unknown}).received)})` : ''}`)
      .join('\n');
  }
  if (err instanceof SyntaxError) {
    return `Invalid JSON: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Generate structural guidance based on common schema errors.
 * This helps the model understand what structure is expected.
 */
function buildStructuralGuidance(err: unknown): string | null {
  if (!(err instanceof z.ZodError)) return null;

  const issues = err.issues;
  const hasArrayIssue = issues.some(i =>
    i.message.includes('Expected array') || i.path.some(p => p === 'claims' || p === 'hypotheses' || p === 'openQuestions')
  );

  if (hasArrayIssue) {
    return `\n\nSTRUCTURAL GUIDANCE:\n- The "claims" field MUST be an array of objects, e.g., [{"text": "claim text", "type": "technical", ...}]\n- The "hypotheses" field MUST be an array of objects\n- The "openQuestions" field MUST be an array of strings\n- Do NOT return a single object for "claims" - always use square brackets []`;
  }

  return null;
}
