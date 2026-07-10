import { prisma } from '../prisma.js';
import { latexService } from './latex.service.js';
import crypto from 'crypto';

export interface OverleafProject {
  name: string;
  files: OverleafFile[];
  settings: OverleafSettings;
}

export interface OverleafFile {
  path: string;
  content?: string;
  type: 'file' | 'folder';
  children?: OverleafFile[];
}

export interface OverleafSettings {
  compiler: 'pdflatex' | 'xelatex' | 'lualatex';
 _SYNCTEX: boolean;
  spellCheck: boolean;
  autoCompile: boolean;
}

export interface ExportOptions {
  format: 'zip' | 'tar' | 'git';
  includeAuxiliary: boolean;
  compiler: 'pdflatex' | 'xelatex' | 'lualatex';
  template?: string;
}

class OverleafService {
  /**
   * Export LaTeX document to Overleaf-compatible format
   */
  async exportToOverleaf(
    documentId: string,
    options: ExportOptions = {
      format: 'zip',
      includeAuxiliary: false,
      compiler: 'pdflatex'
    }
  ): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Create Overleaf project structure
    const project = this.createOverleafProject(document, options);

    // Generate export file based on format
    switch (options.format) {
      case 'zip':
        return this.generateZip(project, document.title);
      case 'tar':
        return this.generateTar(project, document.title);
      case 'git':
        return this.generateGitRepo(project, document.title);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Create Overleaf project structure from document
   */
  private createOverleafProject(
    document: any,
    options: ExportOptions
  ): OverleafProject {
    const files: OverleafFile[] = [];

    // Main .tex file
    files.push({
      path: `${document.title}.tex`,
      content: document.content,
      type: 'file'
    });

    // Add .bib file if citations exist
    if (document.content.includes('\\cite{')) {
      files.push({
        path: 'references.bib',
        content: this.generateBibTemplate(),
        type: 'file'
      });
    }

    // Add .cls file for custom document class
    if (document.content.includes('\\documentclass{custom}')) {
      files.push({
        path: 'custom.cls',
        content: this.generateClsTemplate(),
        type: 'file'
      });
    }

    // Add figures folder if images are referenced
    if (document.content.includes('\\includegraphics')) {
      files.push({
        path: 'figures',
        type: 'folder',
        children: []
      });
    }

    // Add auxiliary files
    if (options.includeAuxiliary) {
      files.push({
        path: '.latexmkrc',
        content: this.generateLatexmkrc(options.compiler),
        type: 'file'
      });
    }

    return {
      name: document.title,
      files,
      settings: {
        compiler: options.compiler,
        _SYNCTEX: true,
        spellCheck: true,
        autoCompile: false
      }
    };
  }

  /**
   * Generate BibTeX template
   */
  private generateBibTemplate(): string {
    return `@article{key,
  author = {Author Name},
  title = {Article Title},
  journal = {Journal Name},
  year = {2024},
  volume = {1},
  number = {1},
  pages = {1--10},
  doi = {10.1000/xyz123}
}

@inproceedings{key2,
  author = {Author Name},
  title = {Conference Paper Title},
  booktitle = {Conference Name},
  year = {2024},
  pages = {1--10},
  publisher = {Publisher Name}
}

@book{key3,
  author = {Author Name},
  title = {Book Title},
  year = {2024},
  publisher = {Publisher Name}
}`;
  }

  /**
   * Generate custom document class template
   */
  private generateClsTemplate(): string {
    return `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesClass{custom}[2024/01/01 Custom document class]

\\LoadClass{article}

\\RequirePackage[utf8]{inputenc}
\\RequirePackage[T1]{fontenc}
\\RequirePackage{amsmath,amssymb}
\\RequirePackage{graphicx}
\\RequirePackage{hyperref}
\\RequirePackage{geometry}
\\geometry{margin=1in}

\\newcommand{\\maketitlepage}{
  \\begin{titlepage}
    \\centering
    \\vspace*{1cm}
    \\Huge\\textbf{\\@title}\\\\[1cm]
    \\Large\\@author\\\\[1cm]
    \\large\\@date
  \\end{titlepage}
}`;
  }

  /**
   * Generate latexmkrc configuration
   */
  private generateLatexmkrc(compiler: string): string {
    return `$pdf_mode = ${compiler === 'xelatex' ? 5 : compiler === 'lualatex' ? 4 : 1};
$pdflatex = '${compiler} -interaction=nonstopmode -synctex=1 %O %S';
$bibtex_use = 2;
$clean_ext = 'synctex.gz bbl bcf fdb_latexmk run.xml tex.bak bbl.bak';
$OutDir = './build';`;
  }

  /**
   * Generate ZIP archive
   */
  private async generateZip(
    project: OverleafProject,
    title: string
  ): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    // Use dynamic import for JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add all files to ZIP
    for (const file of project.files) {
      if (file.type === 'file' && file.content) {
        zip.file(file.path, file.content);
      } else if (file.type === 'folder' && file.children) {
        const folder = zip.folder(file.path);
        if (folder) {
          for (const child of file.children) {
            if (child.type === 'file' && child.content) {
              folder.file(child.path, child.content);
            }
          }
        }
      }
    }

    // Add project settings
    zip.file('settings.json', JSON.stringify(project.settings, null, 2));

    // Generate ZIP buffer
    const data = await zip.generateAsync({ type: 'nodebuffer' });

    return {
      data,
      filename: `${title}.zip`,
      mimeType: 'application/zip'
    };
  }

  /**
   * Generate TAR archive (placeholder - would need tar library)
   */
  private async generateTar(
    project: OverleafProject,
    title: string
  ): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    // For now, fall back to ZIP
    return this.generateZip(project, title);
  }

  /**
   * Generate Git repository (placeholder)
   */
  private async generateGitRepo(
    project: OverleafProject,
    title: string
  ): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    // For now, fall back to ZIP
    return this.generateZip(project, title);
  }

  /**
   * Create Overleaf-compatible project JSON
   */
  async getProjectJson(documentId: string): Promise<OverleafProject> {
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return this.createOverleafProject(document, {
      format: 'zip',
      includeAuxiliary: false,
      compiler: 'pdflatex'
    });
  }

  /**
   * Import from Overleaf project JSON
   */
  async importFromOverleaf(
    projectId: string,
    projectJson: OverleafProject
  ): Promise<string> {
    // Find the main .tex file
    const mainFile = projectJson.files.find(
      f => f.type === 'file' && f.path.endsWith('.tex')
    );

    if (!mainFile || mainFile.type !== 'file') {
      throw new Error('No main .tex file found in project');
    }

    // Create document from imported content
    const document = await latexService.createDocument(
      projectId,
      projectJson.name || 'Imported Project',
      'blank',
      {}
    );

    // Update with imported content
    await latexService.updateDocument(document.id, {
      content: mainFile.content
    });

    return document.id;
  }
}

export const overleafService = new OverleafService();
