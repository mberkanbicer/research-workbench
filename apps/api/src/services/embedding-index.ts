import { embeddingService } from './embedding.service.js';

/** Fire-and-forget embedding index when EMBEDDING_ENABLED=true. */
export function indexClaimEmbedding(projectId: string, claimId: string, text: string): void {
  if (process.env.EMBEDDING_ENABLED !== 'true') return;
  void embeddingService.storeEmbedding(projectId, 'claim', claimId, text);
}

/** Fire-and-forget embedding index when EMBEDDING_ENABLED=true. */
export function indexEvidenceEmbedding(
  projectId: string,
  evidenceId: string,
  title: string,
  excerpt?: string | null,
  summary?: string | null,
): void {
  if (process.env.EMBEDDING_ENABLED !== 'true') return;
  const text = [title, excerpt, summary].filter(Boolean).join('\n');
  void embeddingService.storeEmbedding(projectId, 'evidence', evidenceId, text);
}

/** Fire-and-forget embedding index for critiques when EMBEDDING_ENABLED=true. */
export function indexCritiqueEmbedding(projectId: string, critiqueId: string, text: string): void {
  if (process.env.EMBEDDING_ENABLED !== 'true') return;
  void embeddingService.storeEmbedding(projectId, 'critique', critiqueId, text);
}

/** Fire-and-forget embedding index for model reviews when EMBEDDING_ENABLED=true. */
export function indexReviewEmbedding(projectId: string, reviewId: string, text: string): void {
  if (process.env.EMBEDDING_ENABLED !== 'true') return;
  void embeddingService.storeEmbedding(projectId, 'review', reviewId, text);
}

/** Fire-and-forget embedding index for decisions when EMBEDDING_ENABLED=true. */
export function indexDecisionEmbedding(projectId: string, decisionId: string, text: string): void {
  if (process.env.EMBEDDING_ENABLED !== 'true') return;
  void embeddingService.storeEmbedding(projectId, 'decision', decisionId, text);
}