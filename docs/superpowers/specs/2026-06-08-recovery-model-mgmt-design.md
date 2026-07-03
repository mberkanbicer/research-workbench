---
title: Research Workbench Production Readiness & Recovery Design
date: 2026-06-08
status: approved
---

# Design Spec: Stage-Based Recovery & Model Management

## 1. Goal
Transition from mock-only prototypes to a production-ready system with resilient AI orchestration and full model control.

## 2. Architecture: Stage-Based Recovery (Approach A)
Implement a state machine to track research run progress at the stage level.

### 2.1 Schema Additions
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

### 2.2 Orchestrator Logic
- `DeliberationOrchestrator` checks `RunStage` before executing a phase.
- If `status === COMPLETED`, skip.
- If executing, update to `IN_PROGRESS`.
- If error, update to `FAILED` and record `RunEvent`.

### 2.3 Recovery API
`POST /runs/:runId/retry`:
- Resets the `FAILED` stage to `PENDING`.
- Re-enqueues the BullMQ job with the existing `runId`.

## 3. Model Management Enhancements
Improve the existing settings UI to support the full lifecycle of model configurations.

- **Status Toggle**: Add `isEnabled` boolean to `ModelConfig` UI list.
- **Edit Support**: Modal to modify `contextWindow`, `baseUrl`, and `apiKeyRef`.
- **Validation**: Real "Test" call implementation in `modelRoutes.ts` using the configured adapter.

## 4. UI/UX Improvements
- **SSE Resilience**: Add `onerror` and `onopen` handlers to `EventSource` in the project dashboard.
- **Failure UI**: Inline "Retry" button appears on the Run Timeline when a `phase.*.failed` event is received.

## 5. Verification Plan
1. **Migration**: Run `prisma migrate dev` to add `RunStage`.
2. **Mock Failure**: Force an AI error in `MockModelAdapter`.
3. **Retry Flow**: Verify "Retry" button appears, resets stage, and run continues from failure point.
4. **Model Crud**: Add/Edit/Test a model configuration.
