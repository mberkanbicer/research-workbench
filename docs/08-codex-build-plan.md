# 08 - Codex Build Plan

## Instruction to Codex

Build this project milestone by milestone. Do not implement future milestones early unless necessary for compile-time correctness.

After every milestone:

```text
1. Summarize created/modified files.
2. Run typecheck.
3. Run tests if configured.
4. Confirm current repo state is runnable.
```

## Milestone 1 - Monorepo scaffold

Goal:

Create repo structure and tooling.

Tasks:

```text
- Initialize pnpm workspace.
- Create apps/web Next.js app.
- Create apps/api Fastify app.
- Create packages/shared.
- Create packages/model-gateway.
- Add TypeScript configs.
- Add root package scripts.
- Add Docker Compose for PostgreSQL pgvector image and Redis.
- Add `templates/migrations/0001_enable_pgvector.sql` or equivalent initial SQL that runs `CREATE EXTENSION IF NOT EXISTS vector;`.
- Add env example.
```

Acceptance:

```text
pnpm install works.
pnpm typecheck works or reaches known TODO only.
docker compose file exists.
apps/api can start with hello route.
apps/web can start with placeholder page.
```

## Milestone 2 - Shared schemas and constants

Goal:

Create shared Zod schemas and TypeScript types.

Tasks:

```text
- Define enums.
- Define prompt output schemas.
- Define API DTO schemas.
- Export from packages/shared.
```

Acceptance:

```text
Schemas compile.
Invalid enum values fail tests.
Sample valid objects pass tests.
```

## Milestone 3 - Prisma schema and database setup

Goal:

Implement data model.

Tasks:

```text
- Add Prisma to apps/api.
- Implement schema based on docs/02-data-model.md.
- Add migrations.
- Add Prisma client singleton.
- Add seed script for three mock models.
- Add SourceEmbedding model using `Unsupported("vector")?` or equivalent pgvector-compatible storage.
- Verify `CREATE EXTENSION IF NOT EXISTS vector;` is executed before semantic embedding tables are used.
```

Acceptance:

```text
Postgres starts.
Migration runs.
Seed creates mock models.
```

## Milestone 4 - API scaffold and core CRUD

Goal:

Implement basic REST routes.

Tasks:

```text
- Fastify app setup.
- Error handler.
- Zod validation helper.
- Project routes.
- Model config routes.
- Idea version routes.
- Claim routes.
- Evidence routes.
- Decision routes read-only.
```

Acceptance:

```text
Can create project.
Project creation creates IdeaVersion v1.
Can add manual evidence.
Can list models.
```



## Milestone 4.5 - Mock search adapter

Goal:

Implement deterministic evidence search without external API keys.

Tasks:

```text
- Create SearchProviderAdapter interface.
- Implement ManualEvidenceAdapter path for user-entered sources.
- Implement MockSearchAdapter using templates/mock-search-results.json.
- Match query strings case-insensitively against fixture `match` fields.
- Return fallbackResults only when no match is found.
- Convert SearchResult fixtures into Evidence records with pending_review status.
```

Acceptance:

```text
POST /claims/:claimId/search-evidence works without WEB_SEARCH_API_KEY.
Known demo queries return deterministic fixture evidence.
Fallback evidence is clearly marked as development fixture evidence.
```

## Milestone 5 - Model gateway

Goal:

Create provider abstraction.

Tasks:

```text
- Define ModelProviderAdapter interface.
- Implement MockModelAdapter.
- Implement OpenRouterAdapter.
- Implement OllamaAdapter.
- Implement OpenAICompatibleAdapter.
- Add model call logging.
- Add JSON call helper with Zod validation.
```

Acceptance:

```text
Mock adapter returns deterministic JSON.
Mock search adapter returns deterministic fixture results from `templates/mock-search-results.json`.
Model test endpoint works.
Invalid JSON triggers retry/correction path.
```

## Milestone 6 - Prompt contracts

Goal:

Implement prompt files.

Tasks:

```text
- claim extraction prompt
- research query generation prompt
- evidence assessment prompt
- independent review prompt
- cross critique prompt
- critique response prompt
- idea revision prompt
- consensus vote prompt
- decision record prompt
- context audit prompt
```

Acceptance:

```text
Each prompt returns string.
Each prompt references JSON schema.
Prompt unit tests snapshot key sections.
```

## Milestone 7 - Context and raw event system

Goal:

Implement durable memory basics.

Tasks:

```text
- RawEventService.
- ContextManifestService.
- Basic ContextService.
- Direct object context loading.
- Token budget placeholder.
- KnowledgeEdge CRUD helper.
```

Acceptance:

```text
Creating project creates RawEvent.
Model tasks create ContextManifest.
Context can include idea version, claims, evidence, critiques, and decisions.
```

## Milestone 8 - Core AI services

Goal:

Implement model-powered services using mock adapter first.

Tasks:

```text
- ClaimExtractionService.
- EvidenceAssessmentService.
- ModelReviewService.
- CritiqueService.
- CritiqueResponseService.
- RevisionService.
- ConsensusVoteService.
- DecisionRecordService.
```

Acceptance:

```text
Each service works with mock adapter.
Outputs persist to database.
Zod validation is enforced.
```

## Milestone 9 - Orchestrator and BullMQ

Goal:

Implement deliberation run pipeline.

Tasks:

```text
- Add BullMQ queues.
- Add run entity if needed.
- Implement DeliberationOrchestrator.
- Add POST /projects/:id/runs.
- Add run cancellation placeholder.
```

Acceptance:

```text
Starting run creates queued job.
Mock run completes.
Run creates claims, reviews, critiques, revised idea, and decision.
```

## Milestone 10 - SSE run events

Goal:

Live progress events.

Tasks:

```text
- RunEventService.
- Persist run events.
- SSE endpoint.
- Emit events from orchestrator.
```

Acceptance:

```text
Frontend or curl can subscribe to /runs/:id/events.
Events appear during mock run.
```

## Milestone 11 - Frontend foundation

Goal:

Build UI shell and API client.

Tasks:

```text
- App layout.
- API client.
- TanStack Query setup.
- Project list page.
- Create project page.
- Model config page.
```

Acceptance:

```text
Can create project from UI.
Can configure mock models from UI.
```

## Milestone 12 - Project research UI

Goal:

Build main research screens.

Tasks:

```text
- Project dashboard.
- Start run modal.
- Run progress component.
- Deliberation timeline.
- Evidence Commons.
- Idea Evolution.
- Decision Ledger.
```

Acceptance:

```text
User can start mock run and inspect generated results.
```

## Milestone 13 - Export

Goal:

Add JSON and Markdown export.

Tasks:

```text
- Export JSON route.
- Export Markdown route.
- UI buttons.
```

Acceptance:

```text
Export includes project, idea versions, claims, evidence, critiques, decisions.
No secrets included.
```

## Milestone 14 - MVP acceptance pass

Goal:

Run full demo scenario.

Tasks:

```text
- Add seed demo data or test script.
- Run docs/10-mvp-acceptance.md scenario.
- Fix blockers.
```

Acceptance:

```text
All MVP acceptance criteria pass.
```

## Stop conditions

Stop and ask user if:

```text
- A required package choice conflicts with docs.
- A major schema migration would invalidate previous milestone data.
- A real provider API behavior is unclear and cannot be safely mocked.
- Security requirement conflicts with implementation shortcut.
```
