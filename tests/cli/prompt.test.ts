import { describe, it, expect } from 'vitest';
import { formatChoices, validateRequired, validateUrl, validatePort, parseChoiceIndex } from '../../src/cli/prompt.js';

describe('formatChoices', () => {
  it('formats choices for display', () => {
    const result = formatChoices(['Form (cookie)', 'OAuth2', 'Bearer Token', 'Custom'], 1);
    expect(result).toContain('Form (cookie)');
    expect(result).toContain('> 2. OAuth2');
    expect(result).toContain('Bearer Token');
    expect(result).toContain('Custom');
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
    // Selected line should start with >
    expect(lines[1].trimStart()).toMatch(/^> 2\./);
    // Non-selected line should start with space
    expect(lines[0].trimStart()).toMatch(/^1\./);
  });

  it('formats choices with no selection', () => {
    const result = formatChoices(['A', 'B']);
    expect(result).toContain('1. A');
    expect(result).toContain('2. B');
  });

  it('formats empty choices', () => {
    const result = formatChoices([]);
    expect(result).toBe('');
  });
});

describe('validateRequired', () => {
  it('returns error for empty input', () => {
    expect(validateRequired('')).toBe('This field is required');
  });

  it('returns null for non-empty input', () => {
    expect(validateRequired('hello')).toBeNull();
  });
});

describe('validateUrl', () => {
  it('accepts valid http URL', () => {
    expect(validateUrl('http://localhost:8000')).toBeNull();
  });

  it('accepts valid https URL', () => {
    expect(validateUrl('https://api.example.com')).toBeNull();
  });

  it('rejects non-URL input', () => {
    expect(validateUrl('not-a-url')).not.toBeNull();
  });

  it('rejects ftp protocol', () => {
    expect(validateUrl('ftp://example.com')).not.toBeNull();
  });
});

describe('validatePort', () => {
  it('accepts valid port', () => {
    expect(validatePort('8080')).toBeNull();
  });

  it('rejects non-number', () => {
    expect(validatePort('abc')).not.toBeNull();
  });

  it('rejects port out of range', () => {
    expect(validatePort('99999')).not.toBeNull();
  });

  it('rejects zero', () => {
    expect(validatePort('0')).not.toBeNull();
  });
});

describe('parseChoiceIndex', () => {
  it('parses valid choice', () => {
    expect(parseChoiceIndex('2', 5)).toBe(2);
  });

  it('returns null for out of range', () => {
    expect(parseChoiceIndex('6', 5)).toBeNull();
  });

  it('returns null for non-number', () => {
    expect(parseChoiceIndex('abc', 5)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseChoiceIndex('0', 5)).toBeNull();
  });
});
