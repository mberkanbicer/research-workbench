/**
 * ActionPlanner — given the current state and failure analysis,
 * plans corrective actions for the next iteration.
 *
 * Each action is a concrete instruction to change something in the loop:
 * - improve a specific prompt
 * - switch model selection
 * - add context
 * - re-run a specific stage with different parameters
 * - skip a stage that's working fine
 */

import { logger } from '../utils/logger.js';

export type CorrectiveActionType =
  | 'improve_prompt'
  | 'switch_model'
  | 'add_context'
  | 'rerun_stage'
  | 'skip_stage'
  | 'adjust_temperature'
  | 'request_more_evidence'
  | 'escalate_to_user'
  | 'adjust_calibration';

export interface CorrectiveAction {
  type: CorrectiveActionType;
  target: string;        // e.g., "claim_extraction", "evidence_assessment", model ID
  reason: string;        // Why this action is needed
  priority: 'critical' | 'high' | 'medium' | 'low';
  params?: Record<string, any>;
}

export interface IterationReport {
  iteration: number;
  stagesCompleted: string[];
  stagesFailed: string[];
  stagesSkipped: string[];
  qualityScores: Record<string, number>;
  failurePatterns: Record<string, string[]>;
  consensusVote?: string;
  goalAchievementLevel?: string;
  goalAchieved: boolean;
  hasDecision: boolean;
  calibrationError?: number;
}

export class ActionPlanner {
  /**
   * Given an iteration report, decide what corrective actions to take
   * before the next iteration.
   */
  planActions(
    report: IterationReport,
    availableModels: string[],
    loopMode: 'standard' | 'self_improving' | 'adversarial' = 'self_improving',
  ): CorrectiveAction[] {
    const actions: CorrectiveAction[] = [];

    // 1. Goal achieved — no actions needed
    if (report.goalAchieved) {
      return actions;
    }

    if (loopMode === 'standard') {
      for (const stage of report.stagesFailed) {
        actions.push({
          type: 'rerun_stage',
          target: stage,
          reason: `Stage "${stage}" failed in iteration ${report.iteration}`,
          priority: 'high',
        });
      }
      return actions;
    }

    // 2. Failed stages need re-running with improved prompts
    for (const stage of report.stagesFailed) {
      actions.push({
        type: 'improve_prompt',
        target: stage,
        reason: `Stage "${stage}" failed in iteration ${report.iteration}`,
        priority: 'critical',
        params: { retryCount: 1 },
      });
      actions.push({
        type: 'rerun_stage',
        target: stage,
        reason: `Re-run after prompt improvement`,
        priority: 'high',
      });
    }

    // 3. Low quality scores need prompt improvement
    for (const [stage, score] of Object.entries(report.qualityScores)) {
      if (score < 0.5 && !report.stagesFailed.includes(stage)) {
        actions.push({
          type: 'improve_prompt',
          target: stage,
          reason: `Quality score ${score.toFixed(2)} below 0.5 threshold for "${stage}"`,
          priority: 'high',
        });
      }
    }

    // 4. No consensus after multiple iterations
    if (report.consensusVote === 'reject' || report.consensusVote === 'needs_more_evidence') {
      if (report.iteration >= 2) {
        actions.push({
          type: 'switch_model',
          target: availableModels[report.iteration % availableModels.length] || availableModels[0],
          reason: `Consensus "${report.consensusVote}" after ${report.iteration} iterations — try different model lead`,
          priority: 'high',
        });
      }
    }

    // 5. No decision yet — keep iterating
    if (!report.hasDecision && report.iteration < 5) {
      // Ensure we re-run critical stages
      if (!report.stagesFailed.includes('review') && !report.stagesSkipped.includes('review')) {
        actions.push({
          type: 'rerun_stage',
          target: 'review',
          reason: `No decision after ${report.iteration} iterations — fresh review needed`,
          priority: 'medium',
        });
      }
    }

    // 6. Repeated failure on same stage across iterations
    // (detected via failure patterns — if called externally)

    // 7. Calibration check — if confidence is miscalibrated, adjust
    if (report.calibrationError && report.calibrationError > 0.2) {
      actions.push({
        type: 'adjust_calibration',
        target: 'consensus_voter',
        reason: `Calibration error ${(report.calibrationError * 100).toFixed(0)}% exceeds threshold — confidence scores don't predict outcomes`,
        priority: 'medium',
        params: { calibrationError: report.calibrationError },
      });
    }

    return actions;
  }

  /**
   * Generate an improved prompt instruction based on what went wrong.
   * This is the core self-improvement mechanism: given a prompt and its failures,
   * produce a revised version.
   */
  generateImprovementInstruction(
    role: string,
    currentPrompt: string,
    failures: { type: string; count: number; examples: string[] }[],
  ): string {
    const parts: string[] = [
      `# Prompt Improvement Request`,
      ``,
      `The following prompt for role "${role}" has been producing poor results.`,
      `Please generate an improved version that addresses the issues below.`,
      ``,
      `## Current Prompt`,
      `\`\`\``,
      currentPrompt,
      `\`\`\``,
      ``,
      `## Observed Failures`,
    ];

    for (const f of failures) {
      parts.push(`- ${f.type} (${f.count} occurrences)`);
      if (f.examples.length > 0) {
        parts.push(`  Example: ${f.examples[0]}`);
      }
    }

    const commonFixes: Record<string, string> = {
      empty_output: '- Add: "You MUST return at least one item. Never return empty/null."',
      schema_validation_failed: '- Simplify the output requirements. Reduce nested structures.',
      parse_error: '- Add: "Respond with ONLY valid JSON. Do NOT include markdown, explanations, or any other text."',
      invalid_enum: '- List the valid enum values at the top of the response spec.',
      placeholder_values: '- Add: "Do NOT use placeholder IDs. Use only IDs provided in the context."',
      uuid_zero_values: '- Add: "You MUST use real UUIDs from the context, never zero-filled placeholders."',
      too_few_items: '- Add: "Provide at least 3 items in each required array unless fewer are available."',
      low_confidence: '- Add: "Set confidence proportionally to the strength of available evidence."',
    };

    parts.push(``, `## Suggested Fixes`);
    for (const f of failures) {
      const fix = commonFixes[f.type];
      if (fix) parts.push(fix);
    }

    parts.push(``, `## Output Schema`);
    parts.push(`Keep the existing Zod output schema unchanged. Only modify the natural-language instructions.`);
    parts.push(``, `## Instructions`);
    parts.push(`Generate the improved prompt as a single string. Keep the overall structure but fix the specific issues. Do NOT change the intent — just make it more likely to produce valid output.`);

    return parts.join('\n');
  }

  /**
   * Determine whether the system should stop iterating.
   */
  shouldStop(report: IterationReport, maxIterations: number): { stop: boolean; reason: string } {
    // Goal achieved — stop
    if (report.goalAchieved && report.hasDecision) {
      return { stop: true, reason: 'Goal achieved and decision created' };
    }

    // Max iterations — stop
    if (report.iteration >= maxIterations) {
      return { stop: true, reason: `Reached max iterations (${maxIterations})` };
    }

    // Consecutive failures with no improvement
    if (report.stagesFailed.length >= 3 && report.iteration >= 2) {
      return { stop: true, reason: 'Multiple consecutive stage failures with no recovery' };
    }

    return { stop: false, reason: 'Continuing iteration' };
  }
}
