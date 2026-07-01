import { describe, it, expect } from 'vitest';

// Migrated from scripts/test-parse-json-object.ts
describe('unit:parse-json-object', () => {
  function parseJsonObject(input: string): Record<string, unknown> | null {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  it('should parse valid JSON string', () => {
    const result = parseJsonObject('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should return null for invalid JSON string', () => {
    const result = parseJsonObject('not json');
    expect(result).toBeNull();
  });

  it('should handle empty object', () => {
    const result = parseJsonObject('{}');
    expect(result).toEqual({});
  });

  it('should handle nested objects', () => {
    const result = parseJsonObject('{"a": {"b": 1}}');
    expect(result).toEqual({ a: { b: 1 } });
  });

  it('should handle arrays', () => {
    const result = parseJsonObject('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });
});
