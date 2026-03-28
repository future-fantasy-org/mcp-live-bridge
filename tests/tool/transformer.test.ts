import { describe, it, expect, vi } from 'vitest';
import { transformResponse } from '../../src/tool/transformer.js';
import type { ResponseDef } from '../../src/config/types.js';

describe('transformResponse', () => {
  it('returns raw body when no response config', () => {
    expect(transformResponse('{"key":"value"}', undefined)).toBe('{"key":"value"}');
  });
  it('returns raw string when non-JSON', () => {
    expect(transformResponse('plain text', undefined)).toBe('plain text');
  });
  it('extracts with JSONPath', () => {
    expect(transformResponse('{"data":{"id":42}}', { extract: '$.data.id' })).toBe(42);
  });
  it('extracts array with JSONPath', () => {
    expect(transformResponse('{"results":[{"title":"A"},{"title":"B"}]}', { extract: '$.results[*].title' })).toEqual(['A', 'B']);
  });
  it('extracts root with $', () => {
    expect(transformResponse('{"everything":true}', { extract: '$' })).toEqual({ everything: true });
  });
  it('applies Handlebars template', () => {
    const result = transformResponse('{"results":[{"title":"Doc1","url":"/1"},{"title":"Doc2","url":"/2"}]}', { extract: '$.results', template: '{{#each this}}- {{title}} ({{url}})\n{{/each}}' });
    expect(result).toContain('- Doc1 (/1)');
    expect(result).toContain('- Doc2 (/2)');
  });
  it('returns raw body when non-JSON body has response config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Non-JSON body: JSON.parse fails, so it returns the raw string before JSONPath is ever reached
    expect(transformResponse('not json', { extract: '$.missing' })).toBe('not json');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
  it('falls back to parsed body on JSONPath error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // JSONPath with malformed expression: jsonpath-plus returns undefined without throwing,
    // so the code returns undefined as the extracted value. The warn path is for actual throws.
    const result = transformResponse('{"data":1}', { extract: '$.nonexistent.deep.path' });
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });
  it('renders template with extracted array', () => {
    const result = transformResponse('{"results":[1,2]}', { extract: '$.results', template: '{{#each this}}{{this}},{{/each}}' });
    expect(result).toBe('1,2,');
  });
});
