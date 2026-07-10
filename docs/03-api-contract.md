# 03 - API Contract

## OpenAPI source of truth

`schemas/openapi.yaml` is the implementation source of truth for route coverage, request DTOs, response DTOs, enum values, and error shape. If this markdown file and `schemas/openapi.yaml` appear to conflict, implement the OpenAPI file and then update this markdown file.

The OpenAPI file must cover the full MVP surface:

```text
/health
/projects
/projects/{projectId}
/projects/{projectId}/archive
/projects/{projectId}/runs
/runs/{runId}
/runs/{runId}/events
/runs/{runId}/cancel
/projects/{projectId}/idea-versions
/idea-versions/{ideaVersionId}
/idea-versions/{ideaVersionId}/extract-claims
/projects/{projectId}/claims
/claims/{claimId}
/projects/{projectId}/evidence
/evidence/{evidenceId}
/claims/{claimId}/search-evidence
/claims/{claimId}/search-counter-evidence
/evidence/{evidenceId}/assess
/models
/models/{modelId}
/models/{modelId}/test
/projects/{projectId}/tasks
/tasks/{taskId}
/tasks/{taskId}/run
/projects/{projectId}/decisions
/decisions/{decisionId}
/projects/{projectId}/export.json
/projects/{projectId}/export.md
```

## API conventions

Base URL:

```text
http://localhost:4000
```

Response shape for success:

```json
{
  "data": {},
  "meta": {}
}
```

Response shape for errors:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

Common status codes:

```text
200 OK
201 Created
400 Validation Error
404 Not Found
409 Conflict
500 Internal Server Error
```

All request bodies must be validated with Zod.

## Projects

### POST /projects

Create project and initial idea version.

Request:

```json
{
  "title": "Evidence-grounded research workbench",
  "goal": "Build a long-horizon multi-model research system.",
  "initialIdea": "A web UI where multiple models deliberate over ideas using evidence."
}
```

Response:

```json
{
  "data": {
    "project": {
      "id": "project_1",
      "title": "Evidence-grounded research workbench",
      "goal": "Build a long-horizon multi-model research system.",
      "status": "active"
    },
    "ideaVersion": {
      "id": "idea_1",
      "versionNumber": 1,
      "title": "Initial idea",
      "description": "A web UI where multiple models deliberate over ideas using evidence."
    }
  }
}
```

### GET /projects

Response:

```json
{
  "data": [
    {
      "id": "project_1",
      "title": "...",
      "goal": "...",
      "status": "active",
      "updatedAt": "2026-06-07T00:00:00.000Z"
    }
  ]
}
```

### GET /projects/:projectId

Return full dashboard state.

Response includes:

```json
{
  "data": {
    "project": {},
    "currentIdeaVersion": {},
    "latestDecision": {},
    "claimCounts": {},
    "evidenceCounts": {},
    "openCriticalIssues": [],
    "activeTasks": [],
    "nextBestAction": ""
  }
}
```

### PATCH /projects/:projectId

Request:

```json
{
  "title": "optional",
  "goal": "optional",
  "currentSynthesis": "optional",
  "status": "active | paused | completed | archived"
}
```

## Model configs

### GET /models

Return configured models without secrets.

### POST /models

Request:

```json
{
  "name": "GPT via OpenRouter",
  "provider": "openrouter",
  "model": "openai/gpt-4.1",
  "baseUrl": null,
  "apiKeyRef": "OPENROUTER_API_KEY",
  "contextWindow": 128000,
  "preferredMaxInputRatio": 0.5,
  "outputReserveRatio": 0.2,
  "defaultTemperature": 0.2,
  "supportsStreaming": true,
  "supportsJsonMode": false,
  "isEnabled": true
}
```

### POST /models/:modelId/test

Test model call with a small JSON prompt.

Response:

```json
{
  "data": {
    "ok": true,
    "text": "...",
    "usage": {}
  }
}
```

## Idea versions

### GET /projects/:projectId/idea-versions

Return all versions ordered by versionNumber.

### GET /idea-versions/:ideaVersionId

Return one version with claims and linked critiques.

### POST /projects/:projectId/idea-versions

Manual creation or import.

Request:

```json
{
  "title": "Idea v2",
  "description": "...",
  "changesFromPrevious": ["..."],
  "createdBecauseOfCritiqueIds": []
}
```

## Claims

### GET /projects/:projectId/claims

Query params:

```text
ideaVersionId optional
status optional
type optional
criticality optional
```

### POST /idea-versions/:ideaVersionId/extract-claims

Runs claim extraction model task.

Request:

```json
{
  "modelId": "model_1"
}
```

Response:

```json
{
  "data": {
    "claims": [],
    "hypotheses": [],
    "openQuestions": []
  }
}
```

## Evidence

### GET /projects/:projectId/evidence

Query params:

```text
claimId optional
status optional
sourceType optional
```

### POST /projects/:projectId/evidence

Manual evidence entry.

Request:

```json
{
  "claimId": "claim_1",
  "sourceUrl": "https://example.com",
  "title": "Source title",
  "publisher": "Publisher",
  "publishedAt": "2026-01-01T00:00:00.000Z",
  "sourceType": "official",
  "excerpt": "Relevant excerpt",
  "summary": "Short summary",
  "stalenessRisk": "medium"
}
```

### POST /claims/:claimId/search-evidence

MVP may use mock search.

Request:

```json
{
  "query": "multi-agent debate improves reasoning evidence",
  "maxResults": 5
}
```

### POST /claims/:claimId/search-counter-evidence

Request:

```json
{
  "query": "multi-agent debate false consensus risk",
  "maxResults": 5
}
```

### POST /evidence/:evidenceId/assess

Run one or more model assessments.

Request:

```json
{
  "reviewerModelIds": ["model_1", "model_2"]
}
```

Response:

```json
{
  "data": {
    "assessments": []
  }
}
```

## Runs

### POST /projects/:projectId/runs

Start deliberation run.

Request:

```json
{
  "modelIds": ["model_1", "model_2", "model_3"],
  "maxRounds": 3,
  "mode": "mvp_deliberation"
}
```

Response:

```json
{
  "data": {
    "runId": "run_1",
    "status": "queued"
  }
}
```

### GET /runs/:runId

Return run status and recent events.

### GET /runs/:runId/events

SSE stream.

Event examples:

```text
event: run.started
data: {"runId":"run_1"}

event: model.call.completed
data: {"modelCallId":"call_1","taskId":"task_1"}
```

### POST /runs/:runId/cancel

Cancel run if queued or running.

## Tasks

### GET /projects/:projectId/tasks

Return research tasks.

### POST /tasks/:taskId/run

Run a single task.

### PATCH /tasks/:taskId

Update task status, objective, or priority.

## Decisions

### GET /projects/:projectId/decisions

Return decision records.

### GET /decisions/:decisionId

Return decision with trace graph.

Trace graph response:

```json
{
  "data": {
    "decision": {},
    "ideaVersion": {},
    "claims": [],
    "evidence": [],
    "critiques": [],
    "critiqueResponses": [],
    "modelVotes": [],
    "contextManifests": [],
    "rawEvents": []
  }
}
```

## Export

### GET /projects/:projectId/export.json

Return complete project export without secrets.

### GET /projects/:projectId/export.md

Return readable research report.

Markdown export sections:

```text
Project summary
Current idea version
Claims
Evidence commons
Critiques and responses
Idea evolution
Decisions
Open questions
Next actions
```

---

## Post-MVP endpoints

See [13-new-features.md](./13-new-features.md) for full documentation of these endpoints:

```text
# Phase 1 - Intelligence & Analysis
POST /evidence/cross-project-search
GET  /projects/related-projects/:projectId
GET  /projects/:projectId/evidence/stale
POST /evidence/:evidenceId/verify
POST /projects/:projectId/runs/compare
POST /claims/:claimId/dependencies
GET  /projects/:projectId/claims/dependencies
POST /projects/:projectId/literature-reviews
GET  /projects/:projectId/literature-reviews

# Phase 2 - Feedback & Collaboration
GET  /projects/:projectId/calibration
POST /calibration/evaluate
GET  /projects/portfolio
POST /projects/:projectId/annotations
GET  /projects/:projectId/annotations
PATCH /annotations/:annotationId
DELETE /annotations/:annotationId
GET  /projects/:projectId/presence
POST /projects/:projectId/presence
GET  /evidence/:evidenceId/provenance
POST /projects/:projectId/evaluation-criteria
GET  /projects/:projectId/evaluation-criteria
POST /evidence/:evidenceId/scores
GET  /evidence/:evidenceId/scores

# Phase 3 - Adversarial & Argument
GET  /projects/:projectId/robustness
GET  /projects/:projectId/citations
POST /projects/:projectId/argument-map
GET  /projects/:projectId/argument-maps
GET  /argument-maps/:argumentMapId
POST /projects/:projectId/reproducibility-pack

# Phase 4 - Real-time
GET  /projects/:projectId/events  (SSE)
```
