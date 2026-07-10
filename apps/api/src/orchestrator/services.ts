import { ModelGateway, SearchProviderAdapter } from '@repo/model-gateway';
import { DEFAULT_TOKEN_BUDGET } from '../config/constants.js';
import {
  ClaimExtractionOutputSchema,
  type ClaimExtractionOutput,
  EvidenceAssessmentOutputSchema,
  IndependentReviewOutputSchema,
  CrossCritiqueOutputSchema,
  CritiqueResponseOutputSchema,
  IdeaRevisionOutputSchema,
  ConsensusVoteOutputSchema,
  DecisionRecordOutputSchema,
  GoalAchievementOutputSchema,
  EvidenceGapOutputSchema,
  AdversarialProbeOutputSchema,
  LiteratureReviewOutputSchema,
  ArgumentMapOutputSchema,
} from './prompts.schemas.js';
import { ContextManifestService, contextService, ManifestContext } from '../services/context.service.js';
import { buildPrompt, injectTaskMarker, ROLE_SYSTEM_PROMPTS } from './prompts.js';
import { logger } from '../utils/logger.js';
import { IdeaVersion, Claim, Evidence, ModelReview, Critique } from '@repo/shared';
import type { PromptRegistry } from './prompt-registry.js';

const manifestService = new ContextManifestService();

export class DeliberationServices {
  constructor(
    private gateways: Map<string, ModelGateway>,
    private searchAdapter?: SearchProviderAdapter,
    private promptRegistry?: PromptRegistry,
  ) {}

  private resolvePrompt(role: string): string | undefined {
    const r = this.promptRegistry?.get(role);
    if (r && r !== role) return r; // actual prompt text, not just role name
    return undefined;
  }

  private getGateway(modelId: string): ModelGateway {
    const gw = this.gateways.get(modelId);
    if (!gw) throw new Error(`No gateway configured for model ${modelId}`);
    return gw;
  }

  private async recordManifest(
    projectId: string,
    modelId: string,
    taskLabel: string,
    context: ManifestContext,
    queryText?: string,
  ): Promise<void> {
    try {
      let retrievalReason: Record<string, unknown> = { task: taskLabel };

      if (process.env.EMBEDDING_ENABLED === 'true' && queryText?.trim()) {
        const relevant = await contextService.getRelevantContext(projectId, queryText);
        if (relevant.retrievalReason != null) {
          retrievalReason = { ...retrievalReason, ...relevant.retrievalReason };
        }
        if (relevant.claims.length > 0) {
          context.includedClaims = relevant.claims.map((c) => c.id);
        }
        if (relevant.acceptedEvidence.length > 0) {
          const semanticEvidenceIds = relevant.acceptedEvidence.map((e) => e.id);
          context.includedEvidence = [
            ...new Set([...(context.includedEvidence || []), ...semanticEvidenceIds]),
          ];
        }
      }

      await manifestService.record(projectId, modelId, DEFAULT_TOKEN_BUDGET, context, undefined, retrievalReason);
    } catch (err) {
      logger.warn('Failed to record ContextManifest', { error: (err as Error).message });
    }
  }

  async search(query: string) {
    if (!this.searchAdapter) return [];
    try {
      return await this.searchAdapter.search(query);
    } catch (error) {
      logger.error('Search failed', { error: (error as Error).message });
      return [];
    }
  }

