import { z } from 'zod';

// --- Enums ---

export const ProjectStatus = z.enum(['active', 'archived']);
export const IdeaVersionStatus = z.enum(['under_review', 'needs_revision', 'accepted', 'rejected', 'superseded']);
export const ClaimType = z.enum(['technical', 'product', 'market', 'business', 'legal', 'ux', 'research', 'risk', 'assumption']);
export const Criticality = z.enum(['low', 'medium', 'high', 'blocking']);
export const ClaimStatus = z.enum(['unverified', 'supported', 'partially_supported', 'contradicted', 'unsupported', 'needs_external_validation']);
export const SourceType = z.enum(['official', 'academic', 'government', 'company', 'news', 'benchmark', 'blog', 'forum', 'user_input', 'unknown']);
export const Reliability = z.enum(['pending', 'high', 'medium', 'low', 'unusable']);
export const Relevance = z.enum(['pending', 'direct', 'indirect', 'weak', 'irrelevant']);
export const EvidenceStatus = z.enum(['pending_review', 'accepted', 'accepted_with_caution', 'rejected', 'irrelevant', 'needs_better_source']);
export const InterpretationVerdict = z.enum(['correctly_used', 'overstated', 'misinterpreted', 'out_of_context', 'insufficient']);
export const FinalVerdict = z.enum(['accept', 'accept_with_caution', 'accept_with_reservations', 'reject']);
export const TaskRole = z.enum(['researcher', 'skeptic', 'source_auditor', 'inference_auditor', 'reviewer', 'critic', 'synthesizer', 'decision_auditor']);
export const TaskPriority = z.enum(['low', 'medium', 'high', 'critical']);
export const TaskStatus = z.enum(['todo', 'running', 'done', 'blocked', 'cancelled', 'failed']);
export const DecisionStatus = z.enum(['full_consensus', 'qualified_consensus', 'no_consensus', 'needs_more_evidence', 'needs_external_validation', 'max_rounds_reached']);
export const HypothesisStatus = z.enum(['unexamined', 'testing', 'confirmed', 'rejected', 'inconclusive']);

// --- Entities ---

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  goal: z.string(),
  currentSynthesis: z.string().nullable().optional(),
  status: ProjectStatus.default('active'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ResearchSessionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sessionGoal: z.string(),
  startedAt: z.date(),
  endedAt: z.date().nullable().optional(),
  summary: z.string().nullable().optional(),
  status: z.string().default('active'),
});

export const IdeaVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  versionNumber: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: IdeaVersionStatus.default('under_review'),
  changesFromPrevious: z.any().nullable().optional(),
  createdBecauseOfCritiqueIds: z.array(z.string().uuid()).nullable().optional(),
  createdAt: z.date(),
});

export const ClaimSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaVersionId: z.string().uuid(),
  text: z.string(),
  type: ClaimType,
  requiresEvidence: z.boolean().default(true),
  criticality: Criticality,
  status: ClaimStatus.default('unverified'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.date(),
});

export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  claimId: z.string().uuid().nullable().optional(),
  discoveredByModelId: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  title: z.string(),
  publisher: z.string().nullable().optional(),
  publishedAt: z.date().nullable().optional(),
  retrievedAt: z.date(),
  sourceType: SourceType,
  excerpt: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  rawContentRef: z.string().nullable().optional(),
  reliability: Reliability.default('pending'),
  relevance: Relevance.default('pending'),
  status: EvidenceStatus.default('pending_review'),
  stalenessRisk: z.enum(['low', 'medium', 'high']).default('medium'),
  isCounter: z.boolean().default(false),
  createdAt: z.date(),
});

export const EvidenceAssessmentSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  reviewerModelId: z.string(),
  reliability: Reliability.exclude(['pending']),
  relevance: Relevance.exclude(['pending']),
  interpretationVerdict: InterpretationVerdict,
  detectedProblems: z.array(z.string()).nullable().optional(),
  notes: z.string(),
  finalVerdict: FinalVerdict,
  createdAt: z.date(),
});

