-- Required for semantic memory / embedding search.
-- The Docker image pgvector/pgvector:pg16 already includes the extension binaries.
CREATE EXTENSION IF NOT EXISTS vector;

-- Optional sanity check:
-- SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
