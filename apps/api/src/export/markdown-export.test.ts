import { describe, it, expect } from 'vitest';
import { generateMarkdownExport } from './markdown-export.js';

function createMockExportData(overrides: Record<string, any> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Project',
    goal: 'Test the export functionality',
    currentSynthesis: null,
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ideaVersions: [
      { id: 'v1', versionNumber: 1, title: 'Initial Idea', description: 'A test idea', status: 'under_review' },
    ],
    claims: [
      { id: 'c1', text: 'Test claim', type: 'technical', criticality: 'high', status: 'supported', confidence: 0.8, requiresEvidence: true },
    ],
    evidence: [
      { id: 'e1', title: 'Test evidence', sourceUrl: 'https://example.com', reliability: 'high', relevance: 'direct', status: 'accepted', excerpt: 'Test excerpt', isCounter: false, assessments: [], summary: null, publisher: null, sourceType: 'academic' },
      { id: 'e2', title: 'Counter evidence', sourceUrl: 'https://counter.com', reliability: 'medium', relevance: 'indirect', status: 'rejected', excerpt: null, isCounter: true, assessments: [], summary: null, publisher: null, sourceType: 'news' },
    ],
    modelReviews: [
      { id: 'r1', modelId: 'model-1', verdict: 'accept', confidence: 0.9, strengths: ['Strong evidence'], weaknesses: ['Minor gaps'], blockingIssues: [] },
    ],
    critiques: [
      { id: 'cr1', text: 'Needs more evidence', severity: 'high', status: 'accepted', critiqueType: 'evidence_gap', targetType: 'claim', targetId: 'c1', responses: [{ verdict: 'accept', reason: 'Agreed' }] },
    ],
    decisions: [
      { id: 'd1', decisionStatus: 'qualified_consensus', decisionText: 'Proceed with caution', whyGood: ['Strong foundation'], whyBad: ['Minor risks'], knownWeaknesses: [], unresolvedRisks: [], nextActions: ['Gather more data'], ideaVersion: { id: 'v1' } },
    ],
    tasks: [
      { id: 't1', title: 'Research task', role: 'researcher', status: 'done', priority: 'high', objective: 'Find evidence for claims' },
    ],
    knowledgeEdge: [
      { id: 'e1', fromType: 'evidence', fromId: 'e1', toType: 'claim', toId: 'c1', relation: 'supports' },
      { id: 'e2', fromType: 'evidence', fromId: 'e2', toType: 'claim', toId: 'c1', relation: 'contradicts' },
    ],
    ...overrides,
  } as any;
}

describe('generateMarkdownExport', () => {
  it('generates markdown with all sections', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('# Research Project: Test Project');
    expect(md).toContain('## Goal');
    expect(md).toContain('## Latest Idea Version');
    expect(md).toContain('## Claims');
    expect(md).toContain('## Evidence');
    expect(md).toContain('## Model Reviews');
    expect(md).toContain('## Critiques');
    expect(md).toContain('## Decisions');
    expect(md).toContain('## Tasks');
    expect(md).toContain('## Knowledge Graph');
  });

  it('escapes markdown special characters', () => {
    const data = createMockExportData({
      title: 'Project with *special* [chars] and #hash',
      claims: [{ id: 'c1', text: 'Claim with *bold* and [link]', type: 'technical', criticality: 'high', status: 'supported', confidence: 0.8, requiresEvidence: true }],
    });
    const md = generateMarkdownExport(data);
    expect(md).toContain('Project with \\*special\\* \\[chars\\] and \\#hash');
    expect(md).toContain('Claim with \\*bold\\* and \\[link\\]');
  });

  it('handles empty data gracefully', () => {
    const data = createMockExportData({
      ideaVersions: [],
      claims: [],
      evidence: [],
      modelReviews: [],
      critiques: [],
      decisions: [],
      tasks: [],
      knowledgeEdge: [],
    });
    const md = generateMarkdownExport(data);
    expect(md).toContain('# Research Project: Test Project');
    expect(md).toContain('## Claims');
    // Tasks and Knowledge Graph sections are only rendered when non-empty
    expect(md).not.toContain('## Tasks');
    expect(md).not.toContain('## Knowledge Graph');
  });

  it('includes task details', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('Research task');
    expect(md).toContain('researcher');
    expect(md).toContain('Find evidence for claims');
  });

  it('includes knowledge graph edge counts', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('supports: 1');
    expect(md).toContain('contradicts: 1');
  });

  it('truncates long excerpts', () => {
    const longExcerpt = 'x'.repeat(300);
    const data = createMockExportData({
      evidence: [{ id: 'e1', title: 'Test', sourceUrl: 'https://example.com', reliability: 'high', relevance: 'direct', status: 'accepted', excerpt: longExcerpt, isCounter: false, assessments: [], summary: null, publisher: null, sourceType: 'academic' }],
    });
    const md = generateMarkdownExport(data);
    // Excerpt should be truncated to 200 chars
    expect(md).toContain('x'.repeat(200));
    expect(md).not.toContain('x'.repeat(201));
  });

  it('includes supporting and counter evidence sections', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('Supporting Evidence (1)');
    expect(md).toContain('Counter-Evidence (1)');
  });

  it('includes model review details', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('Model model-1');
    expect(md).toContain('accept');
    expect(md).toContain('Strengths: Strong evidence');
  });

  it('includes critique details with responses', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('Needs more evidence');
    expect(md).toContain('Response: accept');
  });

  it('includes decision details', () => {
    const md = generateMarkdownExport(createMockExportData());
    expect(md).toContain('qualified_consensus');
    expect(md).toContain('Proceed with caution');
    expect(md).toContain('Why good: Strong foundation');
    expect(md).toContain('Next actions: Gather more data');
  });
});
