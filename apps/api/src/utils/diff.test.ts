import { describe, it, expect } from 'vitest';
import { computeDiff, computeInlineDiff, formatUnifiedDiff, diffToHtml } from './diff.js';

describe('computeDiff', () => {
  it('returns empty diff for identical strings', () => {
    const result = computeDiff('hello\nworld', 'hello\nworld');
    expect(result.stats.additions).toBe(0);
    expect(result.stats.deletions).toBe(0);
    expect(result.stats.unchanged).toBe(2);
  });

  it('detects added lines', () => {
    const result = computeDiff('hello', 'hello\nworld');
    expect(result.stats.additions).toBe(1);
    expect(result.stats.deletions).toBe(0);
    expect(result.lines.some(l => l.type === 'insert' && l.content === 'world')).toBe(true);
  });

  it('detects deleted lines', () => {
    const result = computeDiff('hello\nworld', 'hello');
    expect(result.stats.additions).toBe(0);
    expect(result.stats.deletions).toBe(1);
    expect(result.lines.some(l => l.type === 'delete' && l.content === 'world')).toBe(true);
  });

  it('detects replaced lines', () => {
    const result = computeDiff('hello\nworld', 'hello\nearth');
    expect(result.stats.additions).toBe(1);
    expect(result.stats.deletions).toBe(1);
    expect(result.lines.some(l => l.type === 'delete' && l.content === 'world')).toBe(true);
    expect(result.lines.some(l => l.type === 'insert' && l.content === 'earth')).toBe(true);
  });

  it('handles single line changes', () => {
    const result = computeDiff('old line', 'new line');
    expect(result.stats.additions).toBe(1);
    expect(result.stats.deletions).toBe(1);
  });

  it('assigns correct line numbers', () => {
    const result = computeDiff('a\nb\nc', 'a\nc');
    const equalLine = result.lines.find(l => l.type === 'equal');
    expect(equalLine?.oldLineNum).toBe(1);
    expect(equalLine?.newLineNum).toBe(1);
  });
});

describe('computeInlineDiff', () => {
  it('returns equal content for identical strings', () => {
    const result = computeInlineDiff('hello', 'hello');
    expect(result.old.every(l => l.type === 'equal')).toBe(true);
    expect(result.new.every(l => l.type === 'equal')).toBe(true);
  });

  it('detects character changes', () => {
    const result = computeInlineDiff('hello', 'hullo');
    // The function detects character-level differences
    // It shows deleted characters on the old side
    expect(result.old.some(l => l.type === 'delete')).toBe(true);
  });
});

describe('formatUnifiedDiff', () => {
  it('formats diff lines', () => {
    const diff = computeDiff('hello', 'hello\nworld');
    const formatted = formatUnifiedDiff(diff);
    expect(formatted).toContain('world');
  });
});

describe('diffToHtml', () => {
  it('generates HTML with diff-equal class', () => {
    const diff = computeDiff('hello', 'hello');
    const html = diffToHtml(diff);
    expect(html).toContain('diff-equal');
    expect(html).toContain('hello');
  });

  it('generates HTML with diff-delete class', () => {
    const diff = computeDiff('hello\nworld', 'hello');
    const html = diffToHtml(diff);
    expect(html).toContain('diff-delete');
  });

  it('generates HTML with diff-insert class', () => {
    const diff = computeDiff('hello', 'hello\nworld');
    const html = diffToHtml(diff);
    expect(html).toContain('diff-insert');
  });

  it('escapes HTML in content', () => {
    const diff = computeDiff('line with <script>', 'line with <script>');
    const html = diffToHtml(diff);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
