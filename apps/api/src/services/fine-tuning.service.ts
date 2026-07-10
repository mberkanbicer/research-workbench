import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FineTuningJob {
  id: string;
  projectId: string;
  modelId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trainingData: TrainingExample[];
  metrics: FineTuningMetrics;
  createdAt: Date;
  completedAt?: Date;
}

export interface TrainingExample {
  input: string;
  output: string;
  weight?: number;
}

export interface FineTuningMetrics {
  loss: number;
  accuracy: number;
  f1Score: number;
  perplexity: number;
}

export interface ModelPerformance {
  modelId: string;
  averageScore: number;
  successRate: number;
  averageResponseTime: number;
  totalCalls: number;
}

// ─── Fine-Tuning Service ───────────────────────────────────────────────────

// In-memory job store (FineTuningJob model not in Prisma schema)
const jobStore = new Map<string, FineTuningJob>();

export class FineTuningService {
  /**
   * Create a fine-tuning job from project data
   */
  async createFineTuningJob(
    projectId: string,
    modelId: string,
    options: {
      maxExamples?: number;
      includeRevisions?: boolean;
      minConfidence?: number;
    } = {}
  ): Promise<FineTuningJob> {
    const { maxExamples = 1000, includeRevisions = true, minConfidence = 0.7 } = options;

    // Gather training data from project
    const trainingData = await this.gatherTrainingData(projectId, {
      maxExamples,
      includeRevisions,
      minConfidence,
    });

    if (trainingData.length === 0) {
      throw new Error('No suitable training examples found in project');
    }

    // Create job record
    const job: FineTuningJob = {
      id: crypto.randomUUID(),
      projectId,
      modelId,
      status: 'pending',
      trainingData,
      metrics: { loss: 0, accuracy: 0, f1Score: 0, perplexity: 0 },
      createdAt: new Date(),
    };

    // Store job in memory
    jobStore.set(job.id, job);

    logger.info('Fine-tuning job created', { jobId: job.id, examples: trainingData.length });

    // Start training in background
    this.runTraining(job.id).catch(err => {
      logger.error('Fine-tuning job failed', { jobId: job.id, error: err.message });
    });

    return job;
  }

  /**
   * Get a fine-tuning job by ID
   */
  getJob(jobId: string): FineTuningJob | undefined {
    return jobStore.get(jobId);
  }

