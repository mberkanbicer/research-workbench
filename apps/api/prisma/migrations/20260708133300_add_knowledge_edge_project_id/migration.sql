-- AlterTable: add projectId column to KnowledgeEdge for direct project-scoped queries
-- and cascade delete support.

-- Step 1: Add column as nullable
ALTER TABLE "KnowledgeEdge" ADD COLUMN "projectId" TEXT;

-- Step 2: Backfill with empty string (dev-only — production would use a proper migration)
UPDATE "KnowledgeEdge" SET "projectId" = '';

-- Step 3: Make column NOT NULL and add index
ALTER TABLE "KnowledgeEdge" ALTER COLUMN "projectId" SET NOT NULL;
CREATE INDEX "KnowledgeEdge_projectId_idx" ON "KnowledgeEdge"("projectId");

-- Step 4: Add the unique constraint that matches the current Prisma schema
-- (fromType, fromId, toType, toId, relation) — must be unique
CREATE UNIQUE INDEX "KnowledgeEdge_fromType_fromId_toType_toId_relation_key" ON "KnowledgeEdge"("fromType", "fromId", "toType", "toId", "relation");
