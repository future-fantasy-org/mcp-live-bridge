import { describe, it, expect } from 'vitest';
import { parseAndValidateConfig } from '../../src/config/schema.js';

const validConfig = {
  name: 'test-bridge',
  auth: {
    provider: 'form',
    config: {
      login_url: 'https://example.com/login',
      username: 'user',
      password: 'pass',
    },
  },
  tools: [
    {
      name: 'search',
      description: 'Search docs',
      url: 'https://api.example.com/search',
      method: 'GET',
      parameters: {
        q: { type: 'string', required: true, description: 'query', location: 'query' },
      },
    },
  ],
};

describe('parseAndValidateConfig', () => {
  it('accepts a valid minimal config', () => {
    const result = parseAndValidateConfig(validConfig);
    expect(result.name).toBe('test-bridge');
    expect(result.tools).toHaveLength(1);
  });

  it('applies defaults for server', () => {
    const result = parseAndValidateConfig(validConfig);
    expect(result.server!.host).toBe('0.0.0.0');
    expect(result.server!.port).toBe(8080);
    expect(result.server!.timeout).toBe(30000);
    expect(result.server!.cors_origin).toBe('*');
  });

  it('rejects config without name', () => {
    const { name, ...rest } = validConfig;
    expect(() => parseAndValidateConfig(rest)).toThrow();
  });

  it('rejects config without auth', () => {
    expect(() => parseAndValidateConfig({ name: 'test', auth: undefined, tools: [] })).toThrow();
  });

  it('rejects config with empty tools', () => {
    expect(() => parseAndValidateConfig({ ...validConfig, tools: [] })).toThrow();
  });

  it('rejects tool without required fields', () => {
    expect(() =>
      parseAndValidateConfig({
        ...validConfig,
        tools: [{ name: 'x', url: 'http://x.com', method: 'GET' }],
      })
    ).toThrow();
  });

  it('applies refresh defaults', () => {
    const config = { ...validConfig, auth: { ...validConfig.auth, refresh: {} } };
    const result = parseAndValidateConfig(config);
    expect(result.auth.refresh!.on_failure).toBe(true);
    expect(result.auth.refresh!.retry_count).toBe(3);
    expect(result.auth.refresh!.retry_delay).toBe(5);
    expect(result.auth.refresh!.poll_interval).toBeUndefined();
  });
});
