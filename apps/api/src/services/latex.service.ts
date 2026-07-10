import { prisma } from '../prisma.js';
import crypto from 'crypto';

export interface LaTeXDocumentData {
  id: string;
  projectId: string;
  title: string;
  content: string;
  template: string;
  metadata: Record<string, unknown> | null;
  compiledPdf: string | null;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompileResult {
  success: boolean;
  pdf?: string; // Base64 encoded PDF
  error?: string;
  warnings?: string[];
}

// LaTeX templates for different document types
export const LATEX_TEMPLATES: Record<string, string> = {
  article: `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{\\textbf{TITLE}}
\\author{\\textsc{AUTHOR}}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
ABSTRACT
\\end{abstract}

\\tableofcontents
\\newpage

CONTENT

\\end{document}`,

  report: `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{\\textbf{TITLE}}
\\author{\\textsc{AUTHOR}}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents
\\listoffigures
\\listoftables

CONTENT

\\end{document}`,

  book: `\\documentclass[12pt,a4paper]{book}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{\\textbf{TITLE}}
\\author{\\textsc{AUTHOR}}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

CONTENT

\\end{document}`,

  beamer: `\\documentclass{beamer}
\\usetheme{Madrid}
\\usecolortheme{default}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}

\\title{TITLE}
\\author{AUTHOR}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Outline}
\\tableofcontents
\\end{frame}

CONTENT

\\end{document}`,

  letter: `\\documentclass[12pt]{letter}
\\usepackage[utf8]{inputenc}
\\usepackage{hyperref}

\\address{YOUR ADDRESS}
\\signature{YOUR NAME}

\\begin{document}

\\begin{letter}{RECIPIENT}

\\opening{Dear Sir/Madam,}

CONTENT

\\closing{Sincerely,}

\\end{letter}
\\end{document}`,

  blank: `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\begin{document}

CONTENT

\\end{document}`
};

export const latexService = {
  /**
   * Create a new LaTeX document
   */
  async createDocument(
    projectId: string,
    title: string,
    template: string = 'article',
    metadata?: Record<string, unknown>
  ): Promise<LaTeXDocumentData> {
    const templateContent = LATEX_TEMPLATES[template] || LATEX_TEMPLATES.article;
    const content = templateContent
      .replace('TITLE', title)
      .replace('AUTHOR', (metadata?.author as string) || 'Author')
      .replace('ABSTRACT', (metadata?.abstract as string) || 'Abstract goes here.')
      .replace('CONTENT', '% Your content here\n\n');

    const doc = await prisma.laTeXDocument.create({
      data: {
        projectId,
        title,
        content,
        template,
        metadata: (metadata || {}) as any,
        status: 'draft'
      }
    });

    return doc as unknown as LaTeXDocumentData;
  },

  /**
   * Get a LaTeX document by ID
   */
  async getDocument(docId: string): Promise<LaTeXDocumentData | null> {
    const doc = await prisma.laTeXDocument.findUnique({
      where: { id: docId }
    });
    return doc as unknown as LaTeXDocumentData | null;
  },

  /**
   * Get all LaTeX documents for a project
   */
  async getProjectDocuments(projectId: string): Promise<LaTeXDocumentData[]> {
    const docs = await prisma.laTeXDocument.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' }
    });
    return docs as unknown as LaTeXDocumentData[];
  },

  /**
   * Update a LaTeX document
   */
  async updateDocument(
    docId: string,
    updates: {
      title?: string;
      content?: string;
      template?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<LaTeXDocumentData> {
    const doc = await prisma.laTeXDocument.update({
      where: { id: docId },
      data: {
        ...updates,
        metadata: updates.metadata as any,
        status: 'draft', // Reset status when content changes
        lastError: null
      }
    });
    return doc as unknown as LaTeXDocumentData;
  },

  /**
   * Delete a LaTeX document
   */
  async deleteDocument(docId: string): Promise<void> {
    await prisma.laTeXDocument.delete({
      where: { id: docId }
    });
  },

  /**
   * Compile LaTeX document to PDF
   * NOTE: This is a mock implementation. In production, you would:
   * 1. Use a LaTeX compiler like pdflatex or xelatex
   * 2. Run it in a sandboxed environment
   * 3. Return the compiled PDF
   */
  async compileDocument(docId: string): Promise<CompileResult> {
    const doc = await prisma.laTeXDocument.findUnique({
      where: { id: docId }
    });

    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    try {
      // Validate LaTeX syntax (basic checks)
      const content = doc.content;
      const warnings: string[] = [];

      // Check for balanced braces
      let braceCount = 0;
      for (const char of content) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount < 0) {
          return {
            success: false,
            error: 'Unbalanced braces: extra closing brace found'
          };
        }
      }
      if (braceCount !== 0) {
        return {
          success: false,
          error: `Unbalanced braces: ${braceCount} unclosed brace(s)`
        };
      }

      // Check for balanced environments
      const envRegex = /\\begin\{(\w+)\}/g;
      const endRegex = /\\end\{(\w+)\}/g;
      const beginEnvs: string[] = [];
      let match;

      while ((match = envRegex.exec(content)) !== null) {
        beginEnvs.push(match[1]);
      }

      while ((match = endRegex.exec(content)) !== null) {
        const envName = match[1];
        const lastBegin = beginEnvs.lastIndexOf(envName);
        if (lastBegin === -1) {
          return {
            success: false,
            error: `Unexpected \\end{${envName}} without matching \\begin`
          };
        }
        beginEnvs.splice(lastBegin, 1);
      }

      if (beginEnvs.length > 0) {
        return {
          success: false,
          error: `Missing \\end for environment(s): ${beginEnvs.join(', ')}`
        };
      }

      // Generate mock PDF (in reality, this would be a real PDF)
      const mockPdf = this.generateMockPdf(content, doc.title);

      // Update document with compiled PDF
      await prisma.laTeXDocument.update({
        where: { id: docId },
        data: {
          compiledPdf: mockPdf,
          status: 'compiled',
          lastError: null
        }
      });

      return {
        success: true,
        pdf: mockPdf,
        warnings
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';

      await prisma.laTeXDocument.update({
        where: { id: docId },
        data: {
          status: 'error',
          lastError: errorMessage
        }
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  },

  /**
   * Generate a mock PDF for preview purposes
   * In production, this would be a real compiled PDF
   */
  generateMockPdf(content: string, title: string): string {
    // This is a placeholder - in production, you'd use a real LaTeX compiler
    // For now, return a base64 encoded placeholder PDF
    const pdfPlaceholder = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(${title}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000340 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
409
%%EOF`;

    return Buffer.from(pdfPlaceholder).toString('base64');
  },

  /**
   * Get available templates
   */
  getTemplates(): Array<{ id: string; name: string; description: string }> {
    return [
      { id: 'article', name: 'Article', description: 'Standard academic article format' },
      { id: 'report', name: 'Report', description: 'Longer document with chapters' },
      { id: 'book', name: 'Book', description: 'Full book with front/back matter' },
      { id: 'beamer', name: 'Presentation', description: 'LaTeX Beamer slides' },
      { id: 'letter', name: 'Letter', description: 'Formal letter format' },
      { id: 'blank', name: 'Blank', description: 'Minimal starting template' }
    ];
  },

  /**
   * Extract metadata from LaTeX content
   */
  extractMetadata(content: string): {
    title?: string;
    author?: string;
    abstract?: string;
    sections: string[];
    figures: number;
    tables: number;
    equations: number;
    citations: number;
  } {
    const titleMatch = content.match(/\\title\{([^}]+)\}/);
    const authorMatch = content.match(/\\author\{([^}]+)\}/);
    const abstractMatch = content.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);

    const sections: string[] = [];
    const sectionRegex = /\\(?:section|subsection|subsubsection)\{([^}]+)\}/g;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      sections.push(match[1]);
    }

    return {
      title: titleMatch?.[1],
      author: authorMatch?.[1],
      abstract: abstractMatch?.[1]?.trim(),
      sections,
      figures: (content.match(/\\begin\{figure\}/g) || []).length,
      tables: (content.match(/\\begin\{table\}/g) || []).length,
      equations: (content.match(/\\begin\{equation\}/g) || []).length + (content.match(/\$\$/g) || []).length / 2,
      citations: (content.match(/\\cite\{[^}]+\}/g) || []).length
    };
  }
};
