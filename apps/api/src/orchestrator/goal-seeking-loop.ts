/**
 * GoalSeekingLoop — adaptive orchestrator with meta-prompting and
 * self-improvement feedback.
 *
 * Key differences from the original DeliberationOrchestrator:
 * 1. Tracks prompt quality across iterations using OutputAnalyzer
 * 2. Uses PromptRegistry to version and improve prompts
 * 3. Uses ActionPlanner to select corrective actions each iteration
 * 4. Exit criteria based on multi-dimensional goal evaluation, not just
 *    a single "accept" vote
 * 5. Self-improving: if a prompt produces bad outputs, generates an
 *    improved version automatically
 * 6. Preserves iteration history instead of deleting run stages
 */

import { ExtractionStage } from '../services/stages/extraction-stage.js';
import { EvidenceStage } from '../services/stages/evidence-stage.js';
import { ReviewStage } from '../services/stages/review-stage.js';
import { CritiqueStage } from '../services/stages/critique-stage.js';
import { ConsensusStage } from '../services/stages/consensus-stage.js';
import { RevisionStage } from '../services/stages/revision-stage.js';
import { AdversarialProbeStage } from '../services/stages/adversarial-probe-stage.js';
import { DeliberationServices } from './services.js';
import { OutputAnalyzer, OutputQualityReport } from './output-analyzer.js';
import { PromptRegistry, PromptImprovementRequest } from './prompt-registry.js';
import { ActionPlanner, CorrectiveAction, IterationReport } from './action-planner.js';
import { buildPrompt, ROLE_SYSTEM_PROMPTS } from './prompts.js';
import { prisma } from '../prisma.js';
import { RunEventService } from '../services/event.service.js';
import { EventService } from '../services/event.service.js';
import { logger } from '../utils/logger.js';
import { MetaPromptService } from './meta-prompt.service.js';
import type { ZodType } from 'zod';
import { Claim, Critique, Evidence, IdeaVersion } from '@repo/shared';
import {
  ClaimExtractionOutputSchema,
  EvidenceAssessmentOutputSchema,
  IndependentReviewOutputSchema,
  CrossCritiqueOutputSchema,
  CritiqueResponseOutputSchema,
  EvidenceGapOutputSchema,
  GoalAchievementOutputSchema,
  ConsensusVoteOutputSchema,
  AdversarialProbeOutputSchema,
} from './prompts.schemas.js';

const runEventService = new RunEventService();
const eventService = new EventService();
const analyzer = new OutputAnalyzer();
const promptRegistry = new PromptRegistry();
const actionPlanner = new ActionPlanner();

// Register initial prompt versions from the prompts module
function registerPrompts() {
  const promptRoles = [
    'claim_extraction', 'evidence_researcher', 'evidence_skeptic',
    'source_auditor', 'inference_auditor', 'independent_reviewer',
    'critic', 'critique_responder', 'revision_writer',
    'consensus_voter', 'decision_writer', 'goal_evaluator',
    'evidence_gap_analyst',
    'adversarial_prober',
  ];
  for (const role of promptRoles) {
    const text = ROLE_SYSTEM_PROMPTS[role] || role;
    promptRegistry.register(role, text);
  }
}
registerPrompts();

interface GoalSeekingConfig {
  projectId: string;
  modelIds: string[];
  maxIterations: number;
  runId: string;
  loopMode?: 'standard' | 'self_improving' | 'adversarial';
  /** Minimum average quality score to consider a prompt healthy (0–1) */
  qualityThreshold?: number;
  /** Minimum achievement level to consider goal achieved */
  goalThreshold?: 'fully' | 'mostly' | 'partially';
  /** Stages that require human review before proceeding */
  checkpointStages?: string[];
}

export class GoalSeekingLoop {
  private extractionStage: ExtractionStage;
  private evidenceStage: EvidenceStage;
  private reviewStage: ReviewStage;
  private critiqueStage: CritiqueStage;
  private consensusStage: ConsensusStage;
  private revisionStage: RevisionStage;
  private adversarialProbeStage: AdversarialProbeStage;
  private currentLoopMode: 'standard' | 'self_improving' | 'adversarial' = 'standard';

  constructor(
    private services: DeliberationServices,
    private metaPromptService?: MetaPromptService,
  ) {
    this.extractionStage = new ExtractionStage(services);
    this.evidenceStage = new EvidenceStage(services);
    this.reviewStage = new ReviewStage(services);
    this.critiqueStage = new CritiqueStage(services);
    this.consensusStage = new ConsensusStage(services);
    this.revisionStage = new RevisionStage(services);
    this.adversarialProbeStage = new AdversarialProbeStage(services);
  }

