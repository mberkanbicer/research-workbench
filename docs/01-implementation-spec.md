# 01 - Implementation Spec

## System objective

Build a local-first web application that supports evidence-grounded multi-model deliberation for long-horizon research and idea development.

The MVP must implement the full core loop in a controlled way:

```text
Idea -> Claims -> Evidence -> Evidence Assessment -> Independent Reviews -> Critiques -> Critique Responses -> Revision -> Consensus -> Decision Record
```



## Fixed implementation decisions

Codex must treat the following as final choices for the MVP. Do not leave these as alternatives:

```text
Package manager: pnpm
Node: 20.x
Frontend router: Next.js App Router
Server-state library: TanStack Query
Global UI state library: Zustand
Backend framework: Fastify
ORM: Prisma
Database: PostgreSQL 16 with pgvector
Queue: Redis + BullMQ
Run progress transport: Server-Sent Events
Search MVP: ManualEvidenceAdapter + deterministic MockSearchAdapter
Model MVP: MockModelAdapter + OpenRouterAdapter + OllamaAdapter + OpenAICompatibleAdapter
```

The mock search adapter must read `templates/mock-search-results.json`. It must perform deterministic case-insensitive substring matching against each fixture `match` field. If no fixture matches, it may return `fallbackResults`, but those fallback evidence records must be marked at most `accepted_with_caution` after assessment.

The database setup must enable pgvector by running `templates/migrations/0001_enable_pgvector.sql` before vector-backed semantic memory is used. The MVP may run without semantic retrieval, but the schema and migration template must exist.

Semantic context selection is gated by `EMBEDDING_ENABLED=false` (default). When set to `true`, `ContextService.getRelevantContext()` ranks claims and evidence for model calls and records `retrievalReason` on each `ContextManifest`. Optional pgvector column migration: `infra/postgres/migrations/0002_pgvector_embeddings_optional.sql`.

## Required stack

Use these exact choices for MVP:

```text
Package manager: pnpm
Frontend: Next.js App Router + React + TypeScript + TailwindCSS + TanStack Query + Zustand
Backend: Fastify + TypeScript
Validation: Zod
ORM: Prisma
Database: PostgreSQL + pgvector
Queue: Redis + BullMQ
Streaming: Server-Sent Events
Model adapters: Mock, OpenRouter, Ollama, OpenAI-compatible
Search adapters: Manual evidence, mock search; optional real web search later
```

## Monorepo structure

```text
research-workbench/
  apps/
    web/
      app/
      components/
      hooks/
      lib/
      stores/
    api/
      src/
        adapters/
        db/
        jobs/
        modules/
        prompts/
        routes/
        services/
        utils/
  packages/
    shared/
      src/
        schemas/
        types/
        constants/
    model-gateway/
      src/
    prompt-contracts/
      src/
  infra/
    docker-compose.yml
  docs/
```

## Runtime services

```text
apps/web
  - User interface
  - Project dashboard
  - Evidence commons
  - Deliberation timeline
  - Idea evolution
  - Decision ledger
  - Model configuration

apps/api
  - REST API
  - SSE event stream
  - Orchestrator
  - BullMQ workers
  - Prisma DB access
  - Model gateway
  - Evidence service
  - Context service
```

## Core backend modules

Implement these modules under `apps/api/src/modules`:

```text
project
model-config
idea-version
claim
evidence
evidence-assessment
research-task
model-review
critique
critique-response
revision
consensus
decision
context
raw-event
run-event
orchestrator
```

## Required service responsibilities

### ProjectService

- Create project.
- List projects.
- Read project detail.
- Update project metadata.
- Archive project.
- Return project current state summary.

### IdeaVersionService

- Create initial idea version.
- Create revised idea version.
- Get current idea version.
- List idea version history.
- Mark older versions superseded.

### ClaimService

- Extract claims from idea version using model call.
- Persist claims.
- Update claim status based on evidence.
- Link claims to evidence and critiques.

### EvidenceService

- Add manual evidence.
- Add evidence from search results.
- Deduplicate by URL and normalized title.
- Store evidence in Evidence Commons.
- Update evidence status after assessment.

### EvidenceAssessmentService

- Assign evidence to reviewer models.
- Ask models to evaluate reliability, relevance, and interpretation.
- Persist assessments.
- Aggregate evidence status.

### ModelReviewService

- Build context for independent review.
- Call each model independently.
- Validate output with Zod.
- Persist ModelReview.

### CritiqueService

- Build cross-critique context.
- Ask models to critique other reviews, claims, evidence, and reasoning.
- Persist Critique objects.
- Ask target models to respond.
- Persist CritiqueResponse objects.

### RevisionService

- Collect accepted and partially accepted critiques.
- Generate revised idea version.
- Create new claims if needed.
- Mark previous version superseded.

### ConsensusService

- Collect final model votes.
- Check blocking critiques.
- Check unsupported critical claims.
- Check rejected evidence usage.
- Return consensus status.

### DecisionService

- Generate final decision record.
- Persist why good, why bad, weaknesses, evidence, counter-evidence, votes, reopen conditions, and next actions.

### ContextService

- Build task-specific context.
- Retrieve related objects by direct links, graph, semantic search, keyword search, and contradiction links.
- Pack within token budget.
- Create ContextManifest.
- Support lazy loading requests.

### RawEventService

- Persist immutable events for all important actions.
- Never update or delete raw events.
- Store source IDs and payload hash.

### RunEventService

- Emit SSE events for UI.
- Persist run events for replay.

## MVP implementation flow

1. User creates project.
2. User configures at least three models or uses mock models.
3. User creates initial idea version.
4. User starts a run.
5. Orchestrator extracts claims.
6. User manually adds evidence or mock evidence is created.
7. Models assess evidence.
8. Models independently review idea.
9. Models critique each other.
10. Models respond to critiques.
11. Orchestrator revises idea if needed.
12. Orchestrator checks consensus.
13. Decision record is created.
14. UI shows timeline, evidence, versions, and decision.

## Hard invariants

- All model JSON outputs must pass Zod validation.
- Accepted claim requires at least one accepted or caution-accepted evidence ID unless marked as user premise.
- RawEvent is immutable.
- Every DecisionRecord must contain an IdeaVersion ID.
- Every DecisionRecord must contain model final votes.
- Every model call must be saved.
- Every important model call must have a ContextManifest.
- No API key may be returned to frontend.
- Invalid model output cannot silently proceed.

## MVP completion condition

MVP is complete when `docs/10-mvp-acceptance.md` passes end-to-end with mock models and at least one real model provider path is implemented.
