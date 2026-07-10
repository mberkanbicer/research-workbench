import { describe, it, expect } from 'vitest';
import { redactSensitive, redactObject, redactMessages } from './redact.js';

describe('redactSensitive', () => {
  it('redacts OpenAI-style API keys', () => {
    const result = redactSensitive('key: sk-abc123def456ghi789jkl012mno');
    expect(result).not.toContain('sk-abc123');
    expect(result).toContain('REDACTED');
  });

  it('redacts OPENROUTER_API_KEY assignments', () => {
    const result = redactSensitive('OPENROUTER_API_KEY=sk-or-v1-abc123def456');
    expect(result).toContain('REDACTED');
  });

  it('redacts Bearer tokens', () => {
    const result = redactSensitive('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.signature');
    expect(result).toContain('REDACTED');
  });

  it('redacts passwords in URLs', () => {
    const result = redactSensitive('postgres://user:supersecret@localhost:5432/db');
    expect(result).not.toContain('supersecret');
    expect(result).toContain('REDACTED');
  });

  it('redacts generic secret assignments', () => {
    expect(redactSensitive('password=abc123')).toContain('REDACTED');
    expect(redactSensitive('secret: mysecretvalue')).toContain('REDACTED');
  });

  it('preserves normal text', () => {
    const text = 'This is a normal sentence without any secrets.';
    expect(redactSensitive(text)).toBe(text);
  });

  it('returns empty string as-is', () => {
    expect(redactSensitive('')).toBe('');
  });

  it('returns non-string values as-is', () => {
    expect(redactSensitive(null as any)).toBe(null);
    expect(redactSensitive(undefined as any)).toBe(undefined);
  });

  it('redacts multiple patterns in same string', () => {
    const text = 'key1=sk-abc123def456ghi789jkl0 key2=password=secret123';
    const result = redactSensitive(text);
    expect(result).toContain('[REDACTED]');
  });
});

describe('redactObject', () => {
  it('redacts string values in objects', () => {
    const obj = { apiKey: 'sk-abc123def456ghi789jkl012mno', name: 'test' };
    const result = redactObject(obj);
    expect(result.apiKey).toContain('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('redacts strings in arrays', () => {
    const arr = ['sk-abc123def456ghi789jkl012mno', 'normal text'];
    const result = redactObject(arr);
    expect(result[0]).toContain('[REDACTED]');
    expect(result[1]).toBe('normal text');
  });

  it('handles null and undefined', () => {
    expect(redactObject(null)).toBe(null);
    expect(redactObject(undefined)).toBe(undefined);
  });

  it('preserves non-string primitives', () => {
    const obj = { count: 42, active: true, ratio: 3.14 };
    const result = redactObject(obj);
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.ratio).toBe(3.14);
  });

  it('redacts strings containing sensitive patterns', () => {
    const obj = {
      connectionString: 'postgres://user:secretpass@localhost:5432/db',
      normalField: 'hello world'
    };
    const result = redactObject(obj);
    expect(result.connectionString).not.toContain('secretpass');
    expect(result.normalField).toBe('hello world');
  });
});

describe('redactMessages', () => {
  it('redacts content in message objects', () => {
    const messages = [
      { role: 'user', content: 'Use key sk-abc123def456ghi789jkl012mno' },
      { role: 'assistant', content: 'Sure, here is the response.' }
    ];
    const result = redactMessages(messages) as Array<{ role: string; content: string }>;
    expect(result[0].content).toContain('[REDACTED]');
    expect(result[1].content).toBe('Sure, here is the response.');
  });

  it('preserves non-message objects', () => {
    const messages = [{ random: 'data' }, 42, 'string'];
    const result = redactMessages(messages);
    expect(result).toEqual([{ random: 'data' }, 42, 'string']);
  });

  it('handles empty array', () => {
    expect(redactMessages([])).toEqual([]);
  });
});
