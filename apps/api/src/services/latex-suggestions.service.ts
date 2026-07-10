import { prisma } from '../prisma.js';

export interface Suggestion {
  id: string;
  type: 'command' | 'environment' | 'citation' | 'reference' | 'style' | 'structure';
  label: string;
  description: string;
  insertText: string;
  position: { start: number; end: number };
  confidence: number;
}

export interface LaTeXCommand {
  command: string;
  description: string;
  category: string;
  snippet: string;
}

// Common LaTeX commands organized by category
const LATEX_COMMANDS: LaTeXCommand[] = [
  // Text formatting
  { command: 'textbf', description: 'Bold text', category: 'formatting', snippet: '\\textbf{}' },
  { command: 'textit', description: 'Italic text', category: 'formatting', snippet: '\\textit{}' },
  { command: 'textsc', description: 'Small caps', category: 'formatting', snippet: '\\textsc{}' },
  { command: 'underline', description: 'Underlined text', category: 'formatting', snippet: '\\underline{}' },
  { command: 'emph', description: 'Emphasized text', category: 'formatting', snippet: '\\emph{}' },
  { command: 'texttt', description: 'Monospace text', category: 'formatting', snippet: '\\texttt{}' },
  { command: 'textsf', description: 'Sans-serif text', category: 'formatting', snippet: '\\textsf{}' },
  { command: 'textsl', description: 'Slanted text', category: 'formatting', snippet: '\\textsl{}' },
  { command: 'textsuperscript', description: 'Superscript', category: 'formatting', snippet: '\\textsuperscript{}' },
  { command: 'textsubscript', description: 'Subscript', category: 'formatting', snippet: '\\textsubscript{}' },

  // Math
  { command: 'frac', description: 'Fraction', category: 'math', snippet: '\\frac{}{}' },
  { command: 'sqrt', description: 'Square root', category: 'math', snippet: '\\sqrt{}' },
  { command: 'sum', description: 'Summation', category: 'math', snippet: '\\sum_{}^{}' },
  { command: 'int', description: 'Integral', category: 'math', snippet: '\\int_{}^{}' },
  { command: 'prod', description: 'Product', category: 'math', snippet: '\\prod_{}^{}' },
  { command: 'lim', description: 'Limit', category: 'math', snippet: '\\lim_{}' },
  { command: 'partial', description: 'Partial derivative', category: 'math', snippet: '\\partial' },
  { command: 'nabla', description: 'Nabla operator', category: 'math', snippet: '\\nabla' },
  { command: 'infty', description: 'Infinity', category: 'math', snippet: '\\infty' },
  { command: 'alpha', description: 'Alpha', category: 'math', snippet: '\\alpha' },
  { command: 'beta', description: 'Beta', category: 'math', snippet: '\\beta' },
  { command: 'gamma', description: 'Gamma', category: 'math', snippet: '\\gamma' },
  { command: 'delta', description: 'Delta', category: 'math', snippet: '\\delta' },
  { command: 'epsilon', description: 'Epsilon', category: 'math', snippet: '\\epsilon' },
  { command: 'theta', description: 'Theta', category: 'math', snippet: '\\theta' },
  { command: 'lambda', description: 'Lambda', category: 'math', snippet: '\\lambda' },
  { command: 'mu', description: 'Mu', category: 'math', snippet: '\\mu' },
  { command: 'pi', description: 'Pi', category: 'math', snippet: '\\pi' },
  { command: 'sigma', description: 'Sigma', category: 'math', snippet: '\\sigma' },
  { command: 'phi', description: 'Phi', category: 'math', snippet: '\\phi' },
  { command: 'psi', description: 'Psi', category: 'math', snippet: '\\psi' },
  { command: 'omega', description: 'Omega', category: 'math', snippet: '\\omega' },

  // References
  { command: 'cite', description: 'Citation', category: 'reference', snippet: '\\cite{}' },
  { command: 'ref', description: 'Reference', category: 'reference', snippet: '\\ref{}' },
  { command: 'label', description: 'Label', category: 'reference', snippet: '\\label{}' },
  { command: 'pageref', description: 'Page reference', category: 'reference', snippet: '\\pageref{}' },
  { command: 'footnote', description: 'Footnote', category: 'reference', snippet: '\\footnote{}' },
  { command: 'href', description: 'Hyperlink', category: 'reference', snippet: '\\href{}{}' },
  { command: 'url', description: 'URL', category: 'reference', snippet: '\\url{}' },

  // Lists
  { command: 'item', description: 'List item', category: 'list', snippet: '\\item ' },

  // Figures and tables
  { command: 'includegraphics', description: 'Include image', category: 'figure', snippet: '\\includegraphics[width=0.8\\textwidth]{}' },
  { command: 'caption', description: 'Caption', category: 'figure', snippet: '\\caption{}' },
  { command: 'label', description: 'Label for cross-reference', category: 'figure', snippet: '\\label{}' },

  // Sections
  { command: 'section', description: 'Section', category: 'structure', snippet: '\\section{}' },
  { command: 'subsection', description: 'Subsection', category: 'structure', snippet: '\\subsection{}' },
  { command: 'subsubsection', description: 'Subsubsection', category: 'structure', snippet: '\\subsubsection{}' },
  { command: 'paragraph', description: 'Paragraph', category: 'structure', snippet: '\\paragraph{}' },
  { command: 'subparagraph', description: 'Subparagraph', category: 'structure', snippet: '\\subparagraph{}' },
  { command: 'appendix', description: 'Appendix', category: 'structure', snippet: '\\appendix' },
];

