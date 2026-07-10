# 02 - Data Model

## Data model philosophy

The data model is event-backed and traceable.

The application must store raw events and structured objects. Structured objects are extracted or generated from raw events, but raw events remain the durable audit trail.

## Tables

### ResearchProject

Purpose: top-level project container.

Fields:

```text
id: uuid primary key
title: string
goal: text
currentSynthesis: text nullable
status: active | paused | completed | archived
createdAt: datetime
updatedAt: datetime
```

### ResearchSession

Purpose: a bounded user/research session within a project.

```text
id: uuid
projectId: uuid
sessionGoal: text
startedAt: datetime
endedAt: datetime nullable
summary: text nullable
status: active | completed | failed | cancelled
```

### IdeaVersion

Purpose: versioned representation of the idea.

```text
id: uuid
projectId: uuid
versionNumber: integer
title: string
description: text
status: draft | under_review | needs_revision | accepted | accepted_with_reservations | rejected | superseded
changesFromPrevious: json
createdBecauseOfCritiqueIds: json array
createdAt: datetime
```

Rules:

- Version numbers are per project.
- Only one version may be current under review.
- When new version is created, previous version is usually marked `superseded` unless it is retained for comparison.

### Claim

Purpose: a specific statement that can be supported, contradicted, or revised.

```text
id: uuid
projectId: uuid
ideaVersionId: uuid
text: text
type: technical | product | market | business | legal | ux | research | risk | assumption
requiresEvidence: boolean
criticality: low | medium | high | blocking
status: unverified | supported | partially_supported | contradicted | unsupported | needs_external_validation
confidence: float nullable
createdAt: datetime
```

Rules:

- High or blocking claims should trigger evidence tasks.
- Claims without evidence cannot be accepted unless marked as user premise.

### Hypothesis

Purpose: a researchable statement that may require external validation.

```text
id: uuid
projectId: uuid
ideaVersionId: uuid nullable
statement: text
status: unexamined | under_research | supported | partially_supported | contradicted | inconclusive | needs_experiment
confidence: float nullable
acceptedEvidenceIds: json array
counterEvidenceIds: json array
openQuestions: json array
createdAt: datetime
updatedAt: datetime
```

### ResearchTask

Purpose: a discrete unit of research, review, critique, or synthesis.

```text
id: uuid
projectId: uuid
claimId: uuid nullable
ideaVersionId: uuid nullable
title: string
objective: text
role: researcher | skeptic | source_auditor | inference_auditor | reviewer | critic | revision_writer | consensus_voter | decision_writer | context_auditor
priority: low | medium | high | critical
status: todo | queued | running | done | blocked | failed | cancelled
assignedModelId: uuid nullable
outputIds: json array
createdAt: datetime
updatedAt: datetime
```

### Evidence

Purpose: a source, excerpt, or document used to support or contradict claims.

```text
id: uuid
projectId: uuid
claimId: uuid nullable
discoveredByModelId: uuid nullable
sourceUrl: text nullable
title: text
publisher: text nullable
publishedAt: datetime nullable
retrievedAt: datetime
sourceType: official | academic | government | company | news | benchmark | blog | forum | user_input | unknown
excerpt: text nullable
summary: text nullable
rawContentRef: text nullable
reliability: pending | high | medium | low | unusable
relevance: pending | direct | indirect | weak | irrelevant
status: pending_review | accepted | accepted_with_caution | rejected | irrelevant | needs_better_source
stalenessRisk: low | medium | high
createdAt: datetime
```

Rules:

- Evidence starts as `pending_review`.
- Evidence cannot support an accepted claim until reviewed.
- Evidence may support or contradict multiple claims through KnowledgeEdge.

### EvidenceAssessment

Purpose: model assessment of evidence quality.

```text
id: uuid
evidenceId: uuid
reviewerModelId: uuid
reliability: high | medium | low | unusable
relevance: direct | indirect | weak | irrelevant
interpretationVerdict: correctly_used | overstated | misinterpreted | out_of_context | insufficient
detectedProblems: json array
notes: text
finalVerdict: accept | accept_with_caution | reject | irrelevant | needs_better_source
createdAt: datetime
```

### ModelConfig

Purpose: configured AI model.

```text
id: uuid
name: string
provider: mock | openrouter | ollama | openai_compatible
model: string
baseUrl: string nullable
apiKeyRef: string nullable
contextWindow: integer
preferredMaxInputRatio: float
outputReserveRatio: float
defaultTemperature: float
supportsStreaming: boolean
supportsJsonMode: boolean
isEnabled: boolean
createdAt: datetime
updatedAt: datetime
```

Rules:

- Store key references, not raw keys, where possible.
- In MVP, `.env` is acceptable.
- Never return secrets to frontend.

### ModelCall

Purpose: raw model call audit.

```text
id: uuid
projectId: uuid nullable
taskId: uuid nullable
modelConfigId: uuid
provider: string
model: string
messages: json
responseText: text nullable
responseJson: json nullable
usage: json nullable
status: pending | success | failed | invalid_json | schema_error
error: text nullable
contextManifestId: uuid nullable
createdAt: datetime
completedAt: datetime nullable
```

