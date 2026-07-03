-- Converts SourceEmbedding.embedding from JSON text to pgvector(768).
-- Safe to re-run: skips if column is already vector type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SourceEmbedding'
      AND column_name = 'embedding'
      AND udt_name <> 'vector'
  ) THEN
    ALTER TABLE "SourceEmbedding"
      ALTER COLUMN embedding TYPE vector(768)
      USING CASE
        WHEN embedding IS NULL OR embedding = '' THEN NULL
        WHEN embedding ~ '^\[' THEN embedding::vector
        ELSE NULL
      END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS source_embedding_vector_idx
  ON "SourceEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);