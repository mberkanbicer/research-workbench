/**
 * Simple line-based diff algorithm
 */

export interface DiffLine {
  type: 'equal' | 'insert' | 'delete';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
}

/**
 * Compute diff between two strings (line-based)
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  // Compute LCS (Longest Common Subsequence)
  const lcs = computeLCS(oldLines, newLines);
  
  // Generate diff from LCS
  const lines = generateDiff(oldLines, newLines, lcs);
  
  // Calculate stats
  const stats = {
    additions: lines.filter(l => l.type === 'insert').length,
    deletions: lines.filter(l => l.type === 'delete').length,
    unchanged: lines.filter(l => l.type === 'equal').length
  };
  
  return { lines, stats };
}

/**
 * Compute Longest Common Subsequence
 */
function computeLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  
  // Create LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Fill the table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp;
}

/**
 * Generate diff from LCS table
 */
function generateDiff(
  oldLines: string[],
  newLines: string[],
  dp: number[][]
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  
  // Trace back through LCS table
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Equal line
      result.unshift({
        type: 'equal',
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Inserted line
      result.unshift({
        type: 'insert',
        content: newLines[j - 1],
        newLineNum: j
      });
      j--;
    } else {
      // Deleted line
      result.unshift({
        type: 'delete',
        content: oldLines[i - 1],
        oldLineNum: i
      });
      i--;
    }
  }
  
  return result;
}

/**
 * Compute inline diff (character-level) for a single line
 */
export function computeInlineDiff(oldLine: string, newLine: string): {
  old: Array<{ type: 'equal' | 'delete'; content: string }>;
  new: Array<{ type: 'equal' | 'insert'; content: string }>;
} {
  const oldResult: Array<{ type: 'equal' | 'delete'; content: string }> = [];
  const newResult: Array<{ type: 'equal' | 'insert'; content: string }> = [];
  
  // Simple character-by-character comparison
  const maxLen = Math.max(oldLine.length, newLine.length);
  let i = 0;
  
  while (i < maxLen) {
    if (i < oldLine.length && i < newLine.length && oldLine[i] === newLine[i]) {
      // Find consecutive equal characters
      let start = i;
      while (i < maxLen && i < oldLine.length && i < newLine.length && oldLine[i] === newLine[i]) {
        i++;
      }
      const equalChars = oldLine.slice(start, i);
      oldResult.push({ type: 'equal', content: equalChars });
      newResult.push({ type: 'equal', content: equalChars });
    } else if (i < oldLine.length) {
      // Deleted character(s)
      let start = i;
      while (i < oldLine.length && (i >= newLine.length || oldLine[i] !== newLine[i])) {
        i++;
      }
      oldResult.push({ type: 'delete', content: oldLine.slice(start, i) });
    } else if (i < newLine.length) {
      // Inserted character(s)
      let start = i;
      while (i < newLine.length && (i >= oldLine.length || oldLine[i] !== newLine[i])) {
        i++;
      }
      newResult.push({ type: 'insert', content: newLine.slice(start, i) });
    } else {
      i++;
    }
  }
  
  return { old: oldResult, new: newResult };
}

/**
 * Format diff as unified format (for display)
 */
export function formatUnifiedDiff(diff: DiffResult, contextLines: number = 3): string {
  const result: string[] = [];
  let i = 0;
  
  while (i < diff.lines.length) {
    // Find context around changes
    const line = diff.lines[i];
    
    if (line.type === 'equal') {
      // Check if we need to show context
      let contextStart = i;
      while (contextStart > 0 && diff.lines[contextStart - 1].type === 'equal') {
        contextStart--;
      }
      
      // Find next change
      let nextChange = i;
      while (nextChange < diff.lines.length && diff.lines[nextChange].type === 'equal') {
        nextChange++;
      }
      
      // If there's a change nearby, show context
      if (nextChange < diff.lines.length || i > contextStart) {
        const contextEnd = Math.min(i + contextLines, diff.lines.length);
        for (let j = i; j < contextEnd; j++) {
          result.push(` ${diff.lines[j].content}`);
        }
        i = contextEnd;
      } else {
        i++;
      }
    } else if (line.type === 'delete') {
      result.push(`-${line.content}`);
      i++;
    } else if (line.type === 'insert') {
      result.push(`+${line.content}`);
      i++;
    }
  }
  
  return result.join('\n');
}

/**
 * Convert diff to HTML (for rich display)
 */
export function diffToHtml(diff: DiffResult): string {
  const lines: string[] = [];
  
  for (const line of diff.lines) {
    const escaped = escapeHtml(line.content);
    
    switch (line.type) {
      case 'equal':
        lines.push(`<div class="diff-line diff-equal"><span class="diff-content">${escaped}</span></div>`);
        break;
      case 'delete':
        lines.push(`<div class="diff-line diff-delete"><span class="diff-prefix">-</span><span class="diff-content">${escaped}</span></div>`);
        break;
      case 'insert':
        lines.push(`<div class="diff-line diff-insert"><span class="diff-prefix">+</span><span class="diff-content">${escaped}</span></div>`);
        break;
    }
  }
  
  return lines.join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
