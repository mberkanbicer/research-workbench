'use client';

import { useMemo } from 'react';

interface LaTeXPreviewProps {
  content: string;
  compiledPdf: string | null;
  isCompiling: boolean;
}

// Simple LaTeX to HTML converter for preview
function latexToHtml(latex: string): string {
  let html = latex;

  // Escape HTML first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Remove comments
  html = html.replace(/%.*$/gm, '');

  // Document class and packages (ignore)
  html = html.replace(/\\documentclass(\[.*?\])?\{.*?\}/g, '');
  html = html.replace(/\\usepackage(\[.*?\])?\{.*?\}/g, '');

  // Title, author, date
  html = html.replace(/\\title\{(.*?)\}/g, '<h1 class="text-2xl font-bold text-center mb-4">$1</h1>');
  html = html.replace(/\\author\{(.*?)\}/g, '<p class="text-center text-gray-600 mb-2">$1</p>');
  html = html.replace(/\\date\{(.*?)\}/g, '<p class="text-center text-gray-500 mb-6">$1</p>');
  html = html.replace(/\\maketitle/g, '');

  // Abstract
  html = html.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, 
    '<div class="bg-gray-50 border-l-4 border-gray-300 p-4 mb-6"><p class="font-semibold mb-2">Abstract</p><p class="text-sm text-gray-700">$1</p></div>');

  // Sections
  html = html.replace(/\\section\*\{(.*?)\}/g, '<h2 class="text-xl font-bold mt-8 mb-4 pb-2 border-b">$1</h2>');
  html = html.replace(/\\subsection\*\{(.*?)\}/g, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>');
  html = html.replace(/\\subsubsection\*\{(.*?)\}/g, '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>');
  html = html.replace(/\\section\{(.*?)\}/g, '<h2 class="text-xl font-bold mt-8 mb-4 pb-2 border-b">$1</h2>');
  html = html.replace(/\\subsection\{(.*?)\}/g, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>');
  html = html.replace(/\\subsubsection\{(.*?)\}/g, '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>');

  // Text formatting
  html = html.replace(/\\textbf\{(.*?)\}/g, '<strong>$1</strong>');
  html = html.replace(/\\textit\{(.*?)\}/g, '<em>$1</em>');
  html = html.replace(/\\textsc\{(.*?)\}/g, '<span class="small-caps">$1</span>');
  html = html.replace(/\\emph\{(.*?)\}/g, '<em>$1</em>');
  html = html.replace(/\\underline\{(.*?)\}/g, '<u>$1</u>');

  // Lists
  html = html.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, 
    '<ol class="list-decimal pl-6 mb-4">$1</ol>');
  html = html.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, 
    '<ul class="list-disc pl-6 mb-4">$1</ul>');
  html = html.replace(/\\item\s*/g, '<li class="mb-1">');

  // Figures
  html = html.replace(/\\begin\{figure\}([\s\S]*?)\\end\{figure\}/g, 
    '<div class="bg-gray-100 border rounded p-4 my-4 text-center"><div class="text-gray-500 mb-2">[Figure]</div>$1</div>');
  html = html.replace(/\\begin\{figure\*\}([\s\S]*?)\\end\{figure\*\}/g, 
    '<div class="bg-gray-100 border rounded p-4 my-4 text-center"><div class="text-gray-500 mb-2">[Figure*]</div>$1</div>');
  html = html.replace(/\\caption\{(.*?)\}/g, '<p class="text-sm text-gray-600 mt-2">$1</p>');
  html = html.replace(/\\includegraphics(\[.*?\])?\{(.*?)\}/g, '<div class="text-gray-500">[Image: $2]</div>');

  // Tables
  html = html.replace(/\\begin\{table\}([\s\S]*?)\\end\{table\}/g, 
    '<div class="bg-gray-50 border rounded p-4 my-4">$1</div>');
  html = html.replace(/\\begin\{tabular\}(\{.*?\})([\s\S]*?)\\end\{tabular\}/g,
    '<table class="border-collapse border w-full">$2</table>');
  html = html.replace(/\\hline/g, '<tr class="border-b"><td colspan="100%"></td></tr>');

  // Math (simplified)
  html = html.replace(/\$\$(.*?)\$\$/gs, '<div class="bg-gray-50 p-2 my-2 text-center font-mono">[$1]</div>');
  html = html.replace(/\$(.*?)\$/g, '<span class="font-mono bg-gray-50 px-1">$1</span>');
  html = html.replace(/\\\[(.*?)\\\]/gs, '<div class="bg-gray-50 p-2 my-2 text-center font-mono">[$1]</div>');
  html = html.replace(/\\\((.*?)\\\)/g, '<span class="font-mono bg-gray-50 px-1">$1</span>');

  // Common math symbols
  html = html.replace(/\\alpha/g, 'α');
  html = html.replace(/\\beta/g, 'β');
  html = html.replace(/\\gamma/g, 'γ');
  html = html.replace(/\\delta/g, 'δ');
  html = html.replace(/\\epsilon/g, 'ε');
  html = html.replace(/\\theta/g, 'θ');
  html = html.replace(/\\lambda/g, 'λ');
  html = html.replace(/\\mu/g, 'μ');
  html = html.replace(/\\pi/g, 'π');
  html = html.replace(/\\sigma/g, 'σ');
  html = html.replace(/\\phi/g, 'φ');
  html = html.replace(/\\psi/g, 'ψ');
  html = html.replace(/\\omega/g, 'ω');
  html = html.replace(/\\infty/g, '∞');
  html = html.replace(/\\pm/g, '±');
  html = html.replace(/\\mp/g, '∓');
  html = html.replace(/\\times/g, '×');
  html = html.replace(/\\div/g, '÷');
  html = html.replace(/\\cdot/g, '·');
  html = html.replace(/\\leq/g, '≤');
  html = html.replace(/\\geq/g, '≥');
  html = html.replace(/\\neq/g, '≠');
  html = html.replace(/\\approx/g, '≈');
  html = html.replace(/\\equiv/g, '≡');
  html = html.replace(/\\in/g, '∈');
  html = html.replace(/\\notin/g, '∉');
  html = html.replace(/\\subset/g, '⊂');
  html = html.replace(/\\supset/g, '⊃');
  html = html.replace(/\\cup/g, '∪');
  html = html.replace(/\\cap/g, '∩');
  html = html.replace(/\\emptyset/g, '∅');
  html = html.replace(/\\forall/g, '∀');
  html = html.replace(/\\exists/g, '∃');
  html = html.replace(/\\neg/g, '¬');
  html = html.replace(/\\land/g, '∧');
  html = html.replace(/\\lor/g, '∨');
  html = html.replace(/\\rightarrow/g, '→');
  html = html.replace(/\\leftarrow/g, '←');
  html = html.replace(/\\leftrightarrow/g, '↔');
  html = html.replace(/\\Rightarrow/g, '⇒');
  html = html.replace(/\\Leftarrow/g, '⇐');
  html = html.replace(/\\Leftrightarrow/g, '⇔');

  // Environments (show as code blocks)
  html = html.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, 
    '<div class="bg-gray-50 p-3 my-3 font-mono text-sm border-l-4 border-blue-500">$1</div>');
  html = html.replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, 
    '<div class="bg-gray-50 p-3 my-3 font-mono text-sm border-l-4 border-blue-500">$1</div>');
  html = html.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, 
    '<pre class="bg-gray-100 p-3 my-3 font-mono text-sm border rounded">$1</pre>');

  // Footnotes
  html = html.replace(/\\footnote\{(.*?)\}/g, '<sup class="text-blue-600 cursor-help">[fn]</sup>');

  // Labels and refs
  html = html.replace(/\\label\{(.*?)\}/g, '<span class="text-blue-600 text-xs">[$1]</span>');
  html = html.replace(/\\ref\{(.*?)\}/g, '<span class="text-blue-600">[?]</span>');

  // Citations
  html = html.replace(/\\cite\{(.*?)\}/g, '<span class="text-blue-600">[$1]</span>');

  // Horizontal rule
  html = html.replace(/\\hrule/g, '<hr class="my-4 border-gray-300" />');

  // Newlines and paragraphs
  html = html.replace(/\\\\/g, '<br/>');
  html = html.replace(/\n\n+/g, '</p><p class="mb-4">');

  // Wrap in paragraphs
  html = '<p class="mb-4">' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p class="mb-4">\s*<\/p>/g, '');

  return html;
}

export function LaTeXPreview({ content, compiledPdf, isCompiling }: LaTeXPreviewProps) {
  const previewHtml = useMemo(() => {
    if (compiledPdf) {
      return null; // Will show PDF instead
    }
    return latexToHtml(content);
  }, [content, compiledPdf]);

  return (
    <div className="h-full flex flex-col">
      {/* Preview Header */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between text-sm">
        <span className="text-gray-600 font-medium">Preview</span>
        {isCompiling && (
          <span className="text-blue-500 text-xs">Compiling...</span>
        )}
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto bg-white">
        {compiledPdf ? (
          // PDF Preview
          <div className="h-full">
            <iframe
              src={`data:application/pdf;base64,${compiledPdf}`}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          </div>
        ) : (
          // HTML Preview
          <div className="p-6 max-w-3xl mx-auto">
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
