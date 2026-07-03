# 04 - Orchestration Workflow

## Purpose

This document defines the exact workflow the orchestrator must implement.

The orchestrator is the core system that turns a user idea into a structured multi-model research process.

## Main pipeline

```text
1. Load project and current idea version.
2. Extract claims if missing or stale.
3. Create research tasks for claims.
4. Collect or attach evidence.
5. Assess evidence using other models.
6. Run independent model reviews.
7. Run cross-critiques.
8. Run critique responses.
9. Evaluate consensus.
10. If consensus reached, create decision.
11. If revision needed, create new idea version and repeat.
12. If more evidence needed, create follow-up tasks and repeat.
13. If no consensus after max rounds, create unresolved decision record.
```

## Run loop modes

`POST /projects/:projectId/runs` accepts `loopMode`:

| Mode | Behavior |
|------|----------|
| `standard` (default) | Quality threshold 0.75; no meta-prompt auto-fix; corrective actions limited to `rerun_stage` |
| `self_improving` | Quality threshold 0.60; meta-prompt improvements on bad outputs; full corrective action planner |

Both modes use the same `GoalSeekingLoop` stage pipeline. The difference is how the system responds to low-quality model outputs between iterations.

## Deliberation round state machine

```text
idle
  -> round_started
  -> claims_extracted
  -> research_tasks_created
  -> evidence_collected
  -> evidence_assessed
  -> independent_reviews_completed
  -> critiques_completed
  -> critique_responses_completed
  -> consensus_checked
  -> decision_created | revision_created | follow_up_tasks_created | unresolved
```

## Orchestrator pseudocode

```ts
async function runProjectCycle(input: {
  projectId: string;
  modelIds: string[];
  maxRounds: number;
}) {
  let ideaVersion = await ideaVersionService.getCurrent(input.projectId);

  for (let round = 1; round <= input.maxRounds; round++) {
    await events.emit("round.started", { round, ideaVersionId: ideaVersion.id });

    await claimService.extractClaimsIfNeeded({
      projectId: input.projectId,
      ideaVersionId: ideaVersion.id,
      modelId: input.modelIds[0]
    });

    await researchPlanner.createTasksForIdeaVersion({
      projectId: input.projectId,
      ideaVersionId: ideaVersion.id
    });

    await evidenceService.runPendingEvidenceTasks({
      projectId: input.projectId
    });

    await evidenceAssessmentService.assessPendingEvidence({
      projectId: input.projectId,
      reviewerModelIds: input.modelIds
    });

    const reviews = await modelReviewService.runIndependentReviews({
      projectId: input.projectId,
      ideaVersionId: ideaVersion.id,
      modelIds: input.modelIds
    });

    const critiques = await critiqueService.runCrossCritiques({
      projectId: input.projectId,
      ideaVersionId: ideaVersion.id,
      modelIds: input.modelIds,
      reviews
    });

    const critiqueResponses = await critiqueService.runCritiqueResponses({
      projectId: input.projectId,
      critiques,
      modelIds: input.modelIds
    });

    const consensus = await consensusService.evaluate({
      projectId: input.projectId,
      ideaVersionId: ideaVersion.id,
      reviews,
      critiques,
      critiqueResponses
    });

    await events.emit("consensus.checked", consensus);

    if (consensus.status === "full_consensus" || consensus.status === "qualified_consensus") {
      return await decisionService.createDecisionRecord({
        projectId: input.projectId,
        ideaVersionId: ideaVersion.id,
        consensus
      });
    }

    if (consensus.status === "needs_more_evidence") {
      await researchPlanner.createFollowUpTasks({
        projectId: input.projectId,
        missingEvidence: consensus.missingEvidence
      });
      continue;
    }

    if (consensus.status === "needs_revision" || consensus.status === "no_consensus") {
      ideaVersion = await revisionService.createRevisedIdeaVersion({
        projectId: input.projectId,
        previousIdeaVersionId: ideaVersion.id,
        critiques,
        critiqueResponses
      });
      continue;
    }
  }

  return await decisionService.createMaxRoundsReachedRecord({
    projectId: input.projectId,
    ideaVersionId: ideaVersion.id
  });
}
```

