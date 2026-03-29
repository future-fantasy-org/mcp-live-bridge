import { describe, it, expect } from 'vitest';
import { generateConfig } from '../../src/openapi/generator.js';
import type { ExtractedEndpoint, AuthSuggestion } from '../../src/openapi/parser.js';

describe('generateConfig', () => {
  const endpoints: ExtractedEndpoint[] = [
    {
      name: 'listUsers',
      description: 'List all users',
      method: 'GET',
      path: '/users',
      url: 'https://api.example.com/users',
      parameters: [
        { name: 'limit', type: 'integer', required: false, description: 'Limit', location: 'query' },
      ],
    },
    {
      name: 'getUser',
      description: 'Get user by ID',
      method: 'GET',
      path: '/users/{id}',
      url: 'https://api.example.com/users/{{params.id}}',
      parameters: [
        { name: 'id', type: 'integer', required: true, description: 'User ID', location: 'path' },
      ],
    },
  ];

  it('generates valid YAML config string', () => {
    const yaml = generateConfig({ name: 'my-bridge', endpoints });
    expect(yaml).toContain('name: my-bridge');
    expect(yaml).toContain('listUsers');
    expect(yaml).toContain('getUser');
    expect(yaml).toContain('limit');
    expect(yaml).toContain('id');
  });

  it('generates config with bearer auth suggestion', () => {
    const auth: AuthSuggestion = { type: 'bearer', schemeName: 'HTTPBearer', description: 'JWT' };
    const yaml = generateConfig({ name: 'my-bridge', endpoints, auth });
    expect(yaml).toContain('provider: form');
    expect(yaml).toContain('YOUR_LOGIN_URL');
  });

  it('includes only selected endpoints by index', () => {
    const yaml = generateConfig({ name: 'my-bridge', endpoints, selectedIndices: [1] });
    expect(yaml).toContain('getUser');
    expect(yaml).not.toContain('listUsers');
  });

  it('adds server port when specified', () => {
    const yaml = generateConfig({ name: 'my-bridge', endpoints, port: 9090 });
    expect(yaml).toContain('port: 9090');
  });

  it('omits port when not specified', () => {
    const yaml = generateConfig({ name: 'my-bridge', endpoints });
    expect(yaml).toContain('version:');
    expect(yaml).not.toContain('port:');
  });

  it('generates placeholder auth when no auth suggestion', () => {
    const yaml = generateConfig({ name: 'my-bridge', endpoints, auth: null });
    expect(yaml).toContain('YOUR_LOGIN_URL');
    expect(yaml).toContain('YOUR_USERNAME');
  });
});
