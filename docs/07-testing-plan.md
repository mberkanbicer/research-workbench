# 07 - Testing Plan

## Testing principle

The MVP must be testable without real model API keys.

Use mock adapters to produce deterministic model outputs for the acceptance scenario.

## Test categories

```text
Unit tests
Integration tests
API route tests
Orchestrator flow tests
Frontend component smoke tests
End-to-end MVP scenario
```

## Unit tests

### Zod schemas

Test every major schema:

- Claim extraction output
- Independent review output
- Evidence assessment output
- Cross critique output
- Critique response output
- Idea revision output
- Consensus vote output
- Decision record output

Cases:

```text
valid output passes
missing required field fails
unknown evidence ID fails business validation
invalid enum fails
accepted claim without evidence fails business validation
```

### Consensus algorithm

Test cases:

```text
all accept -> full_consensus
all accept or accept_with_reservations -> qualified_consensus
one reject -> no_consensus
one needs_more_evidence -> needs_more_evidence
unresolved blocking critique -> needs_revision
unsupported blocking claim -> needs_more_evidence
rejected evidence used by critical claim -> needs_revision
```

### Evidence aggregation

Test:

```text
accepted direct evidence -> supported
accepted_with_caution only -> partially_supported
counter-evidence accepted -> contradicted or needs_external_validation
rejected evidence -> cannot support claim
irrelevant evidence -> cannot support claim
```

### Context builder

Test:

```text
includes current idea version
includes blocking critiques
includes counter-evidence
includes accepted decisions
excludes low-priority unrelated items when budget is small
creates ContextManifest
```

## Integration tests

### Project creation

```text
POST /projects creates project and IdeaVersion v1.
RawEvent is created.
```

### Manual evidence

```text
POST /projects/:id/evidence creates Evidence.
Evidence starts as pending_review.
RawEvent is created.
```

### Model config

```text
POST /models creates config without returning secrets.
POST /models/:id/test works with mock adapter.
```

### Run start

```text
POST /projects/:id/runs creates run.
BullMQ job is queued.
SSE emits run.started.
```

## Mock model adapter

The mock adapter must support task-specific deterministic outputs.

Suggested modes:

```text
claim_extraction
independent_review_model_a
independent_review_model_b
independent_review_model_c
evidence_assessment_accept
evidence_assessment_reject
cross_critique_blocking
critique_response_accept
idea_revision
consensus_vote_accept
consensus_vote_reserved
decision_record_qualified
```

Mock adapter behavior:

- Detect task type from system prompt or explicit metadata.
- Return valid JSON.
- Include predictable IDs passed in context.
- Never call external APIs.

## End-to-end MVP scenario

Scenario name:

```text
multi_model_research_workbench_demo
```

Steps:

1. Create project.
2. Configure three mock models.
3. Create IdeaVersion v1.
4. Extract at least five claims.
5. Add two manual evidence items.
6. Assess evidence with three mock models.
7. Run independent reviews.
8. Create at least one critique.
9. Accept or partially accept one critique.
10. Create IdeaVersion v2.
11. Run consensus vote.
12. Create DecisionRecord.
13. Verify decision includes whyGood, whyBad, knownWeaknesses, evidence IDs, votes, and nextActions.

Expected final state:

```text
qualified_consensus or needs_external_validation
```

## Frontend smoke tests

Minimum:

```text
Project list renders
Create project form renders
Project dashboard renders with mock data
Evidence Commons table renders
Idea Evolution page renders
Decision Ledger page renders
Model Config form renders
```

## Type checks

Every milestone must run:

```text
pnpm typecheck
```

After tests are configured:

```text
pnpm test
```

If lint is configured:

```text
pnpm lint
```

## Acceptance blocker list

MVP fails if:

- model output can bypass schema validation
- accepted claim can exist without evidence or user-premise status
- decision can be created without model votes
- decision can be created without ideaVersionId
- raw events can be mutated
- API keys appear in frontend response
- orchestrator cannot run using mock models
- UI cannot inspect the final decision record


## Additional final-readiness tests

Add these tests to close implementation ambiguity:

```text
MockSearchAdapter
- loads templates/mock-search-results.json
- returns deterministic results for known demo queries
- returns fallbackResults for unknown queries
- converts SearchResult into Evidence draft with pending_review status
- deduplicates by sourceUrl within the same project

pgvector setup
- docker compose uses pgvector/pgvector:pg16
- initial SQL includes CREATE EXTENSION IF NOT EXISTS vector
- Prisma schema includes SourceEmbedding or equivalent vector-compatible table

Frontend state
- TanStack Query is used for server data
- Zustand stores exist for run state, inspector state, and model selection state
```
