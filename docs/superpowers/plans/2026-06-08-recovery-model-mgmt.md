# Recovery & Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable recovery of failed AI orchestration stages and provide full model configuration management.

**Architecture:** Use a `RunStage` state machine in the DB to track and skip completed steps. Add retry endpoints and enhance settings UI.

**Tech Stack:** Prisma, Fastify, BullMQ, Next.js, TanStack Query.

---

### Task 1: Schema Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Update schema**
Add `StageStatus` enum and `RunStage` model to the bottom of the file.

```prisma
enum StageStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

model RunStage {
  id        String      @id @default(uuid())
  runId     String
  stageName String      // extraction, discovery, assessment, review, consensus
  status    StageStatus @default(PENDING)
  error     String?
  attempts  Int         @default(1)
  updatedAt DateTime    @updatedAt

  @@unique([runId, stageName])
}
```

- [ ] **Step 2: Run migration**
Run: `cd apps/api && npx prisma migrate dev --name add_run_stages`
Expected: SUCCESS

- [ ] **Step 3: Commit**
```bash
git add apps/api/prisma/schema.prisma
git commit -m "db: add RunStage model for orchestration recovery"
```

### Task 2: AI Workflow Resilience

**Files:**
- Modify: `apps/api/src/services/ai-workflow.service.ts`

- [ ] **Step 1: Implement Stage Guard Helper**
Add a private method to `AIWorkflowService` to handle stage updates.

```typescript
private async updateStage(runId: string, stageName: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED', error?: string) {
  await prisma.runStage.upsert({
    where: { runId_stageName: { runId, stageName } },
    update: { status, error, updatedAt: new Date() },
    create: { runId, stageName, status, error }
  });
}
```

- [ ] **Step 2: Wrap performExtraction with stage tracking**
Update `performExtraction` to set `IN_PROGRESS` at start and `COMPLETED` at end. Wrap in try/catch to set `FAILED`.

- [ ] **Step 3: Repeat for other phases**
Apply same logic to `performEvidenceDiscovery`, `performEvidenceAssessment`, `performReviews`, and `performConsensus`.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/services/ai-workflow.service.ts
git commit -m "feat: add stage status tracking to AIWorkflowService"
```

### Task 3: Orchestrator Stage Skipping

**Files:**
- Modify: `apps/api/src/orchestrator/orchestrator.ts`

- [ ] **Step 1: Add skipping logic**
In `runProjectCycle`, check DB status before each method call.

```typescript
const extractionStage = await prisma.runStage.findUnique({ where: { runId_stageName: { runId, stageName: 'extraction' } } });
if (extractionStage?.status !== 'COMPLETED') {
  claims = await this.aiWorkflow.performExtraction(runId, projectId, latestVersion.id);
} else {
  claims = await prisma.claim.findMany({ where: { ideaVersionId: latestVersion.id } });
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/api/src/orchestrator/orchestrator.ts
git commit -m "feat: implement stage skipping in orchestrator"
```

### Task 4: Retry API Endpoint

**Files:**
- Modify: `apps/api/src/routes/runs.ts`

- [ ] **Step 1: Add retry route**
Implement `POST /runs/:runId/retry` to reset failed stage and re-trigger BullMQ.

- [ ] **Step 2: Commit**
```bash
git add apps/api/src/routes/runs.ts
git commit -m "api: add retry endpoint for failed runs"
```

### Task 5: Dashboard Retry UI

**Files:**
- Modify: `apps/web/src/app/projects/[projectId]/page.tsx`

- [ ] **Step 1: Add retry button**
Detect `phase.*.failed` events and show a button calling the retry API.

- [ ] **Step 2: Commit**
```bash
git add apps/web/src/app/projects/[projectId]/page.tsx
git commit -m "ui: add retry button to dashboard"
```
