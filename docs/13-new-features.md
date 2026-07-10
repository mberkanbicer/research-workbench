# 13 - New Features

This document covers all features added after the MVP, organized by phase.

---

## Phase 1: Intelligence & Analysis Features

### Semantic Search over Past Projects

Cross-project search using pgvector embeddings. When you need evidence for a claim, the system searches across all projects for semantically similar evidence, claims, and critiques.

**Data model additions:**

```text
Evidence.vectorEmbedding: Unsupported("vector(1536)") nullable
Evidence.embeddingGeneratedAt: datetime nullable
```

**API:**

```text
POST /evidence/cross-project-search
Request:  { query: string, projectId: string, maxResults?: number }
Response: { data: { results: [{ id, title, summary, projectId, projectTitle, sourceType, reliability, relevance, similarity }] } }

GET /projects/related-projects/:projectId
Response: { data: [{ id, title, goal, sharedEvidenceCount, sharedClaimCount, status }] }
```

**UI:** "Related Projects" tab on the project dashboard. Evidence Commons has a "Search Across Projects" button.

---

### Evidence Staleness Monitor

Tracks when evidence might be outdated based on source type and publication date. Evidence is automatically flagged for re-validation.

**Data model additions:**

```text
Evidence.lastVerifiedAt: datetime nullable
Evidence.reVerificationRequestedAt: datetime nullable
```

**Logic:**

```text
stalenessRisk computation:
  sourceType in [company, blog, forum, news] AND publishedAt > 180 days ago -> high
  sourceType in [company, blog, forum, news] AND publishedAt > 90 days ago  -> medium
  sourceType = benchmark AND publishedAt > 365 days ago                    -> high
  sourceType = benchmark AND publishedAt > 180 days ago                    -> medium
  sourceType in [official, academic, government] AND publishedAt > 730 days -> medium
```

**API:**

```text
GET /projects/:projectId/evidence/stale
Response: { data: { stale: [...], stats: { total, needsAttention } } }

POST /evidence/:evidenceId/verify
Response: { data: { evidence: { ... lastVerifiedAt: now } } }
```

**UI:** "Stale Evidence" tab in Evidence Commons. Green/amber/red staleness badges on evidence rows.

---

### Run Comparison Dashboard

Side-by-side comparison of two deliberation runs to see how results differ across model configurations, round counts, or evidence sets.

**API:**

```text
POST /projects/:projectId/runs/compare
Request:  { runId1: string, runId2: string }
Response: { data: { run1: { id, status, startedAt, finishedAt, eventCount, claimCount, evidenceCount, critiqueCount, decisions }, run2: {...}, differences: { claimOverlap, evidenceOverlap, critiqueOverlap, decisionDifference } } }
```

**UI:** "Compare Runs" page at `/projects/[id]/runs/compare`. Select two runs from dropdowns. Side-by-side cards show counts and overlap metrics.

---

### Claim Dependency Graph

Directed graph of claim dependencies. Shows which claims depend on which, critical path analysis, and whether dependency chains have supporting evidence.

**Data model additions:**

```text
ClaimDependency
  id: uuid
  projectId: uuid
  claimId: uuid
  dependsOnClaimId: uuid
  dependencyType: evidence_for | logical_prerequisite | assumption支撑 | contradicting
  createdAt: datetime

  @@unique([claimId, dependsOnClaimId])
```

**API:**

```text
POST /claims/:claimId/dependencies
Request:  { dependsOnClaimId: string, dependencyType: string }
Response: { data: { dependency: {...} } }

GET /projects/:projectId/claims/dependencies
Response: { data: { nodes: [...], edges: [...], criticalPath: [...] } }
```

**UI:** "Claim Dependencies" tab on the project page. Visual graph with critical path highlighted in red.

---

### Automated Literature Review Mode

Generates structured literature reviews from papers, abstracts, and web sources. Outputs key findings, evidence quality, research gaps, and methodology assessment.

**Data model additions:**

```text
LiteratureReview
  id: uuid
  projectId: uuid
  query: text
  status: pending | running | completed | failed
  reviewType: quick | comprehensive | systematic
  sources: json          -- [{title, authors, year, url, excerpt, reliability}]
  keyFindings: json      -- [{finding, confidence, sourceIndices}]
  evidenceQuality: json  -- [{sourceIndex, assessment, issues}]
  researchGaps: json     -- [{gap, description, suggestedDirection}]
  methodologyAssessment: text nullable
  generatedByModelId: uuid nullable
  createdAt: datetime
  completedAt: datetime nullable
```

