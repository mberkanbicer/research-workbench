import { ModelProviderAdapter, ModelCallParams, ModelResponse } from '../types.js';

/**
 * Parse UUIDs from text. Extracts all UUIDs to enable context-aware IDs.
 */
/**
 * Deterministic hash of text to produce varied mock outputs.
 * Returns a number 0-99 based on the input text.
 */
function deterministicHash(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

function extractUuids(text: string): string[] {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  return [...new Set(text.match(uuidRegex) || [])];
}

/**
 * Given a prompt text and a set of known context labels, find the first UUID
 * that appears after a label marker (e.g. "- Review IDs:" line).
 */
function getFirstIdAfterLabel(text: string, labels: string[], fallback: string): string {
  const uuids = extractUuids(text);
  // Try to find a UUID near one of the labels
  for (const label of labels) {
    const idx = text.toLowerCase().indexOf(label.toLowerCase());
    if (idx !== -1) {
      const snippet = text.slice(idx, idx + 300);
      const nearby = extractUuids(snippet);
      if (nearby.length > 0) return nearby[0];
    }
  }
  // Fallback: return first available UUID from any position
  if (uuids.length > 0) return uuids[0];
  return fallback;
}

/**
 * Extract review IDs from "Model reviews:" section of the prompt.
 * Returns the first review UUID found after the model reviews header.
 */
function extractReviewIds(text: string): string[] {
  const idx = text.toLowerCase().indexOf('"model reviews"');
  if (idx === -1) {
    const altIdx = text.toLowerCase().indexOf('model reviews:');
    if (altIdx === -1) return [];
    return extractUuids(text.slice(altIdx, altIdx + 500));
  }
  return extractUuids(text.slice(idx, idx + 500));
}

/**
 * Extract the first claim ID from the prompt.
 */
function extractFirstClaimId(text: string): string {
  const uuids = extractUuids(text);
  if (uuids.length > 0) return uuids[0];
  return '00000000-0000-0000-0000-000000000000';
}

export class MockModelAdapter implements ModelProviderAdapter {
  async call(params: ModelCallParams): Promise<ModelResponse> {
    const lastMessage = params.messages[params.messages.length - 1].content.toLowerCase();

    let content = '{}';

    if (lastMessage.includes('prompt improvement') || lastMessage.includes('improved prompt')) {
      content = JSON.stringify({
        improvedPrompt: `You are a research agent. Return valid JSON only.\n\n${lastMessage.slice(0, 100)}... [auto-improved prompt]`,
        changeRationale: 'Auto-improved by mock meta-prompt adapter',
      });
    } else if (lastMessage.includes('claim_extraction')) {
      content = JSON.stringify({
        claims: [
          { text: 'The system can improve idea development quality.', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'Core value proposition' },
          { text: 'Multi-model critique can reveal weaknesses missed by one model.', type: 'research', requiresEvidence: true, criticality: 'high', reason: 'Key differentiator' },
          { text: 'Evidence auditing can reduce unsupported claims.', type: 'research', requiresEvidence: true, criticality: 'medium', reason: 'Quality control mechanism' },
          { text: 'Long-horizon memory can preserve research context.', type: 'technical', requiresEvidence: true, criticality: 'medium', reason: 'Architectural assumption' },
          { text: 'Local-first architecture can reduce cost and increase user control.', type: 'business', requiresEvidence: true, criticality: 'medium', reason: 'Architectural decision' },
        ],
        hypotheses: [
          { statement: 'Multiple models produce better research outcomes than single models', whyItMatters: 'Validates the multi-model approach', requiredEvidenceType: 'academic' },
          { statement: 'Evidence auditing catches errors that individual models miss', whyItMatters: 'Validates the audit mechanism', requiredEvidenceType: 'academic' },
        ],
        openQuestions: ['How to handle model disagreement on evidence interpretation?', 'What is the optimal number of models for deliberation?', 'Can local models match cloud models for research quality?']
      });
    } else if (lastMessage.includes('independent_review')) {
      // Extract a real claim ID from context for supported/unsupported claims
      const claimId = getFirstIdAfterLabel(lastMessage, ['claim ids:', '- claim'], extractFirstClaimId(lastMessage));
      content = JSON.stringify({
        needsMoreContext: false,
        requestedItems: [],
        verdict: 'accept_with_reservations',
        strengths: ['The approach addresses a real need for collaborative research'],
        weaknesses: ['Implementation complexity may be higher than estimated'],
        blockingIssues: [],
        supportedClaims: [{ claimId, evidenceIds: [], reason: 'Evidence supports this claim' }],
        unsupportedClaims: [],
        suggestedRevisions: ['Consider adding more specific evidence'],
        confidence: 0.7
      });
    } else if (lastMessage.includes('evidence_assessment')) {
      // Deterministically produce varied verdicts so counter-evidence exists
      const hash = deterministicHash(lastMessage);
      const finalVerdict = hash < 30 ? 'reject' : hash < 50 ? 'accept_with_caution' : 'accept';
      content = JSON.stringify({
        reliability: hash < 20 ? 'low' : hash < 40 ? 'medium' : 'high',
        relevance: hash < 15 ? 'indirect' : hash < 30 ? 'weak' : 'direct',
        interpretationVerdict: finalVerdict === 'reject' ? 'misinterpreted' : 'correctly_used',
        detectedProblems: finalVerdict === 'reject' ? ['Source quality insufficient to support claim'] : [],
        notes: 'Assessment based on available evidence',
        finalVerdict
      });
    } else if (lastMessage.includes('cross_critique')) {
      // Parse real IDs from the prompt
      const reviewIds = extractReviewIds(lastMessage);
      const claimId = getFirstIdAfterLabel(lastMessage, ['claim ids:', '- claim'], extractFirstClaimId(lastMessage));
      const ideaVersionId = getFirstIdAfterLabel(lastMessage, ['idea version id:'], '00000000-0000-0000-0000-000000000000');

      // Use the first real review ID if available, otherwise fall back to claim/idea
      const targetId = reviewIds.length > 0 ? reviewIds[0] : claimId;
      const targetType = reviewIds.length > 0 ? 'model_review' : 'claim';

      content = JSON.stringify({
        critiques: [{
          targetType,
          targetId,
          critiqueType: 'missing_assumption',
          severity: 'medium',
          text: 'The reasoning assumes local-first is always cheaper without evidence',
          whyItMatters: 'Cost assumptions affect feasibility',
          proposedFix: 'Add benchmark data comparing local vs cloud costs',
          evidenceIds: []
        }]
      });
    } else if (lastMessage.includes('critique_response')) {
      content = JSON.stringify({
        verdict: 'partial_accept',
        reason: 'Acknowledging the critique has merit',
        positionChange: 'minor',
        revisedClaim: 'Local-first architecture reduces cost for most use cases',
        requestedEvidence: []
      });
    } else if (lastMessage.includes('idea_revision')) {
      content = JSON.stringify({
        title: 'Revised Research Idea',
        description: 'Updated description based on critique feedback',
        changesFromPrevious: ['Added cost comparison evidence'],
        resolvedCritiqueIds: [],
        remainingRisks: [],
        newClaims: [],
        removedClaims: [],
        revisionRationale: 'Addressed cost assumption critique'
      });
    } else if (lastMessage.includes('consensus_vote')) {
      content = JSON.stringify({
        vote: 'accept_with_reservations',
        reason: 'The approach is sound but needs more evidence',
        reservations: ['Cost assumptions need validation'],
        blockingIssues: [],
        requiredChanges: ['Add cost comparison data'],
        confidence: 0.6
      });
    } else if (lastMessage.includes('decision_record')) {
      content = JSON.stringify({
        decisionStatus: 'qualified_consensus',
        decisionText: 'The research approach is viable with reservations',
        whyGood: ['Addresses a real research need', 'Multi-model approach adds robustness'],
        whyBad: ['Cost assumptions unvalidated', 'Implementation complexity unknown'],
        knownWeaknesses: [],
        acceptedEvidenceIds: [],
        counterEvidenceIds: [],
        resolvedCritiqueIds: [],
        unresolvedRisks: [],
        modelFinalVotes: [],
        reopenConditions: [],
        nextActions: []
      });
    } else if (lastMessage.includes('evidence_gap_analysis') || lastMessage.includes('evidence_gap')) {
      const claimId = getFirstIdAfterLabel(lastMessage, ['claim ids:', '- claim'], extractFirstClaimId(lastMessage));
      content = JSON.stringify({
        gaps: [{
          claimId,
          claimText: 'Claim requires additional evidence',
          gapType: 'no_evidence',
          description: 'No supporting evidence found',
          suggestedSearchQueries: ['research query 1', 'research query 2'],
          priority: 'medium',
        }],
        overallEvidenceStrength: 'adequate',
        recommendation: 'proceed',
      });
    } else if (lastMessage.includes('adversarial_probe')) {
      const claimId = getFirstIdAfterLabel(lastMessage, ['claim ids:', '- claim'], extractFirstClaimId(lastMessage));
      content = JSON.stringify({
        probes: [{
          claimId,
          adversarialHypothesis: 'The claim assumes conditions that may not hold in practice',
          searchQueries: ['counter-evidence for the claim', 'limitations and failure cases'],
          reasoning: 'Testing whether the claim survives hostile scrutiny',
        }]
      });
    } else if (lastMessage.includes('goal_achievement_evaluation') || lastMessage.includes('goal_evaluation') || lastMessage.includes('goal_achievement')) {
      content = JSON.stringify({
        goalAchieved: true,
        achievementLevel: 'mostly',
        addressedAspects: ['Core research need identified', 'Multi-model approach validated'],
        missingAspects: ['Cost analysis incomplete'],
        evidenceOfAchievement: ['Multiple models agree on approach viability'],
        remainingGaps: ['Need cost benchmarks'],
        confidence: 0.8,
        reason: 'Goal mostly achieved with some gaps',
      });
    } else if (lastMessage.includes('web_search')) {
      content = JSON.stringify({
        results: [{
          title: 'Research findings on multi-model deliberation',
          url: 'https://example.com/research',
          snippet: 'Studies show multi-model approaches improve accuracy',
          sourceType: 'academic'
        }]
      });
    } else if (params.responseFormat === 'json') {
      content = JSON.stringify({ status: 'ok', data: 'default response' });
    } else {
      content = 'Default text response from model';
    }

    return {
      content,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  async *streamCall(params: ModelCallParams): AsyncIterable<ModelResponse> {
    const result = await this.call(params);
    // Yield the full response as a single chunk for mock adapter
    yield result;
  }
}
