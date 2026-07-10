# 06 - UI Spec

## Frontend principles

The UI must expose structured research objects, not only chat messages.

Every model response should be expandable to show:

- associated claims
- evidence IDs used
- critiques created
- critiques received
- decision impact
- context manifest link if available



## Frontend state management

Use these exact choices. Do not substitute Jotai, Redux, MobX, or other state libraries in the MVP.

```text
Server/cache state: TanStack Query
Global UI state: Zustand
Form-local state: React Hook Form is allowed; plain React state is acceptable for simple forms.
URL state: Next.js route params and search params
```

Zustand stores to create:

```text
useRunStore
  - activeRunId
  - eventLog
  - selectedTimelineItemId
  - runConnectionStatus

useInspectorStore
  - selectedObjectType
  - selectedObjectId
  - inspectorOpen

Implemented: `InspectorPanel` drawer on project routes; claim rows and timeline critiques open the inspector. `useRunEvents` + `useRunStore` provide a single SSE event source for dashboard and timeline. `useModelSelectionStore` persists model IDs, loopMode, and searchProvider in sessionStorage. Start Run is disabled while `useUIStore.isRunInProgress` is true.
  - inspectorOpen

useModelSelectionStore
  - selectedModelIds
  - maxRounds
  - runMode
```

TanStack Query should own all server data:

```text
projects
project dashboard
idea versions
claims
evidence
models
tasks
decisions
```

## Routes

Use Next.js App Router.

```text
/                         Project list
/projects/new             Create project
/projects/[id]            Project dashboard
/projects/[id]/timeline   Deliberation timeline
/projects/[id]/evidence   Evidence Commons
/projects/[id]/ideas      Idea evolution
/projects/[id]/decisions  Decision ledger
/projects/[id]/tasks      Research tasks
/projects/[id]/runs/compare          Run Comparison Dashboard
/projects/[id]/literature-reviews    Literature Reviews
/projects/[id]/graph                 Citation Graph, Calibration, Robustness
/projects/[id]/claim-dependencies    Claim Dependency Graph
/settings/models          Model configuration
/settings/evaluation-criteria        Custom Evaluation Criteria
```

See [13-new-features.md](./13-new-features.md) for UI details on all post-MVP pages.

## Shared layout

Project pages should use a three-region layout:

```text
Top: project header + status + run controls
Left/center: main content
Right: project state panel / selected object inspector
```

## Project List

Columns:

```text
Title
Status
Current idea version
Latest decision status
Updated at
Actions
```

Actions:

```text
Open
Archive
Export JSON
Export Markdown
```

## Create Project Page

Fields:

```text
Title
Research goal
Initial idea
```

Buttons:

```text
Create Project
Create + Start Mock Run
```

Validation:

- title required
- goal required
- initial idea required

## Project Dashboard

Must show:

```text
Project title
Research goal
Current idea version card
Consensus status card
Evidence coverage card
Open critical issues card
Active tasks card
Latest decision card
Next best action card
```

Actions:

```text
Start Deliberation Run
Start Mock Run
Add Evidence
Extract Claims
Export Markdown
Export JSON
```

Run options modal:

```text
Model selection checkboxes
Max rounds input
Mode: mock | real
```

## Deliberation Timeline

Timeline event types:

```text
User input
Raw event
Claim extracted
Evidence added
Evidence assessed
Model review
Critique
Critique response
Idea revision
Consensus check
Decision record
```

Each item shows compact header:

```text
[type] [actor/model] [timestamp] [status]
```

Expandable body shows full JSON or formatted details.

Model review item must show:

```text
Model
Verdict
Confidence
Strengths
Weaknesses
Blocking issues
Supported claims
Unsupported claims
Suggested revisions
```

Critique item must show:

```text
Critic model
Target type and ID
Severity
Critique type
Text
Why it matters
Evidence IDs
Proposed fix
Status
```

## Evidence Commons

Table columns:

```text
Evidence ID
Claim ID
Title
Source type
Publisher
Discovered by
Reliability
Relevance
Status
Staleness risk
Actions
```

Filters:

```text
Claim
Status
Source type
Reliability
Relevance
Staleness risk
```

Actions:

```text
View
Assess
Find counter-evidence
Link to claim
Mark rejected
```

Evidence detail panel:

```text
Title
URL
Publisher
Published at
Retrieved at
Source type
Excerpt
Summary
Linked claims
Supports / contradicts relations
Assessments by models
Counter-evidence
Raw content reference
```

Manual add evidence modal fields:

```text
Claim selector
Source URL
Title
Publisher
Published date
Source type
Excerpt
Summary
Staleness risk
```

## Idea Evolution

Show version chain:

```text
v1 -> v2 -> v3 -> v4
```

Each version card:

```text
Version number
Title
Status
Description
Changes from previous
Created because of critique IDs
Created at
```

Detail view:

```text
Claims in this version
Resolved critiques
Remaining risks
Evidence impact
Model reviews for this version
```

Diff view:

```text
Added claims
Removed claims
Changed claims
New risks
Resolved risks
```

## Decision Ledger

Table columns:

```text
Decision ID
Status
Idea version
Created at
Final model vote summary
Next actions count
```

Decision detail:

```text
Decision status
Decision text
Why good
Why bad
Known weaknesses
Accepted evidence
Counter-evidence
Resolved critiques
Unresolved risks
Model final votes
Reopen conditions
Next actions
Trace graph links
```

## Tasks Page

Table columns:

```text
Task ID
Title
Role
Priority
Status
Assigned model
Claim
Created at
Updated at
Actions
```

Actions:

```text
Run task
Cancel task
Edit objective
Mark blocked
```

## Model Configuration Screen

Fields:

```text
Name
Provider: mock | openrouter | ollama | openai_compatible
Model name
Base URL
API key env var name
Context window
Preferred max input ratio
Output reserve ratio
Default temperature
Supports streaming
Supports JSON mode
Enabled
```

Actions:

```text
Add model
Edit model
Disable model
Test model
```

Security UI rule:

- Do not display actual API key values.
- Show only `apiKeyRef`.

## Run progress UI

When run starts, subscribe to SSE:

```text
GET /runs/:runId/events
```

Show live status:

```text
Current round
Current task
Current model call
Events list
Cancel run button
```

If run fails:

```text
Show error message
Show last successful event
Allow user to resume manually later
```

## Empty states

Project has no claims:

```text
No claims extracted yet. Run claim extraction or start a deliberation run.
```

Project has no evidence:

```text
No evidence has been added. Add manual evidence or run an evidence search task.
```

No decisions:

```text
No decision has been created yet. Run the deliberation loop until consensus or failure state.
```

## MVP UI acceptance

MVP UI must allow the user to:

1. Create a project.
2. Add or configure at least three models, including mock models.
3. Start a mock deliberation run.
4. Watch events stream.
5. Inspect claims.
6. Add manual evidence.
7. Inspect evidence assessments.
8. Inspect critiques and responses.
9. See idea v1 and v2.
10. Open final decision record.
