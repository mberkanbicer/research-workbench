/**
 * PromptRegistry — manages prompt versions with quality tracking.
 *
 * Stores prompt templates by role, versions them when improvements are made,
 * and tracks pass/fail rates per version to identify which prompts work.
 */

import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

export interface PromptVersion {
  /** Monotonically increasing version number */
  version: number;
  /** The prompt text */
  text: string;
  /** When this version was created */
  createdAt: Date;
  /** Reason for creating this version (e.g., "v1 had empty output for claims") */
  reason: string;
  /** Quality metrics for this version */
  metrics: PromptMetrics;
}

export interface PromptMetrics {
  /** Number of times this prompt was used */
  totalCalls: number;
  /** Number of times output was usable */
  successfulCalls: number;
  /** Number of schema validation failures */
  schemaFailures: number;
  /** Number of empty/null outputs */
  emptyOutputs: number;
  /** Running average quality score (0–1) */
  avgQualityScore: number;
  /** Specific failure patterns observed */
  failurePatterns: Map<string, number>;
}

export interface PromptImprovementRequest {
  role: string;
  currentVersion: number;
  currentText: string;
  observedFailures: {
    type: string;
    count: number;
    examples: string[];
  }[];
  suggestedFix?: string;
}

export class PromptRegistry {
  private persistEnabled: boolean;

  constructor(enableDbPersistence = false) {
    this.persistEnabled = enableDbPersistence;
  }
  /**
   * Map of role -> version history (most recent version is the active one)
   */
  private versions: Map<string, PromptVersion[]> = new Map();

  /**
   * Load existing prompt versions from the database.
   * Should be called once on startup to restore state.
   */
  async loadFromDb(): Promise<void> {
    if (!this.persistEnabled) return;
    try {
      const { prisma } = await import('../prisma.js');
      const dbVersions = await (prisma as any).promptVersion.findMany({
        orderBy: [{ role: 'asc' }, { version: 'asc' }],
      });
      for (const dbv of dbVersions) {
        const existing = this.versions.get(dbv.role) || [];
        existing.push({
          version: dbv.version,
          text: dbv.text,
          createdAt: dbv.createdAt,
          reason: dbv.reason,
          metrics: {
            totalCalls: 0,
            successfulCalls: 0,
            schemaFailures: 0,
            emptyOutputs: 0,
            avgQualityScore: 0,
            failurePatterns: new Map(),
          },
        });
        this.versions.set(dbv.role, existing);
      }
      logger.info('Loaded prompt versions from DB', { roles: this.versions.size });
    } catch (err) {
      logger.warn('Failed to load prompt versions from DB', { error: (err as Error).message });
    }
  }

  /**
   * Register a new prompt role with initial version.
   */
  async register(role: string, initialText: string): Promise<void> {
    if (this.versions.has(role)) return;

    this.versions.set(role, [{
      version: 1,
      text: initialText,
      createdAt: new Date(),
      reason: 'Initial version',
      metrics: {
        totalCalls: 0,
        successfulCalls: 0,
        schemaFailures: 0,
        emptyOutputs: 0,
        avgQualityScore: 0,
        failurePatterns: new Map(),
      },
    }]);

    if (this.persistEnabled) {
      try {
        await prisma.promptVersion.create({
          data: { role, version: 1, text: initialText, reason: 'Initial version' },
        });
      } catch (err) {
        logger.warn('Failed to persist prompt version', { role, error: (err as Error).message });
      }
    }
  }

  /**
   * Get the active (latest) prompt text for a role.
   */
  get(role: string): string | undefined {
    const history = this.versions.get(role);
    if (!history || history.length === 0) return undefined;
    return history[history.length - 1].text;
  }

  /**
   * Get the active version number for a role.
   */
  getVersion(role: string): number {
    const history = this.versions.get(role);
    if (!history || history.length === 0) return 0;
    return history[history.length - 1].version;
  }

  /**
   * Record a quality report for a prompt role call.
   * Updates metrics for the active version.
   */
  async recordCall(role: string, qualityScore: number, isUsable: boolean, issues: string[]): Promise<void> {
    const history = this.versions.get(role);
    if (!history || history.length === 0) return;

    const active = history[history.length - 1];
    active.metrics.totalCalls++;
    active.metrics.avgQualityScore =
      (active.metrics.avgQualityScore * (active.metrics.totalCalls - 1) + qualityScore) / active.metrics.totalCalls;

    if (!isUsable) {
      active.metrics.schemaFailures++;
      if (qualityScore === 0) active.metrics.emptyOutputs++;
    } else {
      active.metrics.successfulCalls++;
    }

    for (const issue of issues) {
      const count = active.metrics.failurePatterns.get(issue) || 0;
      active.metrics.failurePatterns.set(issue, count + 1);
    }

    if (this.persistEnabled) {
      try {
        await prisma.promptCall.create({
          data: {
            role,
            version: active.version,
            qualityScore,
            isUsable,
            issues,
          },
        });
      } catch (err) {
        logger.warn('Failed to persist prompt call metrics', { role, error: (err as Error).message });
      }
    }
  }