**API:**

```text
POST /projects/:projectId/literature-reviews
Request:  { query: string, reviewType?: "quick"|"comprehensive"|"systematic", maxSources?: number }
Response: { data: { reviewId: string, status: "pending" } }

GET /projects/:projectId/literature-reviews
Response: { data: LiteratureReview[] }
```

**UI:** "Literature Reviews" page. Create new review form with query and type selector. Results show sources, findings, gaps, and quality assessment in expandable cards.

---

## Phase 2: Feedback & Collaboration Features

### Confidence Calibration Feedback Loop

Tracks whether the system's stated confidence matches actual accuracy over time. Provides Brier score and calibration metrics per project and per claim type.

**Data model additions:**

```text
ClaimConfidenceHistory
  id: uuid
  claimId: uuid
  projectId: uuid
  confidence: float
  predictedOutcome: supported | contradicted
  actualOutcome: supported | contradicted | inconclusive nullable
  evaluatedAt: datetime nullable
  brierScore: float nullable
  createdAt: datetime
```

**API:**

```text
GET /projects/:projectId/calibration
Response: { data: {
  overall: { averageCalibrationError, brierScore, totalPredictions, evaluatedCount, wellCalibrated, overconfident, underconfident },
  byType: [{ type, averageError, brierScore, count }]
}}

POST /calibration/evaluate
Request:  { claimId: string, actualOutcome: string }
Response: { data: { history: {...}, brierScore, accuracy, calibrationError } }
```

**UI:** "Calibration" tab on the project page. Overall Brier score, calibration curve chart, breakdown by claim type.

---

### Multi-Project Portfolio View

Aggregated view across all projects. Shows total claims, evidence, active projects, and per-project metrics in a sortable table.

**API:**

```text
GET /projects/portfolio
Response: { data: {
  totalProjects, activeProjects, completedProjects, totalClaims, totalEvidence, totalDecisions,
  projects: [{ id, title, status, claimCount, evidenceCount, decisionCount, latestDecision, updatedAt }]
}}
```

**UI:** "Portfolio" link in the header. Sortable table with project metrics. Total counts in header cards.

---

### Collaborative Annotations

Threaded comments on any entity (claims, evidence, critiques, decisions). Supports mentions, resolution tracking, and edit/delete with audit trail.

**Data model additions:**

```text
Annotation
  id: uuid
  projectId: uuid
  entityType: claim | evidence | critique | decision | idea_version | project
  entityId: uuid
  author: text
  content: text
  parentId: uuid nullable         -- for threaded replies
  mentions: json                  -- ["@user1", "@user2"]
  resolved: boolean
  editedAt: datetime nullable
  createdAt: datetime

UserPresence
  id: uuid
  userId: text
  projectId: uuid
  entityType: string nullable
  entityId: uuid nullable
  status: active | idle | away
  lastSeenAt: datetime
  createdAt: datetime
```

**API:**

```text
POST /projects/:projectId/annotations
Request:  { entityType, entityId, content, parentId?, mentions? }
Response: { data: { annotation: {...} } }

GET /projects/:projectId/annotations?entityType=&entityId=
Response: { data: Annotation[] }

PATCH /annotations/:annotationId
Request:  { content?, resolved? }

DELETE /annotations/:annotationId

GET /projects/:projectId/presence
Response: { data: UserPresence[] }

POST /projects/:projectId/presence
Request:  { entityType?, entityId?, status? }
```

**UI:** "Annotations" section in the InspectorPanel detail views. Add comment form with threaded replies. Presence indicator in project header shows active users.

---

### Evidence Chain Provenance

Full audit trail from decision to raw evidence. Traces the chain: Decision → Evidence → EvidenceAssessment → ModelCall → ContextManifest → raw events.

**API:**

```text
GET /evidence/:evidenceId/provenance
Response: { data: {
  evidence: { id, title, sourceUrl, sourceType, reliability, status },
  assessments: [{ id, reliability, relevance, interpretationVerdict, finalVerdict, reviewer: { name, model } }],
  modelCalls: [{ id, model, provider, responseText, usage, status, createdAt }],
  contextManifests: [{ id, model, tokenBudget, tokenUsed, retrievalReason }],
  rawEvents: [{ id, type, payload, createdBy, createdAt }],
  claims: [{ id, text, status, confidence }]
}}
```

