import { describe, it, expect } from 'vitest';
import { buildAuthConfig, buildFullConfig } from '../../src/cli/init.js';

describe('buildAuthConfig', () => {
  it('builds form auth config', () => {
    const result = buildAuthConfig('form', {
      login_url: 'http://localhost:8000/login',
      username: 'admin',
      password: 'secret',
    });
    expect(result).toEqual({
      provider: 'form',
      config: {
        login_url: 'http://localhost:8000/login',
        username: 'admin',
        password: 'secret',
      },
    });
  });

  it('builds bearer auth config', () => {
    const result = buildAuthConfig('bearer', { token: 'abc123' });
    expect(result).toEqual({
      provider: 'bearer',
      config: { token: 'abc123' },
    });
  });

  it('builds oauth2 auth config', () => {
    const result = buildAuthConfig('oauth2', {
      token_url: 'http://localhost:8000/oauth/token',
      client_id: 'myapp',
      client_secret: 'shh',
      grant_type: 'client_credentials',
    });
    expect(result.provider).toBe('oauth2');
    expect(result.config.token_url).toBe('http://localhost:8000/oauth/token');
    expect(result.config.client_id).toBe('myapp');
  });

  it('builds custom auth config', () => {
    const result = buildAuthConfig('custom', { provider_path: './my-auth.mjs' });
    expect(result.provider).toBe('./my-auth.mjs');
  });

  it('throws on unknown auth choice', () => {
    expect(() => buildAuthConfig('unknown', {})).toThrow('Unknown auth choice');
  });
});

describe('buildFullConfig', () => {
  it('builds a complete config object', () => {
    const result = buildFullConfig({
      name: 'test-bridge',
      port: 9090,
      auth: { provider: 'bearer', config: { token: 'x' } },
      tools: [],
    });
    const parsed = result as any; // it's a string but let's check raw
    expect(typeof parsed).toBe('string');
    expect(parsed).toContain('name: test-bridge');
    expect(parsed).toContain('port: 9090');
  });

  it('omits server section for default port 8080', () => {
    const result = buildFullConfig({
      name: 'test-bridge',
      port: 8080,
      auth: { provider: 'bearer', config: { token: 'x' } },
      tools: [],
    });
    expect(result).not.toContain('port: 8080');
  });

  it('includes tools when provided', () => {
    const tools = [{ name: 'my-tool', description: 'A tool', url: 'http://a.com', method: 'GET' }];
    const result = buildFullConfig({
      name: 'test-bridge',
      port: 8080,
      auth: { provider: 'bearer', config: { token: 'x' } },
      tools,
    });
    expect(result).toContain('my-tool');
    expect(result).toContain('A tool');
  });

  it('includes global headers when provided', () => {
    const result = buildFullConfig({
      name: 'test-bridge',
      port: 8080,
      auth: { provider: 'bearer', config: { token: 'x' } },
      tools: [],
      globalHeaders: { 'Content-Type': 'application/json' },
    });
    expect(result).toContain('Content-Type');
  });
});
