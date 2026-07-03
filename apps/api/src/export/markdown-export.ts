import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';

/** Exact payload shape returned by getExportData. */
type ExportData = Prisma.ResearchProjectGetPayload<{
  include: {
    ideaVersions: { orderBy: { versionNumber: 'desc' } };
    claims: true;
    evidence: { include: { assessments: true } };
    modelReviews: true;
    critiques: { include: { responses: true } };
    decisions: { include: { ideaVersion: true } };
    tasks: true;
  };
}> & { knowledgeEdge?: Array<{ id: string; fromType: string; fromId: string; toType: string; toId: string; relation: string }> };

/** Typed access helpers for Prisma JSON fields in export data. */
type JsonStringArray = string[] | null | undefined;

function joinJson(arr: JsonStringArray, sep = '; '): string {
  if (!Array.isArray(arr)) return '';
  return arr.join(sep);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*#[\]_]/g, '\\$&');
}

export function generateMarkdownExport(data: NonNullable<ExportData>): string {
  let md = `# Research Project: ${escapeMarkdown(data.title)}\n\n`;
  md += `_Exported at ${new Date().toISOString()}_\n\n`;
  md += `## Goal\n${escapeMarkdown(data.goal)}\n\n`;

  md += `## Latest Idea Version\n`;
  const latest = data.ideaVersions?.[0];
  if (latest) {
    md += `### ${escapeMarkdown(latest.title)}\n${escapeMarkdown(latest.description)}\n\n`;
  }

  md += `## Claims\n`;
  for (const c of data.claims ?? []) {
    md += `- [${c.status}] **${escapeMarkdown(c.text)}** (Type: ${c.type}, Criticality: ${c.criticality})\n`;
  }

  md += `\n## Evidence\n`;
  const supportingEvidence = (data.evidence ?? []).filter(e => !e.isCounter);
  const counterEvidence = (data.evidence ?? []).filter(e => e.isCounter);

  md += `### Supporting Evidence (${supportingEvidence.length})\n`;
  for (const e of supportingEvidence) {
    md += `- [${e.status}] **${escapeMarkdown(e.title)}** (Reliability: ${e.reliability})\n`;
    md += `  URL: ${e.sourceUrl || 'N/A'}\n`;
    if (e.excerpt) md += `  > ${escapeMarkdown(e.excerpt.slice(0, 200))}\n`;
    if (e.assessments?.length) md += `  Assessments: ${e.assessments.length} total\n`;
  }

  md += `\n### Counter-Evidence (${counterEvidence.length})\n`;
  for (const e of counterEvidence) {
    md += `- [${e.status}] **${escapeMarkdown(e.title)}** (Reliability: ${e.reliability})\n`;
    md += `  URL: ${e.sourceUrl || 'N/A'}\n`;
    if (e.excerpt) md += `  > ${escapeMarkdown(e.excerpt.slice(0, 200))}\n`;
  }

  if (data.modelReviews?.length) {
    md += `\n## Model Reviews (${data.modelReviews.length})\n`;
    for (const r of data.modelReviews) {
      md += `- Model ${r.modelId}: **${r.verdict}** (Confidence: ${r.confidence})\n`;
      if (Array.isArray(r.strengths)) md += `  - Strengths: ${joinJson(r.strengths as JsonStringArray)}\n`;
      if (Array.isArray(r.weaknesses)) md += `  - Weaknesses: ${joinJson(r.weaknesses as JsonStringArray)}\n`;
    }
  }

  if (data.critiques?.length) {
    md += `\n## Critiques (${data.critiques.length})\n`;
    for (const c of data.critiques) {
      md += `- [${c.severity}] ${escapeMarkdown(c.text)}\n`;
      md += `  Status: ${c.status} | Target: ${c.targetType} (${(c.targetId || '').slice(0, 8)})\n`;
      if (c.responses?.length) {
        for (const r of c.responses) {
          md += `  → Response: ${r.verdict} — ${escapeMarkdown((r.reason || '').slice(0, 100))}\n`;
        }
      }
    }
  }

  if (data.decisions?.length) {
    md += `\n## Decisions (${data.decisions.length})\n`;
    for (const d of data.decisions) {
      md += `- **${d.decisionStatus}**: ${escapeMarkdown(d.decisionText.slice(0, 200))}\n`;
      if (Array.isArray(d.whyGood)) md += `  - Why good: ${joinJson(d.whyGood as JsonStringArray)}\n`;
      if (Array.isArray(d.whyBad)) md += `  - Why bad: ${joinJson(d.whyBad as JsonStringArray)}\n`;
      if (Array.isArray(d.nextActions)) md += `  - Next actions: ${joinJson(d.nextActions as JsonStringArray)}\n`;
    }
  }

  if (data.tasks?.length) {
    md += `\n## Tasks (${data.tasks.length})\n`;
    for (const t of data.tasks) {
      md += `- [${t.status}] **${escapeMarkdown(t.title)}** (Role: ${t.role}, Priority: ${t.priority})\n`;
      if (t.objective) md += `  Objective: ${escapeMarkdown(t.objective.slice(0, 200))}\n`;
    }
  }

  if (data.knowledgeEdge?.length) {
    const edgeCounts = new Map<string, number>();
    for (const e of data.knowledgeEdge) {
      edgeCounts.set(e.relation, (edgeCounts.get(e.relation) || 0) + 1);
    }
    md += `\n## Knowledge Graph (${data.knowledgeEdge.length} edges)\n`;
    for (const [relation, count] of edgeCounts) {
      md += `- ${relation}: ${count}\n`;
    }
  }

  return md;
}
