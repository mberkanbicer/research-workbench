import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  maxTokens: number;
  costPer1kTokens: number;
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface EmbeddingCluster {
  id: string;
  centroid: number[];
  members: string[];
  label: string;
}

// ─── Advanced Embedding Service ────────────────────────────────────────────

export class EmbeddingAdvancedService {
  private providers: Map<string, EmbeddingProvider> = new Map([
    ['openai', { name: 'text-embedding-3-small', dimensions: 1536, maxTokens: 8191, costPer1kTokens: 0.00002 }],
    ['openai-large', { name: 'text-embedding-3-large', dimensions: 3072, maxTokens: 8191, costPer1kTokens: 0.00013 }],
    ['cohere', { name: 'embed-english-v3.0', dimensions: 1024, maxTokens: 512, costPer1kTokens: 0.0001 }],
    ['voyage', { name: 'voyage-2', dimensions: 1024, maxTokens: 32000, costPer1kTokens: 0.0001 }],
  ]);

  /**
   * Get available embedding providers
   */
  getProviders(): EmbeddingProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Generate embeddings with batch processing
   */
  async generateBatchEmbeddings(
    texts: string[],
    provider: string = 'openai'
  ): Promise<number[][]> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`Unknown embedding provider: ${provider}`);
    }

    // Process in batches to avoid rate limits
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await this.generateEmbeddings(batch, provider);
      embeddings.push(...batchEmbeddings);

      // Rate limiting delay
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  }

  /**
   * Generate embeddings for a list of texts
   */
  private async generateEmbeddings(texts: string[], provider: string): Promise<number[][]> {
    // In production, this would call the actual embedding API
    // For now, return mock embeddings
    return texts.map(() => {
      const embedding: number[] = [];
      for (let i = 0; i < 1536; i++) {
        embedding.push(Math.random());
      }
      return embedding;
    });
  }

  /**
   * Perform semantic search with advanced ranking
   */
  async semanticSearch(
    query: string,
    projectId: string,
    options: {
      limit?: number;
      threshold?: number;
      boostRecent?: boolean;
      includeMetadata?: boolean;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 10, threshold = 0.7, boostRecent = true, includeMetadata = true } = options;

    // In production, this would:
    // 1. Generate query embedding
    // 2. Search vector database
    // 3. Apply boosting and filtering
    // 4. Return ranked results

    // Mock implementation
    const results: SemanticSearchResult[] = [];

    // Search claims
    const claims = await prisma.claim.findMany({
      where: { projectId },
      take: limit,
    });

    for (const claim of claims) {
      results.push({
        id: claim.id,
        content: claim.text,
        score: Math.random() * 0.3 + 0.7, // Mock score
        metadata: {
          type: 'claim',
          status: claim.status,
          confidence: claim.confidence,
        },
      });
    }

    // Search evidence
    const evidence = await prisma.evidence.findMany({
      where: { projectId },
      take: limit,
    });

    for (const item of evidence) {
      results.push({
        id: item.id,
        content: item.title + ' ' + (item.excerpt || item.summary || ''),
        score: Math.random() * 0.3 + 0.7,
        metadata: {
          type: 'evidence',
          source: item.sourceUrl,
          status: item.status,
        },
      });
    }

    // Sort by score and apply threshold
    return results
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Cluster embeddings for topic discovery
   */
  async clusterEmbeddings(
    embeddings: number[][],
    metadata: Record<string, unknown>[],
    numClusters: number = 5
  ): Promise<EmbeddingCluster[]> {
    // Simple k-means clustering implementation
    const clusters: EmbeddingCluster[] = [];

    // Initialize centroids randomly
    const centroids: number[][] = [];
    for (let i = 0; i < numClusters; i++) {
      centroids.push(embeddings[Math.floor(Math.random() * embeddings.length)]);
    }

    // Iterate to refine clusters
    for (let iteration = 0; iteration < 10; iteration++) {
      const assignments: number[] = embeddings.map((embedding, idx) => {
        let minDist = Infinity;
        let bestCluster = 0;

        centroids.forEach((centroid, clusterIdx) => {
          const dist = this.cosineDistance(embedding, centroid);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = clusterIdx;
          }
        });

        return bestCluster;
      });

      // Update centroids
      for (let c = 0; c < numClusters; c++) {
        const members = embeddings.filter((_, idx) => assignments[idx] === c);
        if (members.length > 0) {
          centroids[c] = this.averageEmbeddings(members);
        }
      }
    }

    // Build cluster results
    const finalAssignments = embeddings.map((embedding, idx) => {
      let minDist = Infinity;
      let bestCluster = 0;

      centroids.forEach((centroid, clusterIdx) => {
        const dist = this.cosineDistance(embedding, centroid);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = clusterIdx;
        }
      });

      return bestCluster;
    });

    for (let c = 0; c < numClusters; c++) {
      const memberIndices = finalAssignments
        .map((assignment, idx) => assignment === c ? idx : -1)
        .filter(idx => idx !== -1);

      clusters.push({
        id: `cluster-${c}`,
        centroid: centroids[c],
        members: memberIndices.map(idx => metadata[idx]?.id as string || `item-${idx}`),
        label: `Topic ${c + 1}`,
      });
    }

    return clusters;
  }

  /**
   * Calculate cosine distance between two embeddings
   */
  private cosineDistance(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return 1 - dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Average multiple embeddings
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    const dimensions = embeddings[0].length;
    const average = new Array(dimensions).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        average[i] += embedding[i];
      }
    }

    return average.map(v => v / embeddings.length);
  }
}

export const embeddingAdvancedService = new EmbeddingAdvancedService();
