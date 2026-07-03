import { z } from 'zod';
import {
  ClaimType,
  Criticality,
  Reliability,
  Relevance,
  InterpretationVerdict,
  FinalVerdict,
  IdeaVersionStatus
} from '@repo/shared';

/**
 * Schema for a single claim as produced by the model.
 * Validates that each claim has the required fields.
 */
const ClaimInputSchema = z.object({
  text: z.string().min(1, 'Claim text must not be empty'),
  type: ClaimType.default('technical'),
  requiresEvidence: z.boolean().default(true),
  criticality: Criticality.default('medium'),
  reason: z.string().min(1, 'Reason must not be empty').optional().default('No reason provided'),
});

export type ClaimInput = z.infer<typeof ClaimInputSchema>;

/**
 * Schema for a single hypothesis as produced by the model.
 */
const HypothesisInputSchema = z.object({
  statement: z.string().min(1, 'Hypothesis statement must not be empty'),
  whyItMatters: z.string().optional().default(''),
  requiredEvidenceType: z.string().optional().default('any'),
});

/**
 * Schema for claim extraction output.
 * Validates structure while handling common model errors:
 * - claims as single object instead of array
 * - missing hypotheses/openQuestions
 * - claims with missing required fields (provides defaults)
 */
export const ClaimExtractionOutputSchema = z.object({
  claims: z.any().transform(val => {
    // Handle case where model returns a single object instead of array
    let rawClaims: unknown[];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      rawClaims = [val];
    } else if (Array.isArray(val)) {
      rawClaims = val;
    } else {
      return [];
    }
    // Validate and clean each claim
    const validClaims: ClaimInput[] = [];
    for (const raw of rawClaims) {
      const result = ClaimInputSchema.safeParse(raw);
      if (result.success) {
        validClaims.push(result.data);
      } else {
        // Log invalid claim but don't fail the whole extraction
        // Try to salvage partial claims
        if (raw && typeof raw === 'object') {
          const partial = raw as Record<string, unknown>;
          validClaims.push({
            text: typeof partial.text === 'string' && partial.text.length > 0 ? partial.text : 'Invalid claim - no text',
            type: ClaimType.safeParse(partial.type).success ? ClaimType.parse(partial.type) : 'technical',
            requiresEvidence: typeof partial.requiresEvidence === 'boolean' ? partial.requiresEvidence : true,
            criticality: Criticality.safeParse(partial.criticality).success ? Criticality.parse(partial.criticality) : 'medium',
            reason: typeof partial.reason === 'string' && partial.reason.length > 0 ? partial.reason : 'Salvaged from malformed claim',
          });
        }
      }
    }
    return validClaims;
  }),
  hypotheses: z.any().transform(val => {
    if (!Array.isArray(val)) return [];
    return val.filter((h): h is z.infer<typeof HypothesisInputSchema> => {
      const result = HypothesisInputSchema.safeParse(h);
      return result.success;
    });
  }),
  openQuestions: z.any().transform(val => {
    if (!Array.isArray(val)) return [];
    return val.filter((q): q is string => typeof q === 'string' && q.length > 0);
  })
});

export type ClaimExtractionOutput = {
  claims: ClaimInput[];
  hypotheses: z.infer<typeof HypothesisInputSchema>[];
  openQuestions: string[];
};

export const EvidenceAssessmentOutputSchema = z.object({
  reliability: Reliability.exclude(['pending']),
  relevance: Relevance.exclude(['pending']),
  interpretationVerdict: InterpretationVerdict,
  detectedProblems: z.array(z.string()),
  notes: z.string(),
  finalVerdict: FinalVerdict
});

export const IndependentReviewOutputSchema = z.object({
  needsMoreContext: z.boolean(),
  requestedItems: z.array(z.object({
    type: z.enum(['evidence', 'decision', 'critique', 'raw_event', 'claim']),
    idOrQuery: z.string(),
    reason: z.string()
  })),
  verdict: z.enum(['accept', 'accept_with_reservations', 'reject', 'abstain', 'needs_more_evidence']),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  supportedClaims: z.array(z.object({
    claimId: z.string(),
    evidenceIds: z.array(z.string()),
    reason: z.string()
  })),
  unsupportedClaims: z.array(z.object({
    claimId: z.string(),
    reason: z.string(),
    neededEvidence: z.string()
  })),
  suggestedRevisions: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const CrossCritiqueOutputSchema = z.object({
  critiques: z.array(z.object({
    targetType: z.enum(['idea', 'claim', 'evidence', 'model_review', 'reasoning', 'revision', 'decision']),
    targetId: z.string(),
    critiqueType: z.enum(['contradiction', 'missing_assumption', 'weak_evidence', 'bad_source', 'misinterpreted_evidence', 'scope_error', 'implementation_risk', 'cost_risk', 'better_alternative', 'unsupported_generalization']),
    severity: Criticality,
    text: z.string(),
    whyItMatters: z.string(),
    proposedFix: z.string().optional(),
    evidenceIds: z.array(z.string())
  }))
});

export const CritiqueResponseOutputSchema = z.object({
  verdict: z.enum(['accept', 'partial_accept', 'reject', 'needs_more_evidence']),
  reason: z.string(),
  positionChange: z.enum(['none', 'minor', 'major']),
  revisedClaim: z.string().optional(),
  requestedEvidence: z.array(z.string())
});

export const IdeaRevisionOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  changesFromPrevious: z.array(z.string()),
  resolvedCritiqueIds: z.array(z.string()),
  remainingRisks: z.array(z.string()),
  newClaims: z.array(z.string()),
  removedClaims: z.array(z.string()),
  revisionRationale: z.string()
});