**UI:** "Provenance" button on evidence detail panel. Full chain displayed in an expandable trace view.

---

### Custom Evaluation Criteria

User-defined criteria for evaluating evidence and claims. Each criterion has a name, description, scale (boolean, numeric, Likert), and weight. Scores are linked to evidence via `EvidenceCustomScore`.

**Data model additions:**

```text
EvaluationCriteria
  id: uuid
  projectId: uuid
  name: text
  description: text nullable
  scale: boolean | numeric | likert3 | likert5
  weight: float
  createdAt: datetime

EvidenceCustomScore
  id: uuid
  evidenceId: uuid
  criteriaId: uuid
  value: json           -- true/false, number, or Likert label
  scoredBy: text        -- user ID or "model:<id>"
  scoredAt: datetime

  @@unique([evidenceId, criteriaId])
```

**API:**

```text
POST /projects/:projectId/evaluation-criteria
Request:  { name, description?, scale, weight }
Response: { data: { criteria: {...} } }

GET /projects/:projectId/evaluation-criteria

POST /evidence/:evidenceId/scores
Request:  { criteriaId: string, value: any }
Response: { data: { score: {...} } }

GET /evidence/:evidenceId/scores
Response: { data: { scores: [{ criteria, value, scoredBy, scoredAt }] } }
```

**UI:** "Evaluation Criteria" page under Settings. Evidence detail panel shows custom scores with criteria names.

---

## Phase 3: Adversarial & Argument Features

### Adversarial Robustness Score

Stress-tests claims by searching for contradictions and computing a robustness score (0-100). Includes breakdown by challenge type.

**API:**

```text
GET /projects/:projectId/robustness
Response: { data: {
  overall: { score, totalClaims, challenged, unchallenged, averageChallengesPerClaim },
  byChallengeType: [{ type, count, averageSeverity }],
  claimBreakdown: [{ claimId, text, score, status, challengeCount, challenges: [{type, text, severity}] }],
  recommendations: [string]
}}

GET /projects/:projectId/citations
Response: { data: {
  claims: [{ id, text, type, citationCount }],
  evidence: [{ id, title, citationCount }],
  totalCitations
}}
```

**UI:** "Robustness" tab on the project page. Overall score gauge, challenge breakdown bar chart, claim-level scores, recommendations.

---

### Argument Mapping Export (Toulmin Model)

Generates structured argument maps following Toulmin's model: Claim, Evidence (Data), Warrant, Backing, Qualifier, Rebuttal.

**Data model additions:**

```text
ArgumentMap
  id: uuid
  projectId: uuid
  title: text
  nodes: json           -- [{id, type, text, evidenceIds, warrant?, rebuttal?}]
  edges: json           -- [{from, to, type}]
  format: toulmin
  createdAt: datetime
```

**API:**

```text
POST /projects/:projectId/argument-map
Request:  { claimIds?: string[] }
Response: { data: { argumentMap: { id, nodes, edges } } }

GET /projects/:projectId/argument-maps

GET /argument-maps/:argumentMapId
```

**UI:** "Argument Map" button on project page. Visual representation of the Toulmin structure with colored nodes for each element type.

---

### Reproducibility Pack

Package everything needed to reproduce a project's results: data snapshot, model configurations, prompt templates, and a verification script.

**API:**

```text
POST /projects/:projectId/reproducibility-pack
Response: { data: {
  dataSnapshot: { claims, evidence, critiques, decisions },
  modelConfigs: [{ name, provider, model, contextWindow, temperature }],
  promptVersions: [{ key, hash, template }],
  verificationScript: string,
  createdAt
}}
```

**UI:** "Export Reproducibility Pack" button on the project page. Downloads a JSON file with all components.

---

## Phase 4: Real-time Collaboration

### Live Presence & SSE Events

Tracks which users are viewing a project. Broadcasts presence changes and annotation events via Server-Sent Events.

**API:**

```text
GET /projects/:projectId/events
Response: SSE stream with event types:
  presence.update  -- { userId, status, entityType, entityId }
  annotation.add   -- { annotation }
  annotation.update -- { annotation }
  annotation.delete -- { annotationId }
```

**UI:** Presence indicator in the project header. Real-time annotation updates without page refresh.

---

## Phase 5: LaTeX Editor & Live Preview