// Common environments
const LATEX_ENVIRONMENTS = [
  { name: 'document', description: 'Document environment', snippet: '\\begin{document}\n\n\\end{document}' },
  { name: 'abstract', description: 'Abstract', snippet: '\\begin{abstract}\n\n\\end{abstract}' },
  { name: 'figure', description: 'Figure', snippet: '\\begin{figure}\n\\centering\n\\includegraphics[width=0.8\\textwidth]{}\n\\caption{}\n\\label{}\n\\end{figure}' },
  { name: 'table', description: 'Table', snippet: '\\begin{table}\n\\centering\n\\begin{tabular}{ccc}\n\n\\end{tabular}\n\\caption{}\n\\label{}\n\\end{table}' },
  { name: 'equation', description: 'Equation', snippet: '\\begin{equation}\n\n\\end{equation}' },
  { name: 'align', description: 'Aligned equations', snippet: '\\begin{align}\n\n\\end{align}' },
  { name: 'itemize', description: 'Bulleted list', snippet: '\\begin{itemize}\n\\item \n\\end{itemize}' },
  { name: 'enumerate', description: 'Numbered list', snippet: '\\begin{enumerate}\n\\item \n\\end{enumerate}' },
  { name: 'description', description: 'Description list', snippet: '\\begin{description}\n\\item[] \n\\end{description}' },
  { name: 'verbatim', description: 'Verbatim text', snippet: '\\begin{verbatim}\n\n\\end{verbatim}' },
  { name: 'quote', description: 'Quote', snippet: '\\begin{quote}\n\n\\end{quote}' },
  { name: 'center', description: 'Centered content', snippet: '\\begin{center}\n\n\\end{center}' },
  { name: 'minipage', description: 'Mini page', snippet: '\\begin{minipage}{0.5\\textwidth}\n\n\\end{minipage}' },
  { name: 'frame', description: 'Beamer frame', snippet: '\\begin{frame}\n\n\\end{frame}' },
  { name: 'columns', description: 'Beamer columns', snippet: '\\begin{columns}\n\\begin{column}{0.5\\textwidth}\n\n\\end{column}\n\\begin{column}{0.5\\textwidth}\n\n\\end{column}\n\\end{columns}' },
];

