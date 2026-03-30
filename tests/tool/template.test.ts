import { describe, it, expect } from 'vitest';
import { renderUrl, renderBody, renderHeaders, renderQueryParams } from '../../src/tool/template.js';

describe('renderUrl', () => {
  it('replaces path parameters', () => {
    const result = renderUrl('https://api.example.com/users/{{params.id}}/posts/{{params.postId}}', { id: '123', postId: '456' });
    expect(result).toBe('https://api.example.com/users/123/posts/456');
  });
  it('leaves URL unchanged when no path params', () => {
    const result = renderUrl('https://api.example.com/search', { q: 'test' });
    expect(result).toBe('https://api.example.com/search');
  });
});

describe('renderBody', () => {
  it('renders body template with params (string)', () => {
    const result = renderBody('{"title":"{{params.title}}","content":"{{params.content}}"}', { title: 'Hello', content: 'World' });
    expect(result).toBe('{"title":"Hello","content":"World"}');
  });
  it('returns undefined when no body template', () => {
    expect(renderBody(undefined, {})).toBeUndefined();
  });
  it('renders object body as JSON by default', () => {
    const result = renderBody({ username: '{{params.name}}', role: 'admin' }, { name: 'test' });
    expect(result).toBe('{"username":"test","role":"admin"}');
  });
  it('renders object body with explicit application/json content type', () => {
    const result = renderBody({ username: '{{params.name}}' }, { name: 'test' }, 'application/json');
    expect(result).toBe('{"username":"test"}');
  });
  it('renders object body as URL-encoded', () => {
    const result = renderBody({ username: '{{params.name}}', password: '{{params.pass}}' }, { name: 'test', pass: '123' }, 'application/x-www-form-urlencoded');
    expect(result).toBe('username=test&password=123');
  });
  it('renders nested object body', () => {
    const result = renderBody({
      user: { name: '{{params.name}}', email: '{{params.email}}' },
      active: true,
    }, { name: 'alice', email: 'alice@example.com' });
    const parsed = JSON.parse(result!);
    expect(parsed.user.name).toBe('alice');
    expect(parsed.user.email).toBe('alice@example.com');
    expect(parsed.active).toBe(true);
  });
  it('preserves non-string values in object body', () => {
    const result = renderBody({ count: 10, active: true, tags: ['a', 'b'] }, {});
    const parsed = JSON.parse(result!);
    expect(parsed.count).toBe(10);
    expect(parsed.active).toBe(true);
    expect(parsed.tags).toEqual(['a', 'b']);
  });
  it('flattens nested object for URL-encoded', () => {
    const result = renderBody({
      user: { name: '{{params.name}}', email: 'a@b.com' },
    }, { name: 'test' }, 'application/x-www-form-urlencoded');
    expect(result).toBe('user%5Bname%5D=test&user%5Bemail%5D=a%40b.com');
  });
  it('renders array values in object body', () => {
    const result = renderBody({ tags: ['{{params.tag1}}', '{{params.tag2}}'] }, { tag1: 'go', tag2: 'ts' });
    const parsed = JSON.parse(result!);
    expect(parsed.tags).toEqual(['go', 'ts']);
  });
});

describe('renderHeaders', () => {
  it('renders header templates with auth context', () => {
    const result = renderHeaders({ Authorization: 'Bearer {{auth.token}}', 'X-Static': 'fixed-value' }, { token: 'abc123' }, {});
    expect(result.Authorization).toBe('Bearer abc123');
    expect(result['X-Static']).toBe('fixed-value');
  });
  it('tool-level headers override global headers', () => {
    const result = renderHeaders({ Accept: 'application/json' }, { token: 'abc123' }, {}, { Accept: 'text/plain', 'X-Custom': 'global' });
    expect(result.Accept).toBe('application/json');
    expect(result['X-Custom']).toBe('global');
  });
  it('auth headers have lowest priority', () => {
    const result = renderHeaders({ Accept: 'application/json' }, {}, {}, { Accept: 'text/plain', 'X-From-Auth': 'global-override' }, { Authorization: 'Bearer old', 'X-From-Auth': 'auth-val' });
    expect(result.Authorization).toBe('Bearer old');
    expect(result['X-From-Auth']).toBe('global-override');
    expect(result.Accept).toBe('application/json');
  });
  it('injects header-location parameters', () => {
    const paramDefs = { 'X-Request-Id': { type: 'string' as const, location: 'header' as const, required: true } };
    const result = renderHeaders({}, {}, { 'X-Request-Id': '12345' }, {}, {}, paramDefs);
    expect(result['X-Request-Id']).toBe('12345');
  });
});

describe('renderQueryParams', () => {
  it('builds query string', () => {
    const paramDefs = { keyword: { type: 'string' as const, location: 'query' as const, required: true }, limit: { type: 'integer' as const, location: 'query' as const, default: 10 } };
    const result = renderQueryParams({ keyword: 'test', limit: 10 }, paramDefs);
    expect(result).toBe('?keyword=test&limit=10');
  });
  it('returns empty string when no query params', () => {
    expect(renderQueryParams({}, {})).toBe('');
  });
});