### ModelReview

Purpose: independent review of an idea version.

```text
id: uuid
projectId: uuid
ideaVersionId: uuid
modelId: uuid
verdict: accept | accept_with_reservations | reject | abstain | needs_more_evidence
strengths: json array
weaknesses: json array
blockingIssues: json array
supportedClaims: json array
unsupportedClaims: json array
suggestedRevisions: json array
confidence: float
createdAt: datetime
```

### Critique

Purpose: a targeted criticism of idea, claim, evidence, reasoning, review, revision, or decision.

```text
id: uuid
projectId: uuid
ideaVersionId: uuid
criticModelId: uuid
targetType: idea | claim | evidence | model_review | reasoning | revision | decision
targetId: uuid
critiqueType: contradiction | missing_assumption | weak_evidence | bad_source | misinterpreted_evidence | scope_error | implementation_risk | cost_risk | better_alternative | unsupported_generalization
severity: low | medium | high | blocking
text: text
whyItMatters: text
proposedFix: text nullable
evidenceIds: json array
status: open | accepted | partially_accepted | rejected | resolved_in_revision | deferred_to_test
createdAt: datetime
```

### CritiqueResponse

Purpose: response by target model or system to a critique.

```text
id: uuid
critiqueId: uuid
targetModelId: uuid nullable
verdict: accept | partial_accept | reject | needs_more_evidence
reason: text
positionChange: none | minor | major
revisedClaim: text nullable
requestedEvidence: json array
createdAt: datetime
```

### DecisionRecord

Purpose: final or intermediate decision.

```text
id: uuid
projectId: uuid
ideaVersionId: uuid
decisionStatus: full_consensus | qualified_consensus | no_consensus | insufficient_evidence | needs_external_validation | max_rounds_reached
decisionText: text
whyGood: json array
whyBad: json array
knownWeaknesses: json array
acceptedEvidenceIds: json array
counterEvidenceIds: json array
resolvedCritiqueIds: json array
unresolvedRisks: json array
modelFinalVotes: json array
reopenConditions: json array
nextActions: json array
createdAt: datetime
```

### ContextManifest

Purpose: record which memory items were included in a model context.

```text
id: uuid
projectId: uuid
taskId: uuid nullable
modelId: uuid
includedClaims: json array
includedEvidence: json array
includedCritiques: json array
includedDecisions: json array
includedRawEvents: json array
excludedButRelevant: json array
tokenBudget: integer
tokenUsed: integer nullable
retrievalReason: json
createdAt: datetime
```

### Summary

Purpose: source-linked summary. Summaries never replace raw data.

```text
id: uuid
projectId: uuid
scope: session | hypothesis | decision | evidence_cluster | idea_version | project
text: text
sourceEventIds: json array
sourceObjectIds: json array
generatedByModelId: uuid nullable
reviewedByModelIds: json array
status: active | superseded | rejected
createdAt: datetime
```

### KnowledgeEdge

Purpose: graph relationship between entities.

```text
id: uuid
fromType: string
fromId: uuid
toType: string
toId: uuid
relation: supports | contradicts | critiques | revises | depends_on | derived_from | accepted_by | rejected_by | needs_evidence | supersedes | references
createdAt: datetime
```

### RawEvent

Purpose: immutable audit log.

```text
id: uuid
projectId: uuid
type: string
payload: json
sourceIds: json array
createdBy: user | system | model:<id>
hash: string
createdAt: datetime
```

Rules:

- Never update RawEvent.
- Never delete RawEvent in MVP.
- If correction is needed, create a new event.

### RunEvent

Purpose: UI-visible run progress event.

```text
id: uuid
runId: uuid
projectId: uuid
type: string
payload: json
createdAt: datetime
```


## pgvector / semantic memory requirements

The MVP must include pgvector setup even if advanced semantic retrieval is implemented after the first runnable milestone.

Required files:

```text
templates/docker-compose.yml
templates/migrations/0001_enable_pgvector.sql
templates/prisma.schema.prisma
```

The initial SQL file must contain:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The Prisma schema template includes `SourceEmbedding` with `Unsupported("vector")?` so Codex has a concrete place to store future embeddings. If Prisma migration generation cannot fully manage the vector type, Codex must preserve the SQL migration and document the manual migration step.

`SourceEmbedding` records are optional for the earliest MVP run. The system must still work with keyword/manual retrieval if embeddings are not yet generated.

---

## Post-MVP model additions

See [13-new-features.md](./13-new-features.md) for full details on the following tables added after MVP:

```text
ClaimDependency         -- directed claim dependency graph
LiteratureReview        -- automated literature review results
Annotation              -- threaded comments on any entity
EvaluationCriteria      -- custom evidence/claim evaluation scales
EvidenceCustomScore     -- per-evidence scores against custom criteria
UserPresence            -- live user presence tracking
ArgumentMap             -- Toulmin argument map exports
```