export const latexSuggestionsService = {
  /**
   * Get suggestions based on cursor position and content
   */
  getSuggestions(
    content: string,
    cursorPosition: number,
    prefix?: string
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const textBeforeCursor = content.substring(0, cursorPosition);
    const currentLine = textBeforeCursor.split('\n').pop() || '';
    
    // Get the current word being typed
    const wordMatch = currentLine.match(/(\w+)$/);
    const currentWord = prefix || wordMatch?.[1] || '';

    // Command suggestions (when typing after \)
    if (currentLine.endsWith('\\') || currentLine.match(/\\[a-zA-Z]*$/)) {
      const commandPrefix = currentLine.match(/\\([a-zA-Z]*)$/)?.[1] || '';
      
      LATEX_COMMANDS.forEach(cmd => {
        if (cmd.command.startsWith(commandPrefix.toLowerCase())) {
          const startPos = cursorPosition - commandPrefix.length - 1;
          suggestions.push({
            id: `cmd-${cmd.command}`,
            type: 'command',
            label: `\\${cmd.command}`,
            description: cmd.description,
            insertText: cmd.snippet,
            position: { start: startPos, end: cursorPosition },
            confidence: 0.9
          });
        }
      });
    }

    // Environment suggestions (when typing \begin{})
    if (currentLine.match(/\\begin\{[a-zA-Z]*$/)) {
      const envPrefix = currentLine.match(/\\begin\{([a-zA-Z]*)$/)?.[1] || '';
      
      LATEX_ENVIRONMENTS.forEach(env => {
        if (env.name.startsWith(envPrefix.toLowerCase())) {
          const startPos = cursorPosition - envPrefix.length - 7; // \begin{
          suggestions.push({
            id: `env-${env.name}`,
            type: 'environment',
            label: env.name,
            description: env.description,
            insertText: env.snippet,
            position: { start: startPos, end: cursorPosition },
            confidence: 0.95
          });
        }
      });
    }

    // Structure suggestions (when starting a new line)
    if (currentLine.trim() === '' || currentLine.match(/^[a-zA-Z]*$/)) {
      const structureCommands = LATEX_COMMANDS.filter(cmd => cmd.category === 'structure');
      
      structureCommands.forEach(cmd => {
        if (cmd.command.startsWith(currentWord.toLowerCase())) {
          suggestions.push({
            id: `struct-${cmd.command}`,
            type: 'structure',
            label: `\\${cmd.command}{...}`,
            description: cmd.description,
            insertText: cmd.snippet,
            position: { start: cursorPosition - currentWord.length, end: cursorPosition },
            confidence: 0.7
          });
        }
      });
    }

    // Style suggestions based on context
    const contextSuggestions = this.getContextualSuggestions(content, cursorPosition);
    suggestions.push(...contextSuggestions);

    // Sort by confidence and limit
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  },

  /**
   * Get contextual suggestions based on document content
   */
  getContextualSuggestions(content: string, cursorPosition: number): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const textBefore = content.substring(0, cursorPosition);
    const textAfter = content.substring(cursorPosition);

    // Suggest closing environments
    const openEnvs = textBefore.match(/\\begin\{(\w+)\}/g) || [];
    const closedEnvs = textBefore.match(/\\end\{(\w+)\}/g) || [];
    
    const openEnvNames = openEnvs.map(e => e.match(/\\begin\{(\w+)\}/)?.[1] || '');
    const closedEnvNames = closedEnvs.map(e => e.match(/\\end\{(\w+)\}/)?.[1] || '');
    
    // Find unclosed environments
    const unclosedEnvs: string[] = [];
    openEnvNames.forEach((env, index) => {
      const closeIndex = closedEnvNames.indexOf(env);
      if (closeIndex === -1 || closeIndex < index) {
        unclosedEnvs.push(env);
      }
    });

    // Suggest closing the most recent unclosed environment
    if (unclosedEnvs.length > 0 && !textAfter.trim().startsWith('\\end')) {
      const lastUnclosed = unclosedEnvs[unclosedEnvs.length - 1];
      suggestions.push({
        id: `close-${lastUnclosed}`,
        type: 'environment',
        label: `\\end{${lastUnclosed}}`,
        description: `Close ${lastUnclosed} environment`,
        insertText: `\n\\end{${lastUnclosed}}`,
        position: { start: cursorPosition, end: cursorPosition },
        confidence: 0.85
      });
    }

    // Suggest missing labels after figures/tables
    if (textBefore.endsWith('\\caption{}') && !textBefore.includes('\\label{')) {
      suggestions.push({
        id: 'add-label',
        type: 'reference',
        label: '\\label{}',
        description: 'Add label for cross-reference',
        insertText: '\n\\label{}',
        position: { start: cursorPosition, end: cursorPosition },
        confidence: 0.75
      });
    }

    // Suggest common packages if not loaded
    const loadedPackages = content.match(/\\usepackage(?:\[.*?\])?\{([^}]+)\}/g) || [];
    const loadedPackageNames = loadedPackages.map(p => p.match(/\{([^}]+)\}/)?.[1] || '');
    
    const commonPackages = [
      { name: 'amsmath', description: 'Mathematical typesetting' },
      { name: 'graphicx', description: 'Graphics inclusion' },
      { name: 'hyperref', description: 'Hyperlinks and cross-references' },
      { name: 'booktabs', description: 'Professional tables' },
      { name: 'geometry', description: 'Page layout' },
      { name: 'listings', description: 'Code listings' },
      { name: 'xcolor', description: 'Color support' },
      { name: 'tikz', description: 'Graphics creation' },
    ];

    if (textBefore.includes('\\documentclass') && !textBefore.includes('\\usepackage')) {
      commonPackages.forEach(pkg => {
        if (!loadedPackageNames.includes(pkg.name)) {
          suggestions.push({
            id: `pkg-${pkg.name}`,
            type: 'command',
            label: `\\usepackage{${pkg.name}}`,
            description: pkg.description,
            insertText: `\\usepackage{${pkg.name}}\n`,
            position: { start: 0, end: 0 },
            confidence: 0.6
          });
        }
      });
    }

    return suggestions;
  },

  /**
   * Get autocompletion for common patterns
   */
  getAutocompletions(content: string, cursorPosition: number): string[] {
    const completions: string[] = [];
    const textBefore = content.substring(0, cursorPosition);
    const currentLine = textBefore.split('\n').pop() || '';

    // Autocomplete common phrases
    const commonPhrases = [
      'As shown in Figure',
      'As mentioned in Section',
      'According to',
      'In this paper, we',
      'The results show that',
      'Furthermore,',
      'However,',
      'Therefore,',
      'In conclusion,',
      'The main contributions are',
      'We propose',
      'Our approach',
      'The experimental results',
      'The proposed method',
      'The state of the art',
    ];

    const currentWord = currentLine.match(/(\w+)$/)?.[1] || '';
    
    commonPhrases.forEach(phrase => {
      if (phrase.toLowerCase().startsWith(currentWord.toLowerCase())) {
        completions.push(phrase);
      }
    });

    return completions;
  },

  /**
   * Analyze document and provide improvement suggestions
   */
  analyzeDocument(content: string): Array<{
    type: 'structure' | 'style' | 'completeness' | 'grammar';
    message: string;
    position?: { line: number; column: number };
    severity: 'info' | 'warning' | 'error';
  }> {
    const issues: Array<{
      type: 'structure' | 'style' | 'completeness' | 'grammar';
      message: string;
      position?: { line: number; column: number };
      severity: 'info' | 'warning' | 'error';
    }> = [];

    const lines = content.split('\n');

    // Check for missing abstract
    if (content.includes('\\maketitle') && !content.includes('\\begin{abstract}')) {
      issues.push({
        type: 'completeness',
        message: 'Consider adding an abstract section',
        severity: 'info'
      });
    }

    // Check for missing sections
    const sectionCount = (content.match(/\\section\{/g) || []).length;
    if (sectionCount === 0 && content.length > 500) {
      issues.push({
        type: 'structure',
        message: 'Document has no sections. Consider organizing content with \\section{}',
        severity: 'warning'
      });
    }

    // Check for unclosed environments
    const openEnvs = (content.match(/\\begin\{(\w+)\}/g) || []);
    const closedEnvs = (content.match(/\\end\{(\w+)\}/g) || []);
    
    if (openEnvs.length !== closedEnvs.length) {
      issues.push({
        type: 'completeness',
        message: `Unbalanced environments: ${openEnvs.length} \\begin vs ${closedEnvs.length} \\end`,
        severity: 'error'
      });
    }

    // Check for missing citations
    const hasClaims = content.includes('\\section') || content.includes('\\subsection');
    const hasCitations = content.includes('\\cite{');
    
    if (hasClaims && !hasCitations && content.length > 1000) {
      issues.push({
        type: 'completeness',
        message: 'Consider adding citations to support your claims',
        severity: 'info'
      });
    }

    // Check for very long paragraphs
    let paragraphStart = -1;
    lines.forEach((line, index) => {
      if (line.trim() === '' && paragraphStart !== -1) {
        const paragraphLength = index - paragraphStart;
        if (paragraphLength > 30) {
          issues.push({
            type: 'style',
            message: `Line ${paragraphStart + 1}: Very long paragraph (${paragraphLength} lines). Consider breaking it up`,
            position: { line: paragraphStart, column: 0 },
            severity: 'warning'
          });
        }
        paragraphStart = -1;
      } else if (line.trim() !== '' && paragraphStart === -1) {
        paragraphStart = index;
      }
    });

    // Check for consistent citation style
    const citeStyles = content.match(/\\cite\{[^}]+\}/g) || [];
    const multipleCiteStyles = citeStyles.filter(c => c.includes(','));
    if (multipleCiteStyles.length > 0 && citeStyles.length - multipleCiteStyles.length > 0) {
      issues.push({
        type: 'style',
        message: 'Inconsistent citation style detected. Consider using consistent citation commands',
        severity: 'info'
      });
    }

    return issues;
  }
};