  /**
   * Create a new improved version of a prompt.
   * The new version becomes the active one.
   */
  async improve(role: string, newText: string, reason: string): Promise<PromptVersion> {
    const history = this.versions.get(role);
    if (!history) throw new Error(`No prompt history for role "${role}"`);

    const prevVersion = history[history.length - 1].version;
    const newVersion: PromptVersion = {
      version: prevVersion + 1,
      text: newText,
      createdAt: new Date(),
      reason,
      metrics: {
        totalCalls: 0,
        successfulCalls: 0,
        schemaFailures: 0,
        emptyOutputs: 0,
        avgQualityScore: 0,
        failurePatterns: new Map(),
      },
    };

    history.push(newVersion);

    if (this.persistEnabled) {
      try {
        await prisma.promptVersion.create({
          data: { role, version: newVersion.version, text: newText, reason },
        });
      } catch (err) {
        logger.warn('Failed to persist prompt improvement', { role, error: (err as Error).message });
      }
    }

    logger.info('Prompt improved', { role, fromVersion: prevVersion, toVersion: newVersion.version, reason });
    return newVersion;
  }

  /**
   * Analyze whether a prompt needs improvement based on its metrics.
   * Returns null if the prompt is healthy, or a request describing what to fix.
   */
  analyzeForImprovement(role: string, threshold = 0.7): PromptImprovementRequest | null {
    const history = this.versions.get(role);
    if (!history || history.length === 0) return null;

    const active = history[history.length - 1];
    if (active.metrics.totalCalls < 3) return null; // Not enough data

    const failureRate = active.metrics.schemaFailures / active.metrics.totalCalls;
    if (failureRate < (1 - threshold)) return null; // Healthy enough

    // Collect observed failure patterns
    const observedFailures: { type: string; count: number; examples: string[] }[] = [];
    for (const [pattern, count] of active.metrics.failurePatterns.entries()) {
      if (count > 0) {
        observedFailures.push({ type: pattern, count, examples: [] });
      }
    }

    return {
      role,
      currentVersion: active.version,
      currentText: active.text,
      observedFailures,
      suggestedFix: this.suggestFix(role, observedFailures),
    };
  }

  /**
   * Get the entire history for a role.
   */
  getHistory(role: string): PromptVersion[] {
    return this.versions.get(role) || [];
  }

  /**
   * Get all current prompts (latest version for each role).
   */
  getAllPrompts(): Record<string, { text: string; version: number }> {
    const prompts: Record<string, { text: string; version: number }> = {};
    for (const [role, history] of this.versions.entries()) {
      const active = history[history.length - 1];
      if (active) {
        prompts[role] = { text: active.text, version: active.version };
      }
    }
    return prompts;
  }

  /**
   * Get a summary of all registered roles and their current version metrics.
   */
  getSummary(): { role: string; version: number; totalCalls: number; successRate: number; avgQuality: number }[] {
    const summary: { role: string; version: number; totalCalls: number; successRate: number; avgQuality: number }[] = [];
    for (const [role, history] of this.versions.entries()) {
      const active = history[history.length - 1];
      summary.push({
        role,
        version: active.version,
        totalCalls: active.metrics.totalCalls,
        successRate: active.metrics.totalCalls > 0
          ? active.metrics.successfulCalls / active.metrics.totalCalls
          : 0,
        avgQuality: active.metrics.avgQualityScore,
      });
    }
    return summary;
  }

  private suggestFix(role: string, failures: { type: string; count: number }[]): string | undefined {
    const topFailure = failures.sort((a, b) => b.count - a.count)[0];
    if (!topFailure) return undefined;

    switch (topFailure.type) {
      case 'empty_output':
        return `Add explicit instructions to never return empty/null and always provide at least one item.`;
      case 'schema_validation_failed':
        return `Simplify the output schema — reduce the number of required nested fields.`;
      case 'parse_error':
        return `Reinforce the "return valid JSON only" instruction. Add an example output.`;
      case 'invalid_enum':
        return `List the allowed enum values more prominently in the prompt. Reduce the number of enum options.`;
      default:
        return `Rewrite the prompt to be more specific and add validation constraints.`;
    }
  }
}