  async extractClaims(projectGoal: string, ideaVersion: IdeaVersion, existingClaims: Claim[], modelId: string): Promise<ClaimExtractionOutput> {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('claim_extraction', {
      projectGoal,
      ideaVersion,
      existingClaims,
    }, this.resolvePrompt('claim_extraction'));
    const prompt = injectTaskMarker('claim_extraction', `${system}\n\n${user}`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'claim_extraction',
      { includedClaims: existingClaims.map(c => c.id) }
    );

    const result = await gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'claim_extraction' },
    }, ClaimExtractionOutputSchema);
    // Ensure all fields are present with defaults
    return {
      claims: result.claims ?? [],
      hypotheses: result.hypotheses ?? [],
      openQuestions: result.openQuestions ?? []
    };
  }

  async assessEvidence(claim: Claim, evidence: Evidence, interpretation: string, modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('source_auditor', {
      claim,
      evidence,
      interpretation,
    }, this.resolvePrompt('source_auditor'));
    const prompt = injectTaskMarker('evidence_assessment', `${system}\n\n${user}`);

    await this.recordManifest(
      claim.projectId, modelId, 'evidence_assessment',
      { includedEvidence: [evidence.id], includedClaims: [claim.id] }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: claim.projectId, modelConfigId: modelId, taskLabel: 'evidence_assessment' },
    }, EvidenceAssessmentOutputSchema);
  }

  async independentReview(
    ideaVersion: IdeaVersion,
    claims: Claim[],
    acceptedEvidence: Evidence[],
    counterEvidence: Evidence[],
    extraContext: Record<string, unknown>[] = [],
    modelId: string,
  ) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('independent_reviewer', {
      ideaVersion,
      claims,
      acceptedEvidence,
      counterEvidence,
      extraContext: extraContext.length > 0 ? extraContext : undefined,
    }, this.resolvePrompt('independent_reviewer'));
    const prompt = injectTaskMarker('independent_review', `${system}\n\n${user}`);

    const reviewQuery = `${ideaVersion.title} ${ideaVersion.description}`.trim();
    await this.recordManifest(
      ideaVersion.projectId, modelId, 'independent_review',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: [...acceptedEvidence.map(e => e.id), ...counterEvidence.map(e => e.id)],
      },
      reviewQuery,
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'independent_review' },
    }, IndependentReviewOutputSchema);
  }

  async crossCritique(
    ideaVersion: IdeaVersion,
    reviews: ModelReview[],
    claims: Claim[],
    evidencePack: Evidence[],
    modelId: string,
  ) {
    const gw = this.getGateway(modelId);

    // Build a context block with real IDs so the mock adapter can use them
    const idContext = [
      reviews.length > 0 ? `- Review IDs: ${reviews.map(r => r.id).join(', ')}` : '',
      claims.length > 0 ? `- Claim IDs: ${claims.map(c => c.id).join(', ')}` : '',
      `- Idea version ID: ${ideaVersion.id}`,
    ].filter(Boolean).join('\n');

    const { system, user } = buildPrompt('critic', {
      ideaVersion,
      modelReviews: reviews,
      claims,
      evidencePack,
    }, this.resolvePrompt('critic'));
    const prompt = injectTaskMarker('cross_critique', `${system}\n\n${user}\n\nAvailable real IDs for critique targets:\n${idContext}\nUse these IDs when creating critiques. Do not use placeholder or zero UUIDs.`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'cross_critique',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidencePack.map(e => e.id),
      },
      ideaVersion.description,
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'cross_critique' },
    }, CrossCritiqueOutputSchema);
  }

  async respondToCritique(originalPosition: { projectId?: string } | null, critique: Critique, evidence: Evidence[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('critique_responder', {
      originalPosition,
      critique,
      evidence,
    }, this.resolvePrompt('critique_responder'));
    const prompt = injectTaskMarker('critique_response', `${system}\n\n${user}`);

    const projectId = originalPosition?.projectId || critique.projectId;
    await this.recordManifest(
      projectId, modelId, 'critique_response',
      { includedEvidence: evidence.map(e => e.id) }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId, modelConfigId: modelId, taskLabel: 'critique_response' },
    }, CritiqueResponseOutputSchema);
  }

  async reviseIdea(ideaVersion: IdeaVersion, acceptedCritiques: Critique[], acceptedEvidence: Evidence[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('revision_writer', {
      currentIdeaVersion: ideaVersion,
      acceptedCritiques,
      acceptedEvidence,
    }, this.resolvePrompt('revision_writer'));
    const prompt = injectTaskMarker('idea_revision', `${system}\n\n${user}`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'idea_revision',
      {
        includedCritiques: acceptedCritiques.map(c => c.id),
        includedEvidence: acceptedEvidence.map(e => e.id),
      }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'idea_revision' },
    }, IdeaRevisionOutputSchema);
  }

  async voteConsensus(ideaVersion: IdeaVersion, claims: Claim[], acceptedEvidence: Evidence[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('consensus_voter', {
      ideaVersion,
      claims,
      acceptedEvidence,
    }, this.resolvePrompt('consensus_voter'));
    const prompt = injectTaskMarker('consensus_vote', `${system}\n\n${user}`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'consensus_vote',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: acceptedEvidence.map(e => e.id),
      }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'consensus_vote' },
    }, ConsensusVoteOutputSchema);
  }

  async generateDecision(ideaVersion: IdeaVersion, votes: Record<string, unknown>[], claims: Claim[], evidence: Evidence[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('decision_writer', {
      finalIdeaVersion: ideaVersion,
      modelVotes: votes,
      claims,
      evidence,
    }, this.resolvePrompt('decision_writer'));
    const prompt = injectTaskMarker('decision_record', `${system}\n\n${user}`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'decision_record',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidence.map(e => e.id),
      }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'decision_record' },
    }, DecisionRecordOutputSchema);
  }

  async evaluateGoalAchievement(
    projectGoal: string,
    ideaVersion: IdeaVersion,
    claims: Claim[],
    evidence: Evidence[],
    critiques: { id?: string; text?: string; severity?: string; status?: string }[],
    decisions: { id?: string; decisionStatus?: string; decisionText?: string }[],
    modelId: string,
  ) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('goal_evaluator', {
      projectGoal,
      ideaVersion,
      claimsStatuses: claims.map(c => ({ text: c.text, status: c.status, criticality: c.criticality })),
      evidenceSummary: evidence.map(e => ({ title: e.title, status: e.status, reliability: e.reliability, isCounter: e.isCounter })),
      critiques: critiques.map(c => ({ text: c.text, severity: c.severity, status: c.status })),
      decisions: decisions.map(d => ({ status: d.decisionStatus, text: d.decisionText })),
    }, this.resolvePrompt('goal_evaluator'));
    const prompt = injectTaskMarker('goal_achievement_evaluation', `${system}\n\n${user}`);

    await this.recordManifest(
      ideaVersion.projectId, modelId, 'goal_achievement_evaluation',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidence.map(e => e.id),
        includedCritiques: critiques.map(c => c.id).filter((id): id is string => !!id),
        includedDecisions: decisions.map(d => d.id).filter((id): id is string => !!id),
      }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: ideaVersion.projectId, modelConfigId: modelId, taskLabel: 'goal_evaluation' },
    }, GoalAchievementOutputSchema);
  }

  async detectEvidenceGaps(claims: Claim[], evidence: Evidence[], assessments: { evidenceId?: string; finalVerdict?: string; reliability?: string }[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('evidence_gap_analyst', {
      claims: claims.map(c => ({ id: c.id, text: c.text, status: c.status, criticality: c.criticality, requiresEvidence: c.requiresEvidence })),
      evidence: evidence.map(e => ({ id: e.id, claimId: e.claimId, title: e.title, status: e.status, reliability: e.reliability, isCounter: e.isCounter })),
      assessments: (assessments || []).map(a => ({ evidenceId: a.evidenceId, finalVerdict: a.finalVerdict, reliability: a.reliability })),
    }, this.resolvePrompt('evidence_gap_analyst'));
    const prompt = injectTaskMarker('evidence_gap_analysis', `${system}\n\n${user}`);

    await this.recordManifest(
      claims[0]?.projectId || 'unknown', modelId, 'evidence_gap_analysis',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidence.map(e => e.id),
      }
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: claims[0]?.projectId || 'unknown', modelConfigId: modelId, taskLabel: 'evidence_gap' },
    }, EvidenceGapOutputSchema);
  }

  async adversarialProbe(claim: Claim, existingEvidence: Evidence[], modelId: string) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('adversarial_prober', {
      claim,
      existingEvidenceSummary: existingEvidence.map(e => ({ id: e.id, title: e.title, isCounter: e.isCounter })),
    }, this.resolvePrompt('adversarial_prober'));
    const prompt = injectTaskMarker('adversarial_probe', `${system}\n\n${user}`);

    await this.recordManifest(
      claim.projectId, modelId, 'adversarial_probe',
      { includedClaims: [claim.id], includedEvidence: existingEvidence.map(e => e.id) },
      claim.text,
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: claim.projectId, modelConfigId: modelId, taskLabel: 'adversarial_probe' },
    }, AdversarialProbeOutputSchema);
  }

  async generateLiteratureReview(
    researchQuestion: string,
    evidence: Evidence[],
    claims: Claim[],
    modelId: string,
  ) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('literature_reviewer', {
      researchQuestion,
      evidence: evidence.map(e => ({ id: e.id, title: e.title, excerpt: e.excerpt, sourceType: e.sourceType, reliability: e.reliability })),
      claims: claims.map(c => ({ id: c.id, text: c.text, status: c.status })),
    }, this.resolvePrompt('literature_reviewer'));
    const prompt = injectTaskMarker('literature_review', `${system}\n\n${user}`);

    await this.recordManifest(
      claims[0]?.projectId || 'unknown', modelId, 'literature_review',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidence.map(e => e.id),
      },
      researchQuestion,
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: claims[0]?.projectId || 'unknown', modelConfigId: modelId, taskLabel: 'literature_review' },
    }, LiteratureReviewOutputSchema);
  }

  async generateArgumentMap(
    claims: Claim[],
    evidence: Evidence[],
    critiques: { text?: string; severity?: string }[],
    modelId: string,
  ) {
    const gw = this.getGateway(modelId);
    const { system, user } = buildPrompt('argument_mapper', {
      claims: claims.map(c => ({ id: c.id, text: c.text, status: c.status, criticality: c.criticality })),
      evidence: evidence.map(e => ({ id: e.id, title: e.title, excerpt: e.excerpt, reliability: e.reliability, isCounter: e.isCounter })),
      critiques: critiques.map(c => ({ text: c.text, severity: c.severity })),
    }, this.resolvePrompt('argument_mapper'));
    const prompt = injectTaskMarker('argument_map', `${system}\n\n${user}`);

    await this.recordManifest(
      claims[0]?.projectId || 'unknown', modelId, 'argument_map',
      {
        includedClaims: claims.map(c => c.id),
        includedEvidence: evidence.map(e => e.id),
      },
      claims.map(c => c.text).join(' '),
    );

    return gw.callJson({
      messages: [{ role: 'user', content: prompt }],
      metadata: { projectId: claims[0]?.projectId || 'unknown', modelConfigId: modelId, taskLabel: 'argument_map' },
    }, ArgumentMapOutputSchema);
  }
}
