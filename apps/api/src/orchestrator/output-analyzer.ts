/**
 * OutputAnalyzer — analyzes model outputs for quality, schema compliance,
 * and failure patterns. Feeds into the self-improvement loop.
 */

import { ZodSchema, ZodError } from 'zod';

export interface OutputQualityReport {
  /** Overall quality score 0–1 */
  score: number;
  /** Whether the output is usable */
  isUsable: boolean;
  /** Specific issues found */
  issues: OutputIssue[];
  /** Which prompt role produced this output */
  role: string;
  /** Optional text snippet for debugging */
  snippet?: string;
}

export interface OutputIssue {
  type: IssueType;
  severity: 'fatal' | 'major' | 'minor';
  field?: string;
  message: string;
}

export type IssueType =
  | 'schema_validation_failed'
  | 'empty_output'
  | 'truncated_output'
  | 'missing_required_field'
  | 'invalid_enum'
  | 'wrong_type'
  | 'too_few_items'
  | 'low_confidence'
  | 'contradictory_fields'
  | 'placeholder_values'
  | 'uuid_zero_values'
  | 'parse_error';

export class OutputAnalyzer {
  /**
   * Analyze a model output against its schema.
   * Returns a quality report with specific issues found.
   */
  analyze<T>(output: unknown, schema: ZodSchema<T>, role: string): OutputQualityReport {
    const issues: OutputIssue[] = [];

    // 1. Check for null/undefined
    if (output === null || output === undefined) {
      issues.push({ type: 'empty_output', severity: 'fatal', message: 'Output is null or undefined' });
      return { score: 0, isUsable: false, issues, role };
    }

    // 2. Check for parse errors (output is a string that couldn't be parsed)
    if (typeof output === 'string') {
      issues.push({ type: 'parse_error', severity: 'fatal', message: `Output is a string, not parsed JSON: "${output.slice(0, 100)}"` });
      return { score: 0, isUsable: false, issues, role };
    }

    // 3. Schema validation
    const parsed = schema.safeParse(output);
    if (!parsed.success) {
      const zodError = parsed.error;
      for (const issue of zodError.issues) {
        const field = issue.path.join('.');
        switch (issue.code) {
          case 'invalid_type':
            issues.push({ type: 'wrong_type', severity: 'fatal', field, message: issue.message });
            break;
          case 'invalid_enum_value':
            issues.push({ type: 'invalid_enum', severity: 'fatal', field, message: issue.message });
            break;
          case 'too_small':
            issues.push({ type: 'too_few_items', severity: 'major', field, message: issue.message });
            break;
          default:
            issues.push({ type: 'schema_validation_failed', severity: 'fatal', field, message: issue.message });
        }
      }
    }

    // 4. Check for placeholder zero UUIDs in string fields
    this.checkPlaceholders(output as Record<string, any>, issues, '');

    // 5. Check for empty arrays/strings
    this.checkEmptyContent(output as Record<string, any>, issues, '');

    // 6. Calculate score
    const hasFatal = issues.some(i => i.severity === 'fatal');
    const hasMajor = issues.some(i => i.severity === 'major');
    const issueCount = issues.length;

    let score = 1.0;
    if (hasFatal) score -= 0.5;
    if (hasMajor) score -= 0.2;
    score -= issueCount * 0.05;
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      isUsable: !hasFatal && score >= 0.3,
      issues,
      role,
      snippet: this.getSnippet(output),
    };
  }

  /**
   * Checks for a specific failure pattern and returns a diagnostic message.
   */
  diagnose(output: unknown, schema: ZodSchema<any>, role: string): string | null {
    const report = this.analyze(output, schema, role);
    if (report.isUsable) return null;

    const fatalIssues = report.issues.filter(i => i.severity === 'fatal');
    if (fatalIssues.length === 0) return null;

    const descriptions = fatalIssues.map(i => {
      switch (i.type) {
        case 'empty_output': return 'Model returned empty or null output';
        case 'schema_validation_failed': return `Schema validation failed at "${i.field}": ${i.message}`;
        case 'parse_error': return 'Output is raw text, not valid JSON';
        case 'wrong_type': return `Field "${i.field}" has wrong type: ${i.message}`;
        case 'invalid_enum': return `Field "${i.field}" has invalid enum value: ${i.message}`;
        default: return i.message;
      }
    });

    return `Prompt "${role}" produces unusable output. Issues: ${descriptions.join('; ')}`;
  }

  private checkPlaceholders(obj: Record<string, any>, issues: OutputIssue[], prefix: string) {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        if (value === '00000000-0000-0000-0000-000000000000') {
          issues.push({
            type: 'uuid_zero_values',
            severity: 'major',
            field: path,
            message: `Field "${path}" contains zero UUID placeholder`,
          });
        }
        if (value.toLowerCase().includes('mock') || value.toLowerCase().includes('placeholder')) {
          issues.push({
            type: 'placeholder_values',
            severity: 'minor',
            field: path,
            message: `Field "${path}" contains placeholder text "${value.slice(0, 50)}"`,
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        this.checkPlaceholders(value, issues, path);
      }
    }
  }

  private checkEmptyContent(obj: Record<string, any>, issues: OutputIssue[], prefix: string) {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value) && value.length === 0 && key !== 'hypotheses' && key !== 'openQuestions') {
        issues.push({
          type: 'too_few_items',
          severity: 'minor',
          field: path,
          message: `Array "${path}" is empty`,
        });
      }
    }
  }

  private getSnippet(output: unknown): string | undefined {
    if (!output || typeof output !== 'object') return undefined;
    const obj = output as Record<string, any>;
    if (Array.isArray(obj.claims) && obj.claims.length > 0) {
      return `claims:${obj.claims.length}`;
    }
    if (obj.verdict) return `verdict:${obj.verdict}`;
    if (obj.vote) return `vote:${obj.vote}`;
    if (obj.decisionStatus) return `status:${obj.decisionStatus}`;
    return undefined;
  }
}