  /**
   * Gather training data from project evidence and decisions
   */
  private async gatherTrainingData(
    projectId: string,
    options: {
      maxExamples: number;
      includeRevisions: boolean;
      minConfidence: number;
    }
  ): Promise<TrainingExample[]> {
    const trainingData: TrainingExample[] = [];

    // Get high-confidence claims
    const claims = await prisma.claim.findMany({
      where: {
        projectId,
        confidence: { gte: options.minConfidence },
        status: { in: ['supported', 'contradicted'] },
      },
      take: options.maxExamples,
    });

    // Get evidence for these claims
    const claimIds = claims.map(c => c.id);
    const evidenceItems = await prisma.evidence.findMany({
      where: { claimId: { in: claimIds } },
    });

    // Get decisions for these idea versions
    const ideaVersionIds = [...new Set(claims.map(c => c.ideaVersionId))];
    const decisions = await prisma.decisionRecord.findMany({
      where: { ideaVersionId: { in: ideaVersionIds } },
    });

    // Get critiques for these claims
    const critiques = await prisma.critique.findMany({
      where: { projectId, targetId: { in: claimIds } },
      take: Math.floor(options.maxExamples / 2),
    });

    // Index evidence and decisions by claim/ideaVersion
    const evidenceByClaim = new Map<string, typeof evidenceItems>();
    for (const e of evidenceItems) {
      if (e.claimId) {
        const list = evidenceByClaim.get(e.claimId) || [];
        list.push(e);
        evidenceByClaim.set(e.claimId, list);
      }
    }
    const decisionsByVersion = new Map<string, typeof decisions>();
    for (const d of decisions) {
      const list = decisionsByVersion.get(d.ideaVersionId) || [];
      list.push(d);
      decisionsByVersion.set(d.ideaVersionId, list);
    }

    for (const claim of claims) {
      // Create training example from claim + evidence
      const claimEvidence = evidenceByClaim.get(claim.id) || [];
      if (claimEvidence.length > 0) {
        const evidenceText = claimEvidence
          .map((e: { title: string; excerpt: string | null; summary: string | null }) => `${e.title}: ${e.excerpt || e.summary || ''}`)
          .join('\n');

        trainingData.push({
          input: `Claim: ${claim.text}\n\nEvidence:\n${evidenceText}`,
          output: `Status: ${claim.status}\nConfidence: ${claim.confidence}\nReasoning: This claim is ${claim.status} based on the provided evidence.`,
          weight: claim.confidence || 1,
        });
      }

      // Create training example from decisions
      const versionDecisions = decisionsByVersion.get(claim.ideaVersionId) || [];
      for (const decision of versionDecisions) {
        trainingData.push({
          input: `Claim: ${claim.text}\nDecision: ${decision.decisionText}\nStatus: ${decision.decisionStatus}`,
          output: `The decision "${decision.decisionText}" ${decision.decisionStatus === 'accepted' ? 'supports' : 'rejects'} the claim.`,
          weight: 0.8,
        });
      }
    }

    // Create training examples from critiques
    for (const critique of critiques) {
      trainingData.push({
        input: `Original claim: ${critique.text}\nCritique: ${critique.whyItMatters}`,
        output: `This critique identifies issues with severity ${critique.severity}: ${critique.whyItMatters}`,
        weight: critique.severity === 'high' ? 1.2 : critique.severity === 'medium' ? 1 : 0.8,
      });
    }

    return trainingData.slice(0, options.maxExamples);
  }

  /**
   * Run the training process (simulated)
   */
  private async runTraining(jobId: string): Promise<void> {
    const job = jobStore.get(jobId);
    if (!job) return;

    job.status = 'running';

    // Simulate training process
    const epochs = 10;
    const metrics: FineTuningMetrics = {
      loss: 1.0,
      accuracy: 0.5,
      f1Score: 0.5,
      perplexity: 100,
    };

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Simulate improvement
      metrics.loss *= 0.85;
      metrics.accuracy = Math.min(0.95, metrics.accuracy + 0.05);
      metrics.f1Score = Math.min(0.93, metrics.f1Score + 0.04);
      metrics.perplexity *= 0.9;

      // Update metrics in memory
      job.metrics = { ...metrics };

      // Wait between epochs
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mark as completed
    job.status = 'completed';
    job.completedAt = new Date();
    job.metrics = { ...metrics };

    logger.info('Fine-tuning job completed', { jobId, metrics });
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(modelId: string): Promise<ModelPerformance> {
    const calls = await prisma.modelCall.findMany({
      where: { model: modelId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    if (calls.length === 0) {
      return {
        modelId,
        averageScore: 0,
        successRate: 0,
        averageResponseTime: 0,
        totalCalls: 0,
      };
    }

    const successfulCalls = calls.filter(c => c.status === 'success');
    const totalDuration = calls.reduce((sum: number, c: { createdAt: Date; completedAt: Date | null }) => {
      if (c.completedAt) {
        return sum + (c.completedAt.getTime() - c.createdAt.getTime());
      }
      return sum;
    }, 0);

    return {
      modelId,
      averageScore: successfulCalls.length / calls.length,
      successRate: successfulCalls.length / calls.length,
      averageResponseTime: totalDuration / calls.length,
      totalCalls: calls.length,
    };
  }

  /**
   * Compare model performance
   */
  async compareModels(modelIds: string[]): Promise<ModelPerformance[]> {
    const performances = await Promise.all(
      modelIds.map(id => this.getModelPerformance(id))
    );

    return performances.sort((a, b) => b.averageScore - a.averageScore);
  }
}

export const fineTuningService = new FineTuningService();