export const ModelConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.enum(['openrouter', 'ollama', 'openai_compatible']),
  model: z.string(),
  baseUrl: z.string().url().nullable().optional(),
  apiKeyRef: z.string().nullable().optional(),
  contextWindow: z.number().int().min(1000),
  preferredMaxInputRatio: z.number().min(0).max(1).default(0.5),
  outputReserveRatio: z.number().min(0).max(1).default(0.2),
  defaultTemperature: z.number().min(0).max(2).default(0.2),
  supportsStreaming: z.boolean().default(false),
  supportsJsonMode: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ModelReviewSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaVersionId: z.string().uuid(),
  modelId: z.string(),
  verdict: z.string(),
  strengths: z.array(z.string()).nullable().optional(),
  weaknesses: z.array(z.string()).nullable().optional(),
  blockingIssues: z.array(z.string()).nullable().optional(),
  supportedClaims: z.array(z.string().uuid()).nullable().optional(),
  unsupportedClaims: z.array(z.string().uuid()).nullable().optional(),
  suggestedRevisions: z.array(z.string()).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.date(),
});

export const CritiqueSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaVersionId: z.string().uuid(),
  criticModelId: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid(),
  critiqueType: z.string(),
  severity: z.string(),
  text: z.string(),
  whyItMatters: z.string(),
  proposedFix: z.string().nullable().optional(),
  evidenceIds: z.array(z.string().uuid()).nullable().optional(),
  status: z.string().default('open'),
  createdAt: z.date(),
});

export const CritiqueResponseSchema = z.object({
  id: z.string().uuid(),
  critiqueId: z.string().uuid(),
  targetModelId: z.string().nullable().optional(),
  verdict: z.string(),
  reason: z.string(),
  positionChange: z.string(),
  revisedClaim: z.string().nullable().optional(),
  requestedEvidence: z.array(z.string()).nullable().optional(),
  createdAt: z.date(),
});

export const DecisionRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaVersionId: z.string().uuid(),
  decisionStatus: DecisionStatus,
  decisionText: z.string(),
  whyGood: z.array(z.string()).nullable().optional(),
  whyBad: z.array(z.string()).nullable().optional(),
  knownWeaknesses: z.array(z.string()).nullable().optional(),
  acceptedEvidenceIds: z.array(z.string().uuid()).nullable().optional(),
  counterEvidenceIds: z.array(z.string().uuid()).nullable().optional(),
  resolvedCritiqueIds: z.array(z.string().uuid()).nullable().optional(),
  unresolvedRisks: z.array(z.string()).nullable().optional(),
  modelFinalVotes: z.record(z.string(), z.string()).nullable().optional(),
  reopenConditions: z.array(z.string()).nullable().optional(),
  nextActions: z.array(z.string()).nullable().optional(),
  createdAt: z.date(),
});

export const ContextManifestSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  modelId: z.string(),
  includedClaims: z.array(z.string().uuid()).nullable().optional(),
  includedEvidence: z.array(z.string().uuid()).nullable().optional(),
  includedCritiques: z.array(z.string().uuid()).nullable().optional(),
  includedDecisions: z.array(z.string().uuid()).nullable().optional(),
  includedRawEvents: z.array(z.string().uuid()).nullable().optional(),
  excludedButRelevant: z.any().nullable().optional(),
  tokenBudget: z.number().int().positive(),
  tokenUsed: z.number().int().nonnegative().nullable().optional(),
  retrievalReason: z.any().nullable().optional(),
  createdAt: z.date(),
});

export const RawEventSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.string(),
  payload: z.any(),
  sourceIds: z.array(z.string().uuid()).nullable().optional(),
  createdBy: z.string(),
  hash: z.string(),
  createdAt: z.date(),
});

export const RunEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.string(),
  payload: z.any().nullable().optional(),
  createdAt: z.date(),
});

export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaVersionId: z.string().uuid().nullable().optional(),
  statement: z.string(),
  status: HypothesisStatus.default('unexamined'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  acceptedEvidenceIds: z.any().nullable().optional(),
  counterEvidenceIds: z.any().nullable().optional(),
  openQuestions: z.any().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// --- Inferred Types ---

export type Project = z.infer<typeof ProjectSchema>;
export type ResearchSession = z.infer<typeof ResearchSessionSchema>;
export type IdeaVersion = z.infer<typeof IdeaVersionSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceAssessment = z.infer<typeof EvidenceAssessmentSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ModelReview = z.infer<typeof ModelReviewSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type CritiqueResponse = z.infer<typeof CritiqueResponseSchema>;
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
export type ContextManifest = z.infer<typeof ContextManifestSchema>;
export type RawEvent = z.infer<typeof RawEventSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
