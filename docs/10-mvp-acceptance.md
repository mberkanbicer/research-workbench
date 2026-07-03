# 10 - MVP Acceptance Criteria

## Purpose

This document defines the exact acceptance test for the first complete MVP.

The MVP is not accepted unless this scenario works end-to-end.

## Required preconditions

```text
PostgreSQL running
Redis running
API server running
Web app running
At least three mock models configured
```

Real model providers are optional for acceptance, but at least one real provider adapter must exist in code.

## Demo project

Title:

```text
Evidence-grounded multi-model research workbench
```

Goal:

```text
Validate whether a web-based, multi-model, evidence-grounded deliberation system is a useful and technically feasible long-horizon research tool.
```

Initial idea:

```text
A local-first web UI where multiple AI models collaboratively research, critique, revise, and finalize ideas using evidence, counter-evidence, source auditing, context manifests, and iterative consensus loops.
```

## Acceptance scenario

### Step 1 - Create project

User creates project from UI or API.

Expected:

```text
ResearchProject created.
IdeaVersion v1 created.
RawEvent created.
Dashboard opens.
```

### Step 2 - Configure models

User configures three mock models:

```text
Mock Researcher
Mock Skeptic
Mock Auditor
```

Expected:

```text
Models appear in settings.
Model test endpoint passes.
No secrets appear in frontend.
```

### Step 3 - Extract claims

User starts claim extraction or starts deliberation run.

Expected:

At least five claims are created:

```text
1. The system can improve idea development quality.
2. Multi-model critique can reveal weaknesses missed by one model.
3. Evidence auditing can reduce unsupported claims.
4. Long-horizon memory can preserve research context.
5. Local-first architecture can reduce cost and increase user control.
```

### Step 4 - Add evidence

User manually adds or mock search creates at least two evidence items.

Expected:

```text
Evidence records created.
Evidence starts as pending_review.
Evidence appears in Evidence Commons.
```

### Step 5 - Evidence assessment

Three mock models assess evidence.

Expected:

```text
EvidenceAssessment records created.
Evidence status aggregated.
At least one evidence item accepted or accepted_with_caution.
At least one limitation or caution is recorded.
```

### Step 6 - Independent reviews

Three mock models independently review v1.

Expected:

```text
ModelReview records created.
Each review has verdict.
Each review has strengths and weaknesses.
Each review references claim IDs.
Supported claims reference evidence IDs.
Unsupported claims explain missing evidence.
```

### Step 7 - Cross critique

Models critique each other.

Expected:

```text
At least one Critique created.
At least one critique targets claim, evidence, or reasoning.
At least one critique has severity high or blocking.
Critique explains why it matters.
```

### Step 8 - Critique response

Target model responds.

Expected:

```text
CritiqueResponse created.
At least one critique is accept or partial_accept.
PositionChange is minor or major.
```

### Step 9 - Revision

System creates IdeaVersion v2.

Expected:

```text
IdeaVersion v2 created.
changesFromPrevious includes accepted critique rationale.
Previous version remains accessible.
Idea Evolution UI shows v1 -> v2.
```

### Step 10 - Re-evaluation

Models review v2.

Expected:

```text
New reviews reference v2.
Resolved critiques are marked resolved_in_revision if applicable.
```

### Step 11 - Consensus check

System runs consensus logic.

Expected output is one of:

```text
full_consensus
qualified_consensus
no_consensus
insufficient_evidence
needs_external_validation
max_rounds_reached
```

For the first demo, expected likely result:

```text
qualified_consensus or needs_external_validation
```

### Step 12 - Decision record

System creates DecisionRecord.

Expected fields populated:

```text
decisionStatus
decisionText
whyGood
whyBad
knownWeaknesses
acceptedEvidenceIds
counterEvidenceIds
resolvedCritiqueIds
unresolvedRisks
modelFinalVotes
reopenConditions
nextActions
```

### Step 13 - UI inspection

User can inspect:

```text
Project dashboard
Deliberation timeline
Evidence Commons
Idea Evolution
Decision Ledger
```

### Step 14 - Export

User exports JSON and Markdown.

Expected:

```text
Export files contain project, idea versions, claims, evidence, critiques, decisions.
Export files do not contain API keys.
```

## Hard blockers

MVP fails if any of these happen:

```text
A decision can be created without model votes.
An accepted claim can exist without evidence or user-premise status.
RawEvent can be updated.
Model output can bypass Zod validation.
Invalid model JSON is silently accepted.
API key is visible in frontend.
Run cannot complete with mock models.
UI cannot show the final decision.
```

## Acceptance statement

The MVP is accepted when a user can start with a raw idea and end with a traceable decision record produced through evidence, model review, critique, critique response, revision, and consensus logic.


## Final hard blockers added after review

The MVP is not accepted if any of the following are true:

```text
- .codex/config.toml is empty or contains only comments.
- schemas/openapi.yaml covers only a subset of the documented API surface.
- pgvector extension is not enabled (see `infra/postgres/migrations/0001_enable_pgvector.sql`; optional column migration: `./manage.sh pgvector`).
- Frontend global UI state library is not fixed as Zustand.
- MockSearchAdapter behavior is not deterministic.
- templates/mock-search-results.json is missing.
- The demo scenario requires real model/search API keys to run.
```
