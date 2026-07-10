/**
 * Reference import service for BibTeX, RIS, and other formats
 */

export interface ImportedReference {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  citationKey: string;
  type: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Parse BibTeX file content
 */
export function parseBibTeX(content: string): ImportedReference[] {
  const references: ImportedReference[] = [];
  
  // Match each entry
  const entryRegex = /@(\w+)\s*\{([^,]+),([\s\S]*?)\n\s*\}/g;
  let match;
  
  while ((match = entryRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const citationKey = match[2].trim();
    const fields = match[3];
    
    const reference: ImportedReference = {
      title: '',
      authors: [],
      citationKey,
      type,
      tags: []
    };
    
    // Parse fields
    const fieldRegex = /(\w+)\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let fieldMatch;
    
    while ((fieldMatch = fieldRegex.exec(fields)) !== null) {
      const fieldName = fieldMatch[1].toLowerCase();
      const fieldValue = fieldMatch[2].trim();
      
      switch (fieldName) {
        case 'title':
          reference.title = cleanBibTeXValue(fieldValue);
          break;
        case 'author':
        case 'authors':
          reference.authors = parseBibTeXAuthors(fieldValue);
          break;
        case 'year':
          reference.year = parseInt(fieldValue, 10);
          break;
        case 'journal':
        case 'booktitle':
          reference.journal = cleanBibTeXValue(fieldValue);
          break;
        case 'volume':
          reference.volume = fieldValue;
          break;
        case 'pages':
          reference.pages = fieldValue;
          break;
        case 'doi':
          reference.doi = cleanBibTeXValue(fieldValue);
          break;
        case 'url':
          reference.url = cleanBibTeXValue(fieldValue);
          break;
        case 'abstract':
          reference.abstract = cleanBibTeXValue(fieldValue);
          break;
        case 'keywords':
          reference.tags = fieldValue.split(',').map(t => t.trim());
          break;
      }
    }
    
    // Only add if we have a title
    if (reference.title) {
      references.push(reference);
    }
  }
  
  return references;
}

/**
 * Parse RIS file content
 */
export function parseRIS(content: string): ImportedReference[] {
  const references: ImportedReference[] = [];
  const entries = content.split('\n\n').filter(e => e.trim());
  
  for (const entry of entries) {
    const lines = entry.split('\n');
    const reference: ImportedReference = {
      title: '',
      authors: [],
      citationKey: '',
      type: 'article',
      tags: []
    };
    
    for (const line of lines) {
      const match = line.match(/^(\w{2})\s*-\s*(.+)$/);
      if (!match) continue;
      
      const tag = match[1];
      const value = match[2].trim();
      
      switch (tag) {
        case 'TI':
        case 'T1':
          reference.title = value;
          break;
        case 'AU':
        case 'A1':
          reference.authors.push(value);
          break;
        case 'PY':
        case 'Y1':
          reference.year = parseInt(value.split('/')[0], 10);
          break;
        case 'JO':
        case 'J1':
          reference.journal = value;
          break;
        case 'VL':
          reference.volume = value;
          break;
        case 'SP':
          reference.pages = value;
          break;
        case 'DO':
          reference.doi = value;
          break;
        case 'UR':
          reference.url = value;
          break;
        case 'AB':
          reference.abstract = value;
          break;
        case 'KW':
          reference.tags.push(value);
          break;
        case 'ER':
          // End of record
          break;
      }
    }
    
    // Generate citation key from first author and year
    if (reference.title && reference.authors.length > 0) {
      const firstAuthor = reference.authors[0].split(',')[0].split(' ').pop() || 'unknown';
      reference.citationKey = `${firstAuthor.toLowerCase()}${reference.year || 'nd'}`;
      references.push(reference);
    }
  }
  
  return references;
}

/**
 * Clean BibTeX value (remove extra braces, etc.)
 */
function cleanBibTeXValue(value: string): string {
  return value
    .replace(/\{\\'([a-zA-Z])\}/g, '$1') // Handle accent commands like {\'e}
    .replace(/\{\\(["`^~=.u])([a-zA-Z])\}/g, '$2') // Handle more accent commands
    .replace(/\{([^}]+)\}/g, '$1') // Remove inner braces
    .replace(/\\\\/g, '\\') // Handle escaped backslashes
    .trim();
}

/**
 * Parse BibTeX author field
 */
function parseBibTeXAuthors(authorField: string): string[] {
  // Split by " and "
  const authors = authorField.split(/\s+and\s+/);
  
  return authors.map(author => {
    // Handle "Last, First" format
    if (author.includes(',')) {
      const parts = author.split(',').map(p => p.trim());
      return `${parts[1]} ${parts[0]}`.trim();
    }
    return author.trim();
  });
}

/**
 * Generate citation key from reference
 */
export function generateCitationKey(reference: ImportedReference): string {
  const firstAuthor = reference.authors[0]?.split(' ').pop() || 'unknown';
  const year = reference.year || 'nd';
  return `${firstAuthor.toLowerCase().replace(/[^a-z]/g, '')}${year}`;
}

/**
 * Generate BibTeX entry from reference
 */
export function generateBibTeXEntry(reference: ImportedReference): string {
  const fields: string[] = [];
  
  fields.push(`  title = {${reference.title}}`);
  
  if (reference.authors.length > 0) {
    fields.push(`  author = {${reference.authors.join(' and ')}}`);
  }
  
  if (reference.year) {
    fields.push(`  year = {${reference.year}}`);
  }
  
  if (reference.journal) {
    fields.push(`  journal = {${reference.journal}}`);
  }
  
  if (reference.volume) {
    fields.push(`  volume = {${reference.volume}}`);
  }
  
  if (reference.pages) {
    fields.push(`  pages = {${reference.pages}}`);
  }
  
  if (reference.doi) {
    fields.push(`  doi = {${reference.doi}}`);
  }
  
  if (reference.url) {
    fields.push(`  url = {${reference.url}}`);
  }
  
  if (reference.abstract) {
    fields.push(`  abstract = {${reference.abstract}}`);
  }
  
  if (reference.tags.length > 0) {
    fields.push(`  keywords = {${reference.tags.join(', ')}}`);
  }
  
  return `@${reference.type}{${reference.citationKey},\n${fields.join(',\n')}\n}`;
}

/**
 * Generate BibTeX file from multiple references
 */
export function generateBibTeXFile(references: ImportedReference[]): string {
  const entries = references.map(ref => generateBibTeXEntry(ref));
  return entries.join('\n\n');
}