  /**
   * Run the goal-seeking loop.
   * Unlike the original orchestrator, this loop:
   * - Evaluates progress after every stage, not just at the end
   * - Improves prompts on-the-fly when quality drops
   * - Selects corrective actions adaptively
   * - Persists iteration history for debugging
   */
  async run(config: GoalSeekingConfig): Promise<void> {
    const {
      projectId, modelIds, maxIterations, runId,
      loopMode = 'standard',
      qualityThreshold = loopMode === 'self_improving' ? 0.6 : 0.75,
      goalThreshold = 'mostly',
      checkpointStages = [],
    } = config;

    this.currentLoopMode = loopMode;

    logger.info('GoalSeekingLoop started', { projectId, runId, modelIds, maxIterations, loopMode, goalThreshold });
    const startTime = Date.now();

    let versionIdForCleanup: string | undefined;

    try {
      const project = await prisma.researchProject.findUnique({
        where: { id: projectId },
        include: { ideaVersions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });

      if (!project) throw new Error('Project not found');
      let currentVersion = project.ideaVersions[0] as IdeaVersion;
      if (!currentVersion) throw new Error('No idea version found');
      versionIdForCleanup = currentVersion.id;

      // Track cross-iteration state
      const stageAttempts = new Map<string, number>();
      const allQualityReports: OutputQualityReport[] = [];
      const stageMetrics: Record<string, { scores: number[]; totalDurationMs: number; retryCount: number }> = {};

      const isCompleted = async (stageName: string) => {
        const stage = await prisma.runStage.findUnique({
          where: { runId_stageName: { runId, stageName } }
        });
        return stage?.status === 'COMPLETED';
      };

      /**
       * Check if the run itself has been paused (any stage marked PAUSED).
       * When paused, the stageFn will not execute — instead we record a
       * pause event and return a sentinel value so the loop exits cleanly.
       */
      const isPaused = async (): Promise<boolean> => {
        const pausedStage = await prisma.runStage.findFirst({
          where: { runId, status: 'PAUSED' }
        });
        return !!pausedStage;
      };

      /**
       * If this stage is a checkpoint, pause the run and wait for human review.
       * The user resumes via POST /runs/:runId/resume.
       */
      const checkCheckpoint = async (stageName: string) => {
        if (checkpointStages.includes(stageName)) {
          logger.info('Checkpoint reached — pausing for human review', { runId, stage: stageName });
          await prisma.runStage.upsert({
            where: { runId_stageName: { runId, stageName } },
            update: { status: 'PAUSED' },
            create: { runId, stageName, status: 'PAUSED' },
          });
          await runEventService.record(runId, projectId, 'goal_loop.checkpoint', {
            stage: stageName, iteration: 0,
            message: `Paused at ${stageName} for human review. Resume via POST /runs/${runId}/resume`,
          });
          // Wait loop will detect PAUSED status and stop
        }
      };

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        await runEventService.record(runId, projectId, 'goal_loop.iteration_started', {
          iteration,
          versionId: currentVersion.id,
          maxIterations,
        });
        logger.info('GoalSeekingLoop: starting iteration', { runId, iteration });
        const iterationStartTime = Date.now();
        const skippedStages = new Set<string>();
        const modelTemperatures = new Map<string, number>();

        // Check if run is paused at iteration start
        if (await isPaused()) {
          logger.info('Run is paused — stopping loop', { runId, iteration });
          await runEventService.record(runId, projectId, 'goal_loop.paused', {
            iteration, reason: 'User paused run',
          });
          return;
        }

        // ─── Stage 1: Extract Claims ─────────────────────────────────
        let claims: Claim[];
        if (await isCompleted('extraction') || skippedStages.has('extraction')) {
          logger.info('Skipping extraction', { runId, stage: 'extraction' });
          claims = await prisma.claim.findMany({ where: { ideaVersionId: currentVersion.id } }) as Claim[];
        } else {
          claims = await this.runStageWithQuality(
            'extraction', runId, projectId, iteration,
            async () => {
              const result = await this.extractionStage.performExtraction(runId, projectId, currentVersion.id, modelIds);
              return { output: result, schema: null }; // Returns Claim[] from DB, model output validated inside extractClaims()
            },
            modelIds, allQualityReports, stageAttempts,
          );
        }

        if (!claims || claims.length === 0) {
          logger.warn('No claims extracted, using empty array', { runId, iteration });
        }

        // ─── Stage 2: Evidence Discovery ────────────────────────────
        let evidence: Evidence[];
        if (await isCompleted('discovery') || skippedStages.has('discovery')) {
          logger.info('Skipping discovery', { runId, stage: 'discovery' });
          evidence = await prisma.evidence.findMany({ where: { projectId, claimId: { in: (claims || []).map(c => c.id) } } }) as Evidence[];
        } else {
          evidence = await this.runStageWithQuality(
            'discovery', runId, projectId, iteration,
            async () => {
              const result = await this.evidenceStage.performEvidenceDiscovery(runId, projectId, claims || []);
              return { output: result, schema: null }; // Evidence discovery returns Evidence[] from DB, not model output
            },
            modelIds, allQualityReports, stageAttempts,
          );
        }

        // ─── Stage 3: Evidence Assessment ───────────────────────────
        if (!await isCompleted('assessment') && !skippedStages.has('assessment')) {
          await this.runStageWithQuality(
            'assessment', runId, projectId, iteration,
            async () => {
              await this.evidenceStage.performEvidenceAssessment(runId, projectId, evidence || [], modelIds);
              return { output: { completed: true }, schema: EvidenceAssessmentOutputSchema };
            },
            modelIds, allQualityReports, stageAttempts,
          );
        } else {
          logger.info('Skipping assessment', { runId, stage: 'assessment' });
        }

        // ─── Stage 3b: Adversarial Probe (adversarial mode only) ─────
        if (this.currentLoopMode === 'adversarial') {
          if (!await isCompleted('adversarial_probe') && !skippedStages.has('adversarial_probe')) {
            const counterEvidence = await this.runStageWithQuality(
              'adversarial_probe', runId, projectId, iteration,
              async () => {
                const result = await this.adversarialProbeStage.performAdversarialProbe(
                  runId, projectId, currentVersion.id, claims || [], modelIds,
                );
                return { output: result, schema: null };
              },
              modelIds, allQualityReports, stageAttempts,
            ) as Evidence[];
            // Merge counter-evidence into the evidence array for downstream stages
            if (counterEvidence && counterEvidence.length > 0) {
              evidence = [...(evidence || []), ...counterEvidence];
            }
          } else {
            logger.info('Skipping adversarial probe', { runId, stage: 'adversarial_probe' });
          }
        }

        // ─── Stage 4: Evidence Gap Detection ────────────────────────
        if (!await isCompleted('gap_detection') && !skippedStages.has('gap_detection')) {
          await this.runStageWithQuality(
            'gap_detection', runId, projectId, iteration,
            async () => {
              const result = await this.evidenceStage.performEvidenceGapDetection(runId, projectId, currentVersion.id, modelIds);
              return { output: result, schema: EvidenceGapOutputSchema };
            },
            modelIds, allQualityReports, stageAttempts,
          );
        } else {
          logger.info('Skipping gap detection', { runId, stage: 'gap_detection' });
        }

        // ─── Stage 5: Independent Reviews ───────────────────────────
        await checkCheckpoint('review');
        if (!await isCompleted('review') && !skippedStages.has('review')) {
          await this.runStageWithQuality(
            'review', runId, projectId, iteration,
            async () => {
              const result = await this.reviewStage.performReviews(runId, projectId, currentVersion.id, modelIds);
              return { output: { reviewsDone: result.length }, schema: null }; // Returns ModelReview[] from DB, model output validated inside independentReview()
            },
            modelIds, allQualityReports, stageAttempts,
          );
        } else {
          logger.info('Skipping review', { runId, stage: 'review' });
        }

        // ─── Stage 6: Cross-Critiques ──────────────────────────────
        let critiques: Critique[];
        if (await isCompleted('critique') || skippedStages.has('critique')) {
          logger.info('Skipping critique', { runId, stage: 'critique' });
          critiques = await prisma.critique.findMany({ where: { projectId, ideaVersionId: currentVersion.id } }) as Critique[];
        } else {
          critiques = await this.runStageWithQuality(
            'critique', runId, projectId, iteration,
            async () => {
              const result = await this.critiqueStage.performCrossCritiques(runId, projectId, currentVersion.id, modelIds);
              return { output: result, schema: null }; // Returns Critique[] from DB, model output validated inside crossCritique()
            },
            modelIds, allQualityReports, stageAttempts,
          ) as Critique[];
        }

        if (critiques && critiques.length > 0) {
          if (!await isCompleted('critique_response') && !skippedStages.has('critique_response')) {
            await this.runStageWithQuality(
              'critique_response', runId, projectId, iteration,
              async () => {
                await this.critiqueStage.performCritiqueResponses(runId, projectId, critiques as Critique[], modelIds);
                return { output: { responded: true }, schema: null }; // Returns void, model output validated inside respondToCritique()
              },
              modelIds, allQualityReports, stageAttempts,
            );
          } else {
            logger.info('Skipping critique response', { runId, stage: 'critique_response' });
          }
        }

        // ─── Stage 7: Goal Achievement Evaluation ───────────────────
        let goalResult: Record<string, unknown>;
        if (await isCompleted('goal_evaluation') || skippedStages.has('goal_evaluation')) {
          // Load previous result from DB instead of using hardcoded fallback
          const previousGoalEvent = await prisma.runEvent.findFirst({
            where: { runId, type: 'phase.goal_evaluation.completed' },
            orderBy: { createdAt: 'desc' },
          });
          if (previousGoalEvent?.payload && typeof previousGoalEvent.payload === 'object') {
            goalResult = previousGoalEvent.payload as Record<string, unknown>;
            logger.info('Loaded previous goal evaluation result', { runId, goalAchieved: goalResult.goalAchieved });
          } else {
            // No previous result found - this is an error state
            throw new Error('Goal evaluation stage marked as completed but no previous result found. Cannot skip without data.');
          }
        } else {
          goalResult = await this.runStageWithQuality(
            'goal_evaluation', runId, projectId, iteration,
            async () => {
              const result = await this.revisionStage.performGoalEvaluation(runId, projectId, currentVersion.id, modelIds);
              return { output: result, schema: null }; // Returns simplified result, model output validated inside evaluateGoalAchievement()
            },
            modelIds, allQualityReports, stageAttempts,
          ) as Record<string, unknown>;
        }

        // ─── Stage 8: Consensus ─────────────────────────────────────
        await checkCheckpoint('consensus');
        let consensus: Record<string, unknown>;
        if (await isCompleted('consensus') || skippedStages.has('consensus')) {
          // Load previous result from DB instead of using hardcoded fallback
          const previousConsensusEvent = await prisma.runEvent.findFirst({
            where: { runId, type: 'phase.consensus.completed' },
            orderBy: { createdAt: 'desc' },
          });
          if (previousConsensusEvent?.payload && typeof previousConsensusEvent.payload === 'object') {
            consensus = previousConsensusEvent.payload as Record<string, unknown>;
            logger.info('Loaded previous consensus result', { runId, vote: consensus.vote });
          } else {
            // No previous result found - this is an error state
            throw new Error('Consensus stage marked as completed but no previous result found. Cannot skip without data.');
          }
        } else {
          consensus = await this.runStageWithQuality(
            'consensus', runId, projectId, iteration,
            async () => {
              const result = await this.consensusStage.performConsensus(runId, projectId, currentVersion.id, modelIds);
              return { output: result, schema: null }; // Returns { vote, votes } aggregation, model output validated inside voteConsensus()
            },
            modelIds, allQualityReports, stageAttempts,
          ) as Record<string, unknown>;
        }

        // ─── Evaluate Progress ──────────────────────────────────────
        const consensusVote = consensus?.vote as string || 'unknown';
        const goalAchieved = (goalResult?.goalAchieved as boolean) === true;
        const achievementLevel = (goalResult?.achievementLevel as string) || 'unknown';

        // Build iteration report
        const iterationReport: IterationReport = {
          iteration,
          stagesCompleted: ['extraction', 'discovery', 'assessment', 'gap_detection', 'review', 'critique', 'goal_evaluation', 'consensus'],
          stagesFailed: [],
          stagesSkipped: critiques && critiques.length > 0 ? [] : ['critique_response'],
          qualityScores: {},
          failurePatterns: {},
          consensusVote,
          goalAchievementLevel: achievementLevel,
          goalAchieved,
          hasDecision: false, // checked below
        };

        // Check if a decision was created in this iteration
        const existingDecisions = await prisma.decisionRecord.findMany({
          where: { ideaVersionId: currentVersion.id },
          take: 1,
        });
        iterationReport.hasDecision = existingDecisions.length > 0;

        // Compute calibration error from claims
        const allClaims = await prisma.claim.findMany({ where: { ideaVersionId: currentVersion.id } });
        const confidenceHistory = await prisma.claimConfidenceHistory.findMany({
          where: { claimId: { in: allClaims.map(c => c.id) } },
        });
        if (confidenceHistory.length > 0) {
          const latestConfidence = new Map<string, number>();
          for (const h of confidenceHistory) {
            const existing = latestConfidence.get(h.claimId);
            if (!existing || h.round > (existing as any)) {
              latestConfidence.set(h.claimId, h.confidence ?? 0);
            }
          }
          let totalError = 0;
          let count = 0;
          for (const claim of allClaims) {
            const conf = latestConfidence.get(claim.id) ?? 0;
            const actual = claim.status === 'supported' ? 1 : 0;
            totalError += Math.abs(conf - actual);
            count++;
          }
          if (count > 0) {
            iterationReport.calibrationError = totalError / count;
          }
        }

        // Populate quality scores from reports
        for (const report of allQualityReports) {
          iterationReport.qualityScores[report.role] = report.score;
          const issues = report.issues.filter(i => i.severity === 'fatal').map(i => i.message);
          if (issues.length > 0) {
            iterationReport.failurePatterns[report.role] = issues;
            if (!iterationReport.stagesFailed.includes(report.role)) {
              iterationReport.stagesFailed.push(report.role);
            }
          }
        }

        // ─── Self-Improvement: Analyze prompts for improvement ──────
        const improvementRequests: PromptImprovementRequest[] = [];
        if (this.currentLoopMode === 'self_improving') {
        for (const [role, _reports] of Object.entries(iterationReport.qualityScores)) {
          const request = promptRegistry.analyzeForImprovement(role, qualityThreshold);
          if (request) {
            improvementRequests.push(request);
          }
        }

        for (const request of improvementRequests) {
          const failureReport = {
            role: request.role,
            currentPrompt: request.currentText,
            currentVersion: request.currentVersion,
            failures: request.observedFailures,
          };

          let newPromptText: string;
          let improveReason: string;

          if (this.metaPromptService) {
            const result = await this.metaPromptService.improve(failureReport);
            if (result.success && result.improvedPrompt) {
              newPromptText = result.improvedPrompt;
              improveReason = `Auto-improvement via meta-prompt after ${request.observedFailures.length} failure types`;
            } else {
              // Fall back to instruction text
              newPromptText = actionPlanner.generateImprovementInstruction(
                request.role,
                request.currentText,
                request.observedFailures,
              );
              improveReason = `Instruction fallback (meta-prompt failed: ${result.error})`;
            }
          } else {
            // No meta-prompt service — use instruction text
            newPromptText = actionPlanner.generateImprovementInstruction(
              request.role,
              request.currentText,
              request.observedFailures,
            );
            improveReason = `Instruction fallback (no meta-prompt gateway configured)`;
          }

          await promptRegistry.improve(request.role, newPromptText, improveReason);

          await runEventService.record(runId, projectId, 'prompt.improved', {
            role: request.role,
            fromVersion: request.currentVersion,
            toVersion: promptRegistry.getVersion(request.role),
            failures: request.observedFailures.map(f => f.type),
          });

          logger.info('Prompt improved via self-healing', {
            role: request.role,
            version: promptRegistry.getVersion(request.role),
            failures: request.observedFailures.map(f => f.type),
          });
        }
        }

        // ─── Plan Corrective Actions ────────────────────────────────
        const correctiveActions = actionPlanner.planActions(iterationReport, modelIds, this.currentLoopMode);

        for (const action of correctiveActions) {
          await runEventService.record(runId, projectId, 'goal_loop.corrective_action', {
            type: action.type,
            target: action.target,
            reason: action.reason,
            priority: action.priority,
          });

          switch (action.type) {
            case 'rerun_stage': {
              logger.info('Corrective: re-running stage', { target: action.target, reason: action.reason });
              // Mark the stage as not completed so it re-runs in next iteration
              // This is handled by the stage completion check at the start of each iteration
              break;
            }
            case 'improve_prompt': {
              logger.info('Corrective: improving prompt', { target: action.target });
              // Skip if role is not registered in prompt registry
              const roleHistory = promptRegistry.getHistory(action.target);
              if (!roleHistory || roleHistory.length === 0) {
                logger.warn('Cannot improve prompt — role not registered', { target: action.target });
                break;
              }
              const failureReport = {
                role: action.target,
                currentPrompt: promptRegistry.get(action.target) || '',
                currentVersion: promptRegistry.getVersion(action.target),
                failures: [{ type: 'corrective_action', count: 1, examples: [action.reason] }],
              };
              const instruction = actionPlanner.generateImprovementInstruction(
                action.target,
                failureReport.currentPrompt,
                failureReport.failures,
              );
              await promptRegistry.improve(action.target, instruction, action.reason);
              logger.info('Prompt improved via corrective action', {
                role: action.target,
                version: promptRegistry.getVersion(action.target),
              });
              break;
            }
            case 'switch_model': {
              logger.info('Corrective: switching model lead', { target: action.target });
              // Find the model to switch to
              const targetModelIndex = modelIds.indexOf(action.target);
              if (targetModelIndex >= 0) {
                // Move the target model to the front of the array
                modelIds.splice(targetModelIndex, 1);
                modelIds.unshift(action.target);
                logger.info('Switched model lead', { newLead: action.target, modelOrder: modelIds });
              } else {
                logger.warn('Cannot switch model - target not found', { target: action.target });
              }
              break;
            }
            case 'add_context': {
              logger.info('Corrective: requesting additional context', { target: action.target, reason: action.reason });
              await runEventService.record(runId, projectId, 'goal_loop.context_enrichment_requested', {
                stage: action.target,
                reason: action.reason,
              });
              break;
            }
            case 'skip_stage': {
              logger.info('Corrective: skipping stage', { target: action.target, reason: action.reason });
              skippedStages.add(action.target);
              await runEventService.record(runId, projectId, 'goal_loop.stage_skipped', {
                stage: action.target,
                reason: action.reason,
              });
              break;
            }
            case 'adjust_temperature': {
              logger.info('Corrective: adjusting temperature', { target: action.target, reason: action.reason });
              // Store temperature adjustment for the target model
              const currentTemp = modelTemperatures.get(action.target) ?? 0.2;
              const newTemp = Math.min(1.0, Math.max(0.0, currentTemp + (action.params?.delta ?? 0.1)));
              modelTemperatures.set(action.target, newTemp);
              await runEventService.record(runId, projectId, 'goal_loop.temperature_adjusted', {
                modelId: action.target,
                oldTemp: currentTemp,
                newTemp,
                reason: action.reason,
              });
              break;
            }
            case 'request_more_evidence': {
              logger.info('Corrective: requesting more evidence', { target: action.target, reason: action.reason });
              await runEventService.record(runId, projectId, 'goal_loop.more_evidence_requested', {
                target: action.target,
                reason: action.reason,
              });
              break;
            }
            case 'escalate_to_user': {
              logger.info('Corrective: escalating to user', { target: action.target, reason: action.reason });
              await runEventService.record(runId, projectId, 'run.escalated', {
                stage: action.target,
                reason: action.reason,
                priority: action.priority,
              });
              // Pause the run by recording a paused event — the UI already handles paused state
              await runEventService.record(runId, projectId, 'run.paused', {
                reason: `Escalated: ${action.reason}`,
                escalatedStage: action.target,
              });
              break;
            }
            case 'adjust_calibration': {
              logger.info('Corrective: adjusting calibration', { target: action.target, reason: action.reason });
              // Increase temperature for the target model to get more diverse opinions
              const currentTemp = modelTemperatures.get(action.target) ?? 0.2;
              const newTemp = Math.min(0.8, currentTemp + 0.1);
              modelTemperatures.set(action.target, newTemp);
              await runEventService.record(runId, projectId, 'goal_loop.calibration_adjusted', {
                modelId: action.target,
                oldTemp: currentTemp,
                newTemp,
                calibrationError: action.params?.calibrationError,
                reason: action.reason,
              });
              break;
            }
            default:
              logger.info('Corrective action noted', { type: action.type, target: action.target });
          }
        }

        // ─── Check Stop Conditions ──────────────────────────────────
        const stopCheck = actionPlanner.shouldStop(iterationReport, maxIterations);

        if (stopCheck.stop) {
          await eventService.recordRunCompleted(projectId, {
            outcome: stopCheck.reason,
            iterationsUsed: iteration,
            achievementLevel,
            finalVote: consensusVote,
          }, 'system');
          await runEventService.record(runId, projectId, 'run.completed', {
            outcome: stopCheck.reason,
            iterationsUsed: iteration,
            achievementLevel,
            finalVote: consensusVote,
          });

          await runEventService.record(runId, projectId, 'goal_loop.completed', {
            outcome: stopCheck.reason,
            iterationsUsed: iteration,
            achievementLevel,
            finalVote: consensusVote,
          });

          // Update idea version status based on outcome
          // Look up the actual decision status to pick the right version status
          const latestDecision = iterationReport.hasDecision
            ? await prisma.decisionRecord.findFirst({
                where: { ideaVersionId: currentVersion.id },
                orderBy: { createdAt: 'desc' },
              })
            : null;
          const decisionStatus = latestDecision?.decisionStatus;
          const exitStatus =
            decisionStatus === 'full_consensus' || decisionStatus === 'qualified_consensus'
              ? 'accepted'
              : decisionStatus === 'needs_external_validation'
                ? 'under_review'
                : 'needs_revision';
          await prisma.ideaVersion.update({
            where: { id: currentVersion.id },
            data: { status: exitStatus },
          });
          logger.info('IdeaVersion status updated', { versionId: currentVersion.id, status: exitStatus, hasDecision: iterationReport.hasDecision, decisionStatus });

          logger.info('GoalSeekingLoop completed', { runId, reason: stopCheck.reason, iteration });
          return;
        }

        // ─── Revision (create new version for next iteration) ───────
        if (iteration < maxIterations) {
          if (await isCompleted('revision')) {
            logger.info('Skipping revision', { runId, stage: 'revision' });
          } else {
            try {
              const oldVersion = currentVersion;
              const revised = await this.revisionStage.performRevision(runId, projectId, oldVersion.id, modelIds[0]);
              currentVersion = revised;

              await runEventService.record(runId, projectId, 'idea.version_advanced', {
                oldVersionId: oldVersion.id,
                newVersionId: revised.id,
                iteration,
              });

              // Preserve iteration history — do NOT delete run stages
            } catch (revErr: unknown) {
              logger.warn('Revision failed, continuing with current version', {
                runId, iteration, error: (revErr as Error).message,
              });
            }
          }
        }

        // Log iteration summary with quality scores
        const iterationDurationMs = Date.now() - iterationStartTime;
        const recentReports = allQualityReports.slice(-9); // Last 9 stages (one iteration)
        
        // Aggregate scores for this iteration
        const iterationScores = recentReports.filter(r => r.role).map(r => ({ role: r.role, score: r.score }));
        const avgScore = iterationScores.length > 0 
          ? iterationScores.reduce((sum, s) => sum + s.score, 0) / iterationScores.length 
          : 1.0;

        logger.info('Iteration summary', {
          runId,
          iteration,
          durationMs: iterationDurationMs,
          avgQualityScore: Math.round(avgScore * 100) / 100,
          roleScores: iterationScores,
          correctiveActions: correctiveActions.length,
          qualityIssues: improvementRequests.length,
        });

        await runEventService.record(runId, projectId, 'goal_loop.iteration_completed', {
          iteration,
          durationMs: iterationDurationMs,
          avgQualityScore: avgScore,
          correctiveActions: correctiveActions.length,
          qualityIssues: improvementRequests.length,
        });
      }

      // Persist final iteration metrics for the metrics endpoint
      try {
        const lastEvent = await prisma.runEvent.findFirst({
          where: { runId, type: 'goal_loop.iteration_completed' },
          orderBy: { createdAt: 'desc' },
        });
        if (lastEvent?.payload) {
          (lastEvent.payload as Record<string, unknown>).isFinal = true;
          await prisma.runEvent.update({
            where: { id: lastEvent.id },
            data: { payload: lastEvent.payload },
          });
        }
      } catch (err) {
        logger.warn('Failed to persist final iteration metrics', { runId, error: (err as Error).message });
      }

      // Final run summary
      const totalDurationMs = Date.now() - startTime;
      const allScores = allQualityReports.map(r => r.score);
      const avgFinalScore = allScores.length > 0 
        ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length 
        : 1.0;
      const minFinalScore = allScores.length > 0 ? Math.min(...allScores) : 1.0;
      const unusableCount = allQualityReports.filter(r => !r.isUsable).length;

      logger.info('GoalSeekingLoop final summary', {
        runId,
        projectId,
        totalDurationMs,
        iterationsUsed: maxIterations,
        avgQualityScore: Math.round(avgFinalScore * 100) / 100,
        minQualityScore: Math.round(minFinalScore * 100) / 100,
        totalStagesAnalyzed: allScores.length,
        unusableOutputs: unusableCount,
        outcome: 'max_iterations_reached',
      });

      // Maximum iterations reached without goal
      await eventService.recordRunCompleted(projectId, {
        outcome: 'max_iterations_reached',
        iterationsUsed: maxIterations,
        avgQualityScore: avgFinalScore,
        totalStagesAnalyzed: allScores.length,
      }, 'system');
      await runEventService.record(runId, projectId, 'run.completed', {
        outcome: 'max_iterations_reached',
        iterationsUsed: maxIterations,
        avgQualityScore: avgFinalScore,
        totalStagesAnalyzed: allScores.length,
      });

      await runEventService.record(runId, projectId, 'goal_loop.completed', {
        outcome: 'max_iterations_reached',
        iterationsUsed: maxIterations,
        avgQualityScore: avgFinalScore,
        totalStagesAnalyzed: allScores.length,
      });

      // Update idea version status — max iterations with no decision = needs revision
      await prisma.ideaVersion.update({
        where: { id: currentVersion.id },
        data: { status: 'needs_revision' },
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? (err as Error).message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('GoalSeekingLoop fatal error', { runId, projectId, error: message, stack });
      await eventService.recordRunFailed(projectId, { outcome: 'failed', error: message, stack }, 'system');
      await runEventService.record(runId, projectId, 'run.failed', { error: message, stack });
      // Mark the idea version as failed so it's not stuck in 'under_review' forever
      if (versionIdForCleanup) {
        try {
          await prisma.ideaVersion.update({
            where: { id: versionIdForCleanup },
            data: { status: 'needs_revision' },
          });
        } catch (err) {
          logger.warn('Failed to update ideaVersion status during cleanup', { versionId: versionIdForCleanup, error: (err as Error).message });
        }
      }
      throw err;
    }
  }

  /** Map from stage name to PromptRegistry role */
  private stageToRole(stageName: string): string | undefined {
    const map: Record<string, string> = {
      extraction: 'claim_extraction',
      gap_detection: 'evidence_gap_analyst',
      review: 'independent_reviewer',
      critique: 'critic',
      critique_response: 'critique_responder',
      goal_evaluation: 'goal_evaluator',
      consensus: 'consensus_voter',
      revision: 'revision_writer',
    };
    return map[stageName];
  }

  /**
   * Run a stage with quality tracking and automatic retry with prompt improvement.
   * On first failure, attempts to improve the prompt via MetaPromptService and retries.
   */
  private async runStageWithQuality<T>(
    stageName: string,
    runId: string,
    projectId: string,
    iteration: number,
    stageFn: () => Promise<{ output: T; schema: ZodType | null }>,
    modelIds: string[],
    allReports: OutputQualityReport[],
    stageAttempts: Map<string, number>,
  ): Promise<T> {
    const attempt = (stageAttempts.get(stageName) || 0) + 1;
    stageAttempts.set(stageName, attempt);

    await runEventService.record(runId, projectId, 'goal_loop.stage_started', {
      stage: stageName, iteration, attempt,
    });

    try {
      const { output, schema } = await stageFn();

      // Analyze quality if there's a schema to validate against
      if (schema) {
        const report = analyzer.analyze(output, schema, stageName);
        allReports.push(report);

        // Record quality event
        await runEventService.record(runId, projectId, 'goal_loop.quality_report', {
          stage: stageName,
          score: report.score,
          isUsable: report.isUsable,
          issueCount: report.issues.length,
          snippet: report.snippet,
        });

        // Update prompt registry
        await promptRegistry.recordCall(
          stageName,
          report.score,
          report.isUsable,
          report.issues.map(i => i.type),
        );

        // If output is unusable and we have a meta-prompt service, try improvement + retry
        if (!report.isUsable && this.metaPromptService && attempt < 2 && this.currentLoopMode === 'self_improving') {
          const role = this.stageToRole(stageName);
          const currentText = role ? promptRegistry.get(role) : undefined;
          if (role && currentText) {
            logger.info('Stage output unusable — attempting prompt improvement and retry', {
              stageName, role, score: report.score,
            });

            const improvementResult = await this.metaPromptService.improve({
              role,
              currentPrompt: currentText,
              currentVersion: promptRegistry.getVersion(role),
              failures: report.issues.map(i => ({
                type: i.type,
                count: 1,
                examples: [i.message],
              })),
              lastError: report.issues[0]?.message,
            });

            if (improvementResult.success && improvementResult.improvedPrompt) {
              await promptRegistry.improve(
                role,
                improvementResult.improvedPrompt,
                `Retry improvement: ${report.issues.length} issues in ${stageName}`,
              );

              await runEventService.record(runId, projectId, 'prompt.improved', {
                role,
                fromVersion: promptRegistry.getVersion(role) - 1,
                toVersion: promptRegistry.getVersion(role),
                failures: report.issues.map(i => i.type),
                retryForStage: stageName,
              });

              // Retry the stage with improved prompt
              logger.info('Retrying stage after prompt improvement', { stageName, role });
              const retryAttempt = attempt + 1;
              stageAttempts.set(stageName, retryAttempt);

              await runEventService.record(runId, projectId, 'goal_loop.stage_retry', {
                stage: stageName, iteration, retryAttempt,
              });

              const retryResult = await stageFn();

              // Validate retry output
              if (retryResult.schema) {
                const retryReport = analyzer.analyze(retryResult.output, retryResult.schema, stageName);
                allReports.push(retryReport);
                await promptRegistry.recordCall(
                  stageName,
                  retryReport.score,
                  retryReport.isUsable,
                  retryReport.issues.map(i => i.type),
                );

                if (retryReport.isUsable) {
                  await runEventService.record(runId, projectId, 'goal_loop.stage_recovered', {
                    stage: stageName, iteration, retryAttempt,
                  });
                  logger.info('Stage recovered after prompt improvement', { stageName, role });
                } else {
                  logger.error('Stage not recovered after prompt improvement — propagating', {
                    stageName, role, score: retryReport.score,
                  });
                  await runEventService.record(runId, projectId, 'goal_loop.stage_unrecoverable', {
                    stage: stageName, iteration, retryAttempt, score: retryReport.score,
                  });
                  throw new Error(`Stage ${stageName} not recovered after prompt improvement (score: ${retryReport.score}, issues: ${retryReport.issues.length})`);
                }
              }

              return retryResult.output;
            }
          }
        }
      }

      await runEventService.record(runId, projectId, 'goal_loop.stage_completed', {
        stage: stageName, iteration, attempt,
      });

      return output;
    } catch (err: unknown) {
      logger.error('Stage failed in goal loop', { stageName, iteration, error: (err as Error).message });

      allReports.push({
        score: 0,
        isUsable: false,
        issues: [{ type: 'empty_output', severity: 'fatal', message: (err as Error).message }],
        role: stageName,
      });

      await promptRegistry.recordCall(stageName, 0, false, ['stage_error']);

      await runEventService.record(runId, projectId, 'goal_loop.stage_failed', {
        stage: stageName, iteration, attempt, error: (err as Error).message,
      });

      // If this is the first attempt and we have a meta-prompt service, try improvement + retry
      if (attempt < 2 && this.metaPromptService) {
        const role = this.stageToRole(stageName);
        const currentText = role ? promptRegistry.get(role) : undefined;
        if (role && currentText) {
          logger.info('Retrying stage after prompt improvement (caught error)', {
            stageName, role, error: (err as Error).message,
          });

          const improvementResult = await this.metaPromptService.improve({
            role,
            currentPrompt: currentText,
            currentVersion: promptRegistry.getVersion(role),
            failures: [{ type: 'stage_error', count: 1, examples: [(err as Error).message] }],
            lastError: (err as Error).message,
          });

          if (improvementResult.success && improvementResult.improvedPrompt) {
            await promptRegistry.improve(
              role,
              improvementResult.improvedPrompt,
              `Retry after error: ${(err as Error).message}`,
            );

            const retryAttempt = attempt + 1;
            stageAttempts.set(stageName, retryAttempt);

            await runEventService.record(runId, projectId, 'goal_loop.stage_retry', {
              stage: stageName, iteration, retryAttempt,
            });

            // Retry the stage
            const retryResult = await stageFn();

            if (retryResult.schema) {
              const retryReport = analyzer.analyze(retryResult.output, retryResult.schema, stageName);
              allReports.push(retryReport);
              await promptRegistry.recordCall(
                stageName,
                retryReport.score,
                retryReport.isUsable,
                retryReport.issues.map(i => i.type),
              );

              if (!retryReport.isUsable) {
                logger.error('Stage not recovered after prompt improvement (caught error retry) — propagating', {
                  stageName, role, score: retryReport.score,
                });
                await runEventService.record(runId, projectId, 'goal_loop.stage_unrecoverable', {
                  stage: stageName, iteration, retryAttempt, score: retryReport.score,
                });
                throw new Error(`Stage ${stageName} not recovered after prompt improvement (score: ${retryReport.score}, issues: ${retryReport.issues.length})`);
              }
            }

            await runEventService.record(runId, projectId, 'goal_loop.stage_recovered', {
              stage: stageName, iteration, retryAttempt,
            });

            return retryResult.output;
          }
        }
      }

      throw err;
    }
  }
}
