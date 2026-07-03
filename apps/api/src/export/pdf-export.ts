import PDFDocument from 'pdfkit';

interface ExportData {
  title: string;
  goal: string;
  ideaVersions: Array<{ title: string; description: string; versionNumber: number; status: string }>;
  claims: Array<{ text: string; type: string; criticality: string; status: string; confidence?: number }>;
  evidence: Array<{ title: string; sourceUrl?: string; reliability: string; relevance: string; status: string; isCounter: boolean; excerpt?: string }>;
  modelReviews: Array<{ modelId: string; verdict: string; confidence?: number; strengths?: string[]; weaknesses?: string[] }>;
  critiques: Array<{ text: string; severity: string; status: string; whyItMatters?: string }>;
  decisions: Array<{ decisionStatus: string; decisionText: string; whyGood?: string[]; whyBad?: string[] }>;
}

export function generatePdfExport(data: ExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title page
    doc.fontSize(24).font('Helvetica-Bold').text(data.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Exported: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(14).font('Helvetica-Bold').text('Goal');
    doc.fontSize(11).font('Helvetica').text(data.goal);
    doc.moveDown();

    // Latest Idea Version
    const latest = data.ideaVersions?.[0];
    if (latest) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Latest Idea Version');
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').text(latest.title);
      doc.fontSize(10).font('Helvetica').text(`Version ${latest.versionNumber} · ${latest.status}`);
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(latest.description);
    }

    // Claims
    if (data.claims?.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text(`Claims (${data.claims.length})`);
      doc.moveDown(0.5);
      for (const c of data.claims) {
        doc.fontSize(10).font('Helvetica-Bold').text(`[${c.status}] ${c.text}`);
        doc.fontSize(8).font('Helvetica').text(`Type: ${c.type} · Criticality: ${c.criticality}${c.confidence != null ? ` · Confidence: ${(c.confidence * 100).toFixed(0)}%` : ''}`);
        doc.moveDown(0.3);
      }
    }

    // Evidence
    if (data.evidence?.length > 0) {
      doc.addPage();
      const supporting = data.evidence.filter(e => !e.isCounter);
      const counter = data.evidence.filter(e => e.isCounter);

      doc.fontSize(16).font('Helvetica-Bold').text(`Supporting Evidence (${supporting.length})`);
      doc.moveDown(0.5);
      for (const e of supporting) {
        doc.fontSize(10).font('Helvetica-Bold').text(`[${e.status}] ${e.title}`);
        doc.fontSize(8).font('Helvetica').text(`Reliability: ${e.reliability} · Relevance: ${e.relevance}`);
        if (e.sourceUrl) doc.fontSize(8).font('Helvetica').text(e.sourceUrl);
        doc.moveDown(0.3);
      }

      if (counter.length > 0) {
        doc.moveDown();
        doc.fontSize(16).font('Helvetica-Bold').text(`Counter-Evidence (${counter.length})`);
        doc.moveDown(0.5);
        for (const e of counter) {
          doc.fontSize(10).font('Helvetica-Bold').text(`[${e.status}] ${e.title}`);
          doc.fontSize(8).font('Helvetica').text(`Reliability: ${e.reliability} · Relevance: ${e.relevance}`);
          doc.moveDown(0.3);
        }
      }
    }

    // Reviews
    if (data.modelReviews?.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text(`Model Reviews (${data.modelReviews.length})`);
      doc.moveDown(0.5);
      for (const r of data.modelReviews) {
        doc.fontSize(10).font('Helvetica-Bold').text(`Model ${r.modelId}: ${r.verdict}${r.confidence != null ? ` (Confidence: ${(r.confidence * 100).toFixed(0)}%)` : ''}`);
        if (r.strengths?.length) doc.fontSize(8).font('Helvetica').text(`Strengths: ${r.strengths.join('; ')}`);
        if (r.weaknesses?.length) doc.fontSize(8).font('Helvetica').text(`Weaknesses: ${r.weaknesses.join('; ')}`);
        doc.moveDown(0.5);
      }
    }

    // Critiques
    if (data.critiques?.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text(`Critiques (${data.critiques.length})`);
      doc.moveDown(0.5);
      for (const c of data.critiques) {
        doc.fontSize(10).font('Helvetica-Bold').text(`[${c.severity}] ${c.text}`);
        doc.fontSize(8).font('Helvetica').text(`Status: ${c.status}`);
        if (c.whyItMatters) doc.fontSize(8).font('Helvetica').text(`Why it matters: ${c.whyItMatters}`);
        doc.moveDown(0.3);
      }
    }

    // Decisions
    if (data.decisions?.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text(`Decisions (${data.decisions.length})`);
      doc.moveDown(0.5);
      for (const d of data.decisions) {
        doc.fontSize(10).font('Helvetica-Bold').text(d.decisionStatus);
        doc.fontSize(10).font('Helvetica').text(d.decisionText);
        if (d.whyGood?.length) doc.fontSize(8).font('Helvetica').text(`Strengths: ${d.whyGood.join('; ')}`);
        if (d.whyBad?.length) doc.fontSize(8).font('Helvetica').text(`Weaknesses: ${d.whyBad.join('; ')}`);
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}
