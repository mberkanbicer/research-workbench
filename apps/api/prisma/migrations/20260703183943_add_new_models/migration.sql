-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ResearchProject" ADD COLUMN     "staleThresholdDays" INTEGER NOT NULL DEFAULT 180;

-- CreateTable
CREATE TABLE "LiteratureReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "researchQuestion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "searchStrategy" JSONB,
    "prismaFlow" JSONB,
    "findings" JSONB,
    "gaps" JSONB,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiteratureReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimDependency" (
    "id" TEXT NOT NULL,
    "fromClaimId" TEXT NOT NULL,
    "toClaimId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'depends_on',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimConfidenceHistory" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "round" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimConfidenceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriteria" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scale" TEXT NOT NULL DEFAULT 'low/medium/high',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceCustomScore" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "score" TEXT NOT NULL,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceCustomScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimDependency_fromClaimId_toClaimId_key" ON "ClaimDependency"("fromClaimId", "toClaimId");

-- CreateIndex
CREATE INDEX "ClaimConfidenceHistory_claimId_idx" ON "ClaimConfidenceHistory"("claimId");

-- CreateIndex
CREATE INDEX "ClaimConfidenceHistory_projectId_idx" ON "ClaimConfidenceHistory"("projectId");

-- CreateIndex
CREATE INDEX "Annotation_entityType_entityId_idx" ON "Annotation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Annotation_projectId_idx" ON "Annotation"("projectId");

-- CreateIndex
CREATE INDEX "EvaluationCriteria_projectId_idx" ON "EvaluationCriteria"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCriteria_projectId_name_key" ON "EvaluationCriteria"("projectId", "name");

-- CreateIndex
CREATE INDEX "EvidenceCustomScore_evidenceId_idx" ON "EvidenceCustomScore"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceCustomScore_evidenceId_criteriaId_key" ON "EvidenceCustomScore"("evidenceId", "criteriaId");

-- AddForeignKey
ALTER TABLE "LiteratureReview" ADD CONSTRAINT "LiteratureReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimDependency" ADD CONSTRAINT "ClaimDependency_fromClaimId_fkey" FOREIGN KEY ("fromClaimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimDependency" ADD CONSTRAINT "ClaimDependency_toClaimId_fkey" FOREIGN KEY ("toClaimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceCustomScore" ADD CONSTRAINT "EvidenceCustomScore_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceCustomScore" ADD CONSTRAINT "EvidenceCustomScore_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "EvaluationCriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
