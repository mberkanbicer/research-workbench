/**
 * Sensitive data redaction utilities for model call logs and exports.
 *
 * Redacts API keys, passwords, tokens, and other sensitive patterns
 * from text content before persistence.
 */

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  // API keys
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/g, type: 'simple' as const },
  { pattern: /\b(sk_live_[a-zA-Z0-9]{20,})\b/g, type: 'simple' as const },
  { pattern: /\b(sk_test_[a-zA-Z0-9]{20,})\b/g, type: 'simple' as const },
  { pattern: /\b(rk_[a-zA-Z0-9]{20,})\b/g, type: 'simple' as const },
  { pattern: /\b(OPENROUTER_API_KEY[=:]\s*\S+)/gi, type: 'simple' as const },
  { pattern: /\b(OPENAI_API_KEY[=:]\s*\S+)/gi, type: 'simple' as const },
  { pattern: /\b(OPENAI_COMPATIBLE_API_KEY[=:]\s*\S+)/gi, type: 'simple' as const },
  { pattern: /\b(SEARCH_API_KEY[=:]\s*\S+)/gi, type: 'simple' as const },
  // Bearer tokens
  { pattern: /\b(Bearer\s+[a-zA-Z0-9._-]{20,})\b/g, type: 'simple' as const },
  // Passwords in URLs
  { pattern: /(\/\/[^:]+:)([^@]+)(@)/g, type: 'url' as const },
  // Generic secrets
  { pattern: /\b(secret|password|passwd|pwd)\s*[=:]\s*\S+/gi, type: 'simple' as const },
];

// Replacement text
const REDACTED = '[REDACTED]';

/**
 * Redact sensitive patterns from a string.
 * Returns a new string with sensitive data replaced.
 */
export function redactSensitive(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  for (const { pattern, type } of SENSITIVE_PATTERNS) {
    if (type === 'url') {
      // For password-in-URL pattern, preserve structure
      result = result.replace(pattern, (_match, prefix: string, _password: string, suffix: string) => {
        return `${prefix}${REDACTED}${suffix}`;
      });
    } else {
      result = result.replace(pattern, REDACTED);
    }
  }
  return result;
}

/**
 * Deep-redact sensitive data from an object (messages, response, etc.).
 * Handles nested objects and arrays.
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactSensitive(obj) as T;
  if (Array.isArray(obj)) return obj.map(redactObject) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = redactObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Redact model call messages before storage.
 * Preserves structure but sanitizes content.
 */
export function redactMessages(messages: unknown[]): unknown[] {
  return messages.map((msg) => {
    if (typeof msg === 'object' && msg !== null && 'role' in msg && 'content' in msg) {
      const m = msg as { role: string; content: unknown };
      return {
        ...m,
        content: typeof m.content === 'string' ? redactSensitive(m.content) : m.content,
      };
    }
    return msg;
  });
}
