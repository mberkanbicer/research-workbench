/**
 * MetaPromptService — uses a model gateway to generate improved prompt text
 * from a failure report.
 *
 * This is the core self-improvement mechanism: given a prompt that produces
 * poor output, the service asks a model to generate a better version.
 */

import type { ModelGateway } from '@repo/model-gateway';
import { MetaPromptOutputSchema } from './prompts.schemas.js';
import { logger } from '../utils/logger.js';

export interface FailureReport {
  role: string;
  currentPrompt: string;
  currentVersion: number;
  failures: {
    type: string;
    count: number;
    examples: string[];
  }[];
  lastError?: string;
}

export interface MetaPromptResult {
  success: boolean;
  improvedPrompt?: string;
  error?: string;
}

const META_SYSTEM_PROMPT = `You are a meta-prompt engineer. Your job is to improve prompts that produce poor output.

Given a prompt and a detailed failure report, produce an improved version of the prompt that addresses the specific issues.

Rules:
- Keep the original prompt's intent and structure.
- Fix the specific issues reported in the failure report.
- Do NOT change the output format requirements.
- Add explicit instructions to avoid the observed failure patterns.
- Make the improved prompt MORE specific, not more generic.
- If the original prompt was vague, add concrete examples.
- If the original prompt produced empty output, add "You MUST return valid content — never return empty/null."
- If the original prompt had schema validation errors, simplify the requested output structure and add explicit type instructions.
- Return the FULL improved prompt text, not a diff or summary.`;

export class MetaPromptService {
  constructor(
    private gateway: ModelGateway,
  ) {}

  /**
   * Attempt to improve a prompt using a model gateway.
   * Falls back gracefully if the model call fails.
   */
  async improve(report: FailureReport): Promise<MetaPromptResult> {
    const userMessage = this.buildImprovementRequest(report);

    try {
      const result = await this.gateway.callJson<{ improvedPrompt: string; changeRationale?: string }>(
        {
          messages: [
            { role: 'system', content: META_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
        },
        MetaPromptOutputSchema,
      );

      if (!result.improvedPrompt || result.improvedPrompt.trim().length === 0) {
        return { success: false, error: 'Model returned empty improved prompt' };
      }

      logger.info('Meta-prompt improvement succeeded', {
        role: report.role,
        originalPromptLen: report.currentPrompt.length,
        improvedPromptLen: result.improvedPrompt.length,
        fromVersion: report.currentVersion,
      });

      return {
        success: true,
        improvedPrompt: result.improvedPrompt,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Meta-prompt improvement failed', {
        role: report.role,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private buildImprovementRequest(report: FailureReport): string {
    const parts: string[] = [
      `# Prompt Improvement Request`,
      ``,
      `The prompt for role "${report.role}" (v${report.currentVersion}) has been producing poor results.`,
      ``,
      `## Current Prompt`,
      `\`\`\``,
      report.currentPrompt,
      `\`\`\``,
      ``,
      `## Observed Failures`,
    ];

    for (const f of report.failures) {
      parts.push(`- ${f.type}: ${f.count} occurrence(s)`);
      if (f.examples.length > 0) {
        parts.push(`  Example: "${f.examples[0].slice(0, 200)}"`);
      }
    }

    if (report.lastError) {
      parts.push(``, `## Last Error`, report.lastError);
    }

    parts.push(``, `## Guidelines`);
    parts.push(`- Keep the same role and responsibility.`);
    parts.push(`- Do NOT remove or weaken existing safety constraints.`);
    parts.push(`- Add specific instructions that prevent the observed failures.`);
    parts.push(`- Use concrete examples where helpful.`);
    parts.push(`- Return ONLY the improved prompt text. No explanations outside the prompt.`);
    parts.push(``, `## Output Format`);
    parts.push(`Return a JSON object with two fields:`);
    parts.push(`- "improvedPrompt": the full improved prompt text as a single string`);
    parts.push(`- "changeRationale": brief explanation of what changed and why`);

    return parts.join('\n');
  }
}