### LaTeX Editor with Live Preview

Full-featured LaTeX editor for writing research papers, documentation, reports, books, and book chapters. Features a split-pane interface with syntax-highlighted code editing and real-time preview.

**Features:**
- Syntax highlighting for LaTeX commands, environments, and math
- Live HTML preview of LaTeX content
- Multiple document templates (Article, Report, Book, Presentation, Letter, Blank)
- Toolbar for common LaTeX operations (bold, italic, math, figures, tables, lists)
- Document management (create, edit, delete)
- PDF compilation and download
- Export to .tex file
- Metadata extraction from LaTeX content

**Data model additions:**

```text
LaTeXDocument
  id: uuid
  projectId: uuid
  title: text
  content: text
  template: text (article | report | book | beamer | letter | blank)
  metadata: json (author, date, abstract, keywords)
  compiledPdf: text (base64 encoded PDF)
  status: text (draft | compiled | error)
  lastError: text nullable
  createdAt: datetime
  updatedAt: datetime
```

**API:**

```text
GET /projects/:projectId/latex/documents
Response: { data: LaTeXDocument[] }

POST /projects/:projectId/latex/documents
Request:  { title: string, template?: string, metadata?: { author?, abstract?, keywords? } }
Response: { data: LaTeXDocument }

GET /latex/documents/:documentId
Response: { data: LaTeXDocument }

PATCH /latex/documents/:documentId
Request:  { title?, content?, template?, metadata? }
Response: { data: LaTeXDocument }

DELETE /latex/documents/:documentId
Response: { data: { success: true } }

POST /latex/documents/:documentId/compile
Response: { data: { success: boolean, pdf?: string, error?: string, warnings?: string[] } }

POST /latex/compile-preview
Request:  { content: string }
Response: { data: { success: boolean, pdf?: string, error?: string, warnings?: string[] } }

GET /latex/templates
Response: { data: [{ id, name, description }] }

POST /latex/documents/:documentId/extract-metadata
Response: { data: { title?, author?, abstract?, sections: string[], figures: number, tables: number, equations: number, citations: number } }
```

**UI:** "LaTeX Editor" link in project navigation. Split-pane interface with:
- Left panel: Document list with status indicators
- Center panel: Code editor with syntax highlighting, line numbers, and toolbar
- Right panel: Live preview with HTML rendering or PDF viewer
- Resizable split panes for flexible layout

**Templates:**
- Article: Standard academic article with abstract
- Report: Longer document with chapters
- Book: Full book structure
- Beamer: Presentation slides
- Letter: Formal letter format
- Blank: Minimal starting template

---

## Phase 6: Collaboration & Document Management

### Collaboration Permissions

Role-based access control for document collaboration: viewer, editor, admin roles with granular permissions.

**Data model additions:**

```text
DocumentPermission
  id: uuid
  documentId: uuid
  userId: uuid
  role: string (viewer | editor | admin)
  grantedBy: uuid nullable
  createdAt: datetime

  @@unique([documentId, userId])
```

**Permission Matrix:**

| Action | Viewer | Editor | Admin |
|--------|--------|--------|-------|
| View content | ✅ | ✅ | ✅ |
| Add comments | ✅ | ✅ | ✅ |
| Edit content | ❌ | ✅ | ✅ |
| Compile | ❌ | ✅ | ✅ |
| Manage permissions | ❌ | ❌ | ✅ |
| Delete document | ❌ | ❌ | ✅ |

**API:**

```text
GET /latex/documents/:documentId/permissions
POST /latex/documents/:documentId/permissions
PATCH /latex/documents/:documentId/permissions/:userId
DELETE /latex/documents/:documentId/permissions/:userId
GET /latex/documents/:documentId/permissions/check
```

---

### Version History & Diff View

Track all changes to LaTeX documents with ability to view, compare, and restore previous versions.

**Data model additions:**

```text
DocumentVersion
  id: uuid
  documentId: uuid
  version: int
  content: text
  title: text
  metadata: json nullable
  authorId: uuid nullable
  message: text nullable
  createdAt: datetime

  @@unique([documentId, version])
```

**API:**

```text
GET /latex/documents/:documentId/versions
GET /latex/documents/:documentId/versions/:version
POST /latex/documents/:documentId/versions
POST /latex/documents/:documentId/versions/:version/restore
GET /latex/documents/:documentId/versions/compare?v1=1&v2=2
```