## Evidence workflow

```text
Claim requires evidence
  -> Create supporting evidence task
  -> Create counter-evidence task
  -> Search or manual evidence added
  -> Evidence stored as pending_review
  -> Reviewer models assess evidence
  -> Evidence status aggregated
  -> Claim status updated
```

Evidence aggregation rules:

```text
If at least one accepted direct evidence and no blocking counter-evidence:
  claim can become supported or partially_supported.

If only accepted_with_caution evidence:
  claim becomes partially_supported.

If accepted counter-evidence directly contradicts claim:
  claim becomes contradicted or needs_external_validation.

If evidence is rejected or irrelevant:
  it cannot support the claim.
```

## Critique workflow

```text
Model reviews available
  -> Each model receives other reviews + evidence pack
  -> Model produces targeted critiques
  -> Critiques must target idea, claim, evidence, reasoning, review, revision, or decision
  -> Critiques are stored
  -> Target model/system responds
  -> Accepted critiques influence revision
```

Critique severity handling:

```text
low:
  does not block consensus.

medium:
  should be addressed if practical.

high:
  should trigger revision unless explicitly rejected with strong reason.

blocking:
  must be resolved, rejected by adjudication, or deferred to external validation before acceptance.
```

## Revision workflow

```text
Accepted critiques
  -> Revision prompt receives current idea, accepted critiques, evidence, counter-evidence, unresolved risks
  -> New idea version is generated
  -> New claims are extracted or carried forward
  -> Previous version is marked superseded
  -> New version goes through review loop again
```

Revision must record:

- changes from previous
- critique IDs that caused changes
- evidence IDs that caused changes
- remaining risks
- removed claims
- new claims

## Consensus workflow

Consensus input:

- final model votes
- model reviews
- claim statuses
- evidence statuses
- unresolved critiques
- unresolved risks
- counter-evidence

Consensus statuses:

```text
full_consensus
qualified_consensus
needs_revision
needs_more_evidence
no_consensus
needs_external_validation
```

Consensus rules:

1. Any unresolved blocking critique -> needs_revision.
2. Any unsupported critical claim -> needs_more_evidence.
3. Any model vote `reject` -> no_consensus or needs_revision depending on reason.
4. Any model vote `needs_more_evidence` -> needs_more_evidence.
5. All `accept` -> full_consensus.
6. All `accept` or `accept_with_reservations` -> qualified_consensus.
7. If models cannot judge due to missing external test -> needs_external_validation.

## Context workflow

Every model task must use a context package.

Context build order:

```text
1. Task instruction
2. Current idea version
3. Relevant claims
4. Accepted evidence
5. Counter-evidence
6. Open critiques
7. Prior decisions
8. Critical raw excerpts
9. Retrieval map / available IDs
```

Context must create a ContextManifest.

Context Manifest records:

- included claims
- included evidence
- included critiques
- included decisions
- included raw events
- excluded but relevant items
- token budget
- token used
- retrieval reasons

## Lazy loading protocol

If a model lacks context, it must return:

```json
{
  "needsMoreContext": true,
  "requestedItems": [
    {
      "type": "evidence | decision | critique | raw_event | claim",
      "idOrQuery": "",
      "reason": ""
    }
  ]
}
```

The orchestrator then retrieves items and repeats the model call.

## Run events

Emit these events:

```text
run.started
round.started
claims.extracted
research.tasks.created
evidence.added
evidence.assessed
model.review.completed
critique.created
critique.responded
idea.revised
consensus.checked
decision.created
run.completed
run.failed
```

## Cancellation

If a run is cancelled:

- mark active BullMQ jobs cancelled if possible
- stop scheduling new tasks
- preserve completed outputs
- create run.cancelled event
- do not delete raw events
