# 12 - Mock Adapters and Fixtures

## Purpose

The MVP must be runnable without real model API keys and without a real web search API. Codex must implement deterministic mock adapters before implementing real provider adapters.

## MockModelAdapter

The mock model adapter must inspect the task type and return valid JSON matching the relevant prompt output schema.

Required task handlers:

```text
claim_extraction
independent_review
evidence_assessment
cross_critique
critique_response
idea_revision
consensus_vote
decision_record
context_audit
```

The mock outputs must be deterministic. Do not use random values unless a fixed seed is used.

## MockSearchAdapter

The mock search adapter must read:

```text
templates/mock-search-results.json
```

Matching rule:

```text
1. Lowercase the incoming query.
2. Lowercase each fixture `match` string.
3. If the query includes the fixture match, or the fixture match includes at least two meaningful query tokens, return that fixture's results.
4. If no match is found, return fallbackResults.
```

SearchResult shape:

```ts
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publisher?: string;
  publishedAt?: string;
  sourceType?: string;
  excerpt?: string;
};
```

Conversion to Evidence:

```text
sourceUrl      <- result.url
title          <- result.title
publisher      <- result.publisher
publishedAt    <- result.publishedAt
sourceType     <- result.sourceType or unknown
excerpt        <- result.excerpt or result.snippet
summary        <- result.snippet
status         <- pending_review
reliability    <- pending
relevance      <- pending
stalenessRisk  <- medium
```

Fallback results must be treated as weak development evidence. They must not become `accepted` without an explicit EvidenceAssessment.

## Required Demo Queries

These queries must return non-empty deterministic results:

```text
multi model deliberation debate reasoning
context window long context degradation lost in the middle
openrouter ollama local first model provider architecture
```

## Testing

Add unit tests for:

```text
- fixture loading
- known query matching
- fallback behavior
- conversion from SearchResult to Evidence draft
- no duplicate evidence creation for same URL within a project
```