---

### Real-time Chat/Comments

Threaded conversations about specific parts of a LaTeX document.

**Data model additions:**

```text
DocumentComment
  id: uuid
  documentId: uuid
  userId: uuid nullable
  content: text
  parentId: uuid nullable
  startOffset: int
  endOffset: int
  resolved: boolean
  createdAt: datetime
  updatedAt: datetime
```

**API:**

```text
GET /latex/documents/:documentId/comments
POST /latex/documents/:documentId/comments
PATCH /latex/documents/:documentId/comments/:commentId
DELETE /latex/documents/:documentId/comments/:commentId
POST /latex/documents/:documentId/comments/:commentId/resolve
```

---

### Reference Manager Integration

Import/export references from Zotero, Mendeley, and BibTeX files.

**Data model additions:**

```text
Reference
  id: uuid
  projectId: uuid
  title: text
  authors: text[]
  year: int nullable
  journal: text nullable
  volume: text nullable
  pages: text nullable
  doi: text nullable
  url: text nullable
  abstract: text nullable
  citationKey: text
  type: text
  tags: text[]
  metadata: json nullable
  source: text nullable
  createdAt: datetime
  updatedAt: datetime

  @@unique([projectId, citationKey])
```

**API:**

```text
GET /projects/:projectId/references
POST /projects/:projectId/references
POST /projects/:projectId/references/import
GET /projects/:projectId/references/export
GET /projects/:projectId/references/:id
DELETE /projects/:projectId/references/:id
```

---

### Templates Marketplace

Browse, share, and use LaTeX templates for different document types.

**Data model additions:**

```text
LaTeXTemplate
  id: uuid
  name: text
  description: text nullable
  category: text
  content: text
  authorId: uuid nullable
  isPublic: boolean
  downloads: int
  rating: float nullable
  tags: text[]
  metadata: json nullable
  createdAt: datetime
  updatedAt: datetime
```

**API:**

```text
GET /latex/templates/marketplace
GET /latex/templates/marketplace/categories
GET /latex/templates/marketplace/:id
POST /latex/templates/marketplace
POST /latex/templates/marketplace/:id/use
DELETE /latex/templates/marketplace/:id
```

---

## New Frontend Routes

```text
/projects/[id]/runs/compare          Run Comparison Dashboard
/projects/[id]/literature-reviews    Literature Reviews
/projects/[id]/graph                 Citation Graph, Calibration, Robustness, Argument Maps
/projects/[id]/claim-dependencies    Claim Dependency Graph
/projects/[id]/references            Reference Manager (BibTeX/RIS import, search, export)
/projects/[id]/analytics             Research Analytics
/projects/[id]/latex                 LaTeX Editor with Live Preview
/settings/evaluation-criteria        Custom Evaluation Criteria
```

---

## Database Migrations

All new models require a migration:

```bash
cd apps/api
npx prisma migrate dev --name add_new_features
npx prisma generate
```

Models added in this phase:

```text
ClaimDependency
LiteratureReview
Annotation
EvaluationCriteria
EvidenceCustomScore
UserPresence
ArgumentMap
ClaimConfidenceHistory (via EventService, not a Prisma model)
LaTeXDocument
DocumentPermission
DocumentVersion
DocumentComment
LaTeXTemplate
Reference
```

---

## Testing

### API Tests

```bash
cd apps/api
npx vitest run src/routes/routes.test.ts        # 47 existing + new feature tests
npx vitest run src/routes/routes-extra.test.ts   # 7 tests
npx vitest run src/routes/routes-new-features.test.ts  # 51 new feature tests
```

Total: 105 route tests covering all new endpoints.

### Frontend Tests

```bash
cd apps/web
npx vitest run src/__tests__/smoke.test.tsx      # 7 tests
```

---

## Demo Data

Seed command populates 3 demo projects with rich data:

```bash
cd apps/api
npx ts-node prisma/seed.ts
```

Each project includes:

- Claims, evidence, critiques, decisions
- Annotations and evaluation criteria
- Literature reviews and argument maps
- 6 realistic model calls per project (LLM conversations with expandable details)

Demo projects:

1. **NER for Low-Resource Languages** -- NLP research with field study evidence
2. **Direct Air Capture Feasibility** -- climate tech with benchmark data
3. **AI Rare Disease Diagnosis** -- medical AI with clinical trial evidence