export const ConsensusVoteOutputSchema = z.object({
  vote: z.enum(['accept', 'accept_with_reservations', 'reject', 'abstain', 'needs_more_evidence']),
  reason: z.string(),
  reservations: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const DecisionRecordOutputSchema = z.object({
  decisionStatus: z.enum(['full_consensus', 'qualified_consensus', 'no_consensus', 'insufficient_evidence', 'needs_external_validation']),
  decisionText: z.string(),
  whyGood: z.array(z.string()),
  whyBad: z.array(z.string()),
  knownWeaknesses: z.array(z.string()),
  acceptedEvidenceIds: z.array(z.string()),
  counterEvidenceIds: z.array(z.string()),
  resolvedCritiqueIds: z.array(z.string()),
  unresolvedRisks: z.array(z.string()),
  modelFinalVotes: z.array(z.any()),
  reopenConditions: z.array(z.string()),
  nextActions: z.array(z.string())
});

export const GoalAchievementOutputSchema = z.object({
  goalAchieved: z.boolean(),
  achievementLevel: z.enum(['fully', 'mostly', 'partially', 'barely', 'not_at_all']),
  addressedAspects: z.array(z.string()),
  missingAspects: z.array(z.string()),
  evidenceOfAchievement: z.array(z.string()),
  remainingGaps: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const AdversarialProbeOutputSchema = z.object({
  probes: z.array(z.object({
    claimId: z.string(),
    adversarialHypothesis: z.string().min(1),
    searchQueries: z.array(z.string()).min(1),
    reasoning: z.string(),
  }))
});

export const LiteratureReviewOutputSchema = z.object({
  title: z.string(),
  researchQuestion: z.string(),
  searchStrategy: z.object({
    databases: z.array(z.string()),
    searchTerms: z.array(z.string()),
    inclusionCriteria: z.array(z.string()),
    exclusionCriteria: z.array(z.string()),
  }),
  prismaFlow: z.object({
    identified: z.number(),
    screened: z.number(),
    excludedAfterScreening: z.number(),
    assessedFullText: z.number(),
    excludedAfterFullText: z.number(),
    exclusionReasons: z.array(z.string()),
    included: z.number(),
  }),
  findings: z.array(z.object({
    theme: z.string(),
    summary: z.string(),
    sources: z.array(z.string()),
    consensus: z.enum(['strong', 'moderate', 'weak', 'conflicting']),
  })),
  gaps: z.array(z.object({
    description: z.string(),
    importance: z.enum(['critical', 'high', 'medium', 'low']),
    suggestedSearch: z.string(),
  })),
  conclusion: z.string(),
  strengthOfEvidence: z.enum(['strong', 'moderate', 'weak', 'insufficient']),
});

export const EvidenceGapOutputSchema = z.object({
  gaps: z.array(z.object({
    claimId: z.string(),
    claimText: z.string(),
    gapType: z.enum(['no_evidence', 'weak_evidence', 'contradictory_evidence', 'outdated_evidence']),
    description: z.string(),
    suggestedSearchQueries: z.array(z.string()),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
  })),
  overallEvidenceStrength: z.enum(['strong', 'adequate', 'weak', 'insufficient']),
  recommendation: z.enum(['proceed', 'gather_more', 'revise_claims', 'abort']),
});

export const ArgumentMapOutputSchema = z.object({
  claim: z.object({
    text: z.string(),
    qualifier: z.enum(['certain', 'probable', 'possible', 'presumably', 'supposedly']),
  }),
  grounds: z.array(z.object({
    type: z.enum(['evidence', 'expert_opinion', 'analogy', 'principle']),
    text: z.string(),
    source: z.string().optional(),
  })),
  warrant: z.object({
    text: z.string(),
    backing: z.array(z.string()).optional(),
  }),
  rebuttal: z.object({
    text: z.string(),
    conditions: z.array(z.string()).optional(),
  }).optional(),
  qualifier: z.string(),
});

/**
 * Meta-prompt output: a model-generated improved version of a prompt.
 */
export const MetaPromptOutputSchema = z.object({
  improvedPrompt: z.string().min(1, 'Improved prompt must not be empty'),
  changeRationale: z.string().optional(),
});

export type MetaPromptOutput = z.infer<typeof MetaPromptOutputSchema>;
