/**
 * EmbeddingService — generates and stores text embeddings for semantic search.
 *
 * Providers: mock (deterministic hash) or openai (text-embedding-3-small).
 * Storage: JSON cosine (default) or pgvector when PGVECTOR_ENABLED=true.
 */

import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';
const EMBEDDING_DIMENSION = 768;

export type SemanticSearchResult = {
  objectType: string;
  objectId: string;
  text: string;
  score: number;
};

export class EmbeddingService {
  private pgVectorReady: boolean | null = null;

  isEnabled(): boolean {
    return process.env.EMBEDDING_ENABLED === 'true';
  }

  /**
   * Generate embedding for text using configured provider.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const provider = (process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
    if (provider === 'openai') {
      return this.generateOpenAIEmbedding(text);
    }
    return this.generateMockEmbedding(text);
  }

  /**
   * Store embedding for an entity.
   */
  async storeEmbedding(
    projectId: string,
    objectType: string,
    objectId: string,
    text: string,
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(text);
      const recordId = `${projectId}:${objectType}:${objectId}`;

      if (process.env.PGVECTOR_ENABLED === 'true' && await this.canUsePgVector()) {
        const vectorLiteral = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          INSERT INTO "SourceEmbedding" (id, "projectId", "objectType", "objectId", text, embedding, "createdAt")
          VALUES (
            ${recordId},
            ${projectId},
            ${objectType},
            ${objectId},
            ${text},
            ${vectorLiteral}::vector,
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            embedding = EXCLUDED.embedding
        `;
        return;
      }

      await prisma.sourceEmbedding.upsert({
        where: { id: recordId },
        create: {
          id: recordId,
          projectId,
          objectType,
          objectId,
          text,
          embedding: JSON.stringify(embedding),
        },
        update: {
          text,
          embedding: JSON.stringify(embedding),
        },
      });
    } catch (err) {
      logger.warn('Failed to store embedding', { objectType, objectId, error: (err as Error).message });
    }
  }

  /**
   * Find the most semantically similar entities by cosine similarity.
   */
  async semanticSearch(
    projectId: string,
    objectTypes: string[],
    queryText: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(queryText);

    if (process.env.PGVECTOR_ENABLED === 'true' && await this.canUsePgVector()) {
      const pgResults = await this.pgVectorSearch(projectId, objectTypes, queryEmbedding, limit);
      if (pgResults.length > 0) return pgResults;
    }

    const embeddings = await prisma.sourceEmbedding.findMany({
      where: {
        projectId,
        objectType: { in: objectTypes },
      },
    });

    const scored = embeddings.map((e) => {
      const stored = e.embedding ? (JSON.parse(e.embedding) as number[]) : [];
      const score = stored.length > 0 ? this.cosineSimilarity(queryEmbedding, stored) : 0;
      return { objectType: e.objectType, objectId: e.objectId, text: e.text, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Search across all projects (excluding a specific project).
   */
  async crossProjectSearch(
    objectTypes: string[],
    queryText: string,
    excludeProjectId: string,
    limit = 10,
  ): Promise<(SemanticSearchResult & { projectId: string })[]> {
    const queryEmbedding = await this.generateEmbedding(queryText);

    const embeddings = await prisma.sourceEmbedding.findMany({
      where: {
        projectId: { not: excludeProjectId },
        objectType: { in: objectTypes },
      },
    });

    const scored = embeddings.map((e) => {
      const stored = e.embedding ? (JSON.parse(e.embedding) as number[]) : [];
      const score = stored.length > 0 ? this.cosineSimilarity(queryEmbedding, stored) : 0;
      return { objectType: e.objectType, objectId: e.objectId, text: e.text, score, projectId: e.projectId };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Hybrid search: combine keyword match with semantic similarity.
   */
  async hybridSearch(
    projectId: string,
    objectTypes: string[],
    queryText: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    const semanticResults = await this.semanticSearch(projectId, objectTypes, queryText, limit * 2);

    const lowerQuery = queryText.toLowerCase();
    const boosted = semanticResults.map((r) => ({
      ...r,
      score: r.score + (r.text.toLowerCase().includes(lowerQuery) ? 0.3 : 0),
    }));

    boosted.sort((a, b) => b.score - a.score);
    return boosted.slice(0, limit);
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY;
    if (!apiKey) {
      logger.warn('OPENAI_API_KEY not set — falling back to mock embeddings');
      return this.generateMockEmbedding(text);
    }

    const baseUrl = (process.env.OPENAI_EMBEDDING_BASE_URL
      || process.env.OPENAI_COMPATIBLE_BASE_URL
      || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSION,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn('OpenAI embedding request failed', { status: response.status, body: body.slice(0, 200) });
      return this.generateMockEmbedding(text);
    }

    const json = await response.json() as { data?: { embedding: number[] }[] };
    const embedding = json.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      return this.generateMockEmbedding(text);
    }
    return embedding;
  }

  private generateMockEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const seed = hash % 10000;
    const embedding: number[] = [];
    let x = seed;
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      x = (x * 1664525 + 1013904223) & 0xffffffff;
      embedding.push((x % 2000 - 1000) / 1000);
    }
    return embedding;
  }

  private async canUsePgVector(): Promise<boolean> {
    if (this.pgVectorReady !== null) return this.pgVectorReady;
    try {
      const rows = await prisma.$queryRaw<{ ok: number }[]>`
        SELECT 1 AS ok
        FROM pg_extension
        WHERE extname = 'vector'
        LIMIT 1
      `;
      if (rows.length === 0) {
        this.pgVectorReady = false;
        return false;
      }
      const col = await prisma.$queryRaw<{ udt_name: string }[]>`
        SELECT udt_name
        FROM information_schema.columns
        WHERE table_name = 'SourceEmbedding'
          AND column_name = 'embedding'
        LIMIT 1
      `;
      this.pgVectorReady = col[0]?.udt_name === 'vector';
      return this.pgVectorReady;
    } catch {
      this.pgVectorReady = false;
      return false;
    }
  }

  private async pgVectorSearch(
    projectId: string,
    objectTypes: string[],
    queryEmbedding: number[],
    limit: number,
  ): Promise<SemanticSearchResult[]> {
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    try {
      const rows = await prisma.$queryRaw<
        { objectType: string; objectId: string; text: string; score: number }[]
      >`
        SELECT
          "objectType" AS "objectType",
          "objectId"::text AS "objectId",
          text,
          (1 - (embedding <=> ${vectorLiteral}::vector))::float8 AS score
        FROM "SourceEmbedding"
        WHERE "projectId" = ${projectId}
          AND "objectType" = ANY(${objectTypes}::text[])
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `;
      return rows;
    } catch (err) {
      logger.warn('pgvector search failed — falling back to JSON cosine', { error: (err as Error).message });
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private simpleHash(text: string): number {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}

export const embeddingService = new EmbeddingService();