import { describe, it, expect } from 'vitest';
import { parseOpenAPISpec, extractEndpoints, extractAuthSuggestion } from '../../src/openapi/parser.js';
import type { OpenAPISpec } from '../../src/openapi/types.js';

const minimalSpec: OpenAPISpec = {
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List all users',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'Authorization', in: 'header', description: 'Bearer token', schema: { type: 'string' } },
        ],
      },
      post: {
        operationId: 'createUser',
        summary: 'Create a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', description: 'Username' },
                  email: { type: 'string', description: 'Email address' },
                  role: { type: 'string', enum: ['admin', 'user'] },
                },
                required: ['username', 'email'],
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        summary: 'Get user by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
      },
      delete: {
        summary: 'Delete user',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
      },
    },
  },
};

describe('parseOpenAPISpec', () => {
  it('parses a valid OpenAPI 3.x spec string', () => {
    const spec = parseOpenAPISpec(JSON.stringify(minimalSpec));
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths ?? {}).length).toBe(2);
  });

  it('parses a valid Swagger 2.0 spec string', () => {
    const swaggerSpec = { swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} };
    const spec = parseOpenAPISpec(JSON.stringify(swaggerSpec));
    expect(spec.swagger).toBe('2.0');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseOpenAPISpec('not json')).toThrow();
  });
});

describe('extractEndpoints', () => {
  it('extracts all endpoints from spec with default server URL', () => {
    const endpoints = extractEndpoints(minimalSpec);
    expect(endpoints).toHaveLength(4);
  });

  it('extracts GET /users with query parameters', () => {
    const endpoints = extractEndpoints(minimalSpec);
    const listUsers = endpoints.find((e) => e.method === 'GET' && e.path === '/users');
    expect(listUsers).toBeDefined();
    expect(listUsers!.name).toBe('listUsers');
    expect(listUsers!.parameters).toHaveLength(2);
    expect(listUsers!.parameters![0].location).toBe('query');
    expect(listUsers!.parameters![0].type).toBe('integer');
  });

  it('extracts POST /users with body parameters', () => {
    const endpoints = extractEndpoints(minimalSpec);
    const createUser = endpoints.find((e) => e.method === 'POST' && e.path === '/users');
    expect(createUser).toBeDefined();
    expect(createUser!.parameters).toHaveLength(3);
    expect(createUser!.parameters![0].location).toBe('body');
    expect(createUser!.parameters![0].required).toBe(true);
  });

  it('converts path parameters from OpenAPI to mcp-live-bridge format', () => {
    const endpoints = extractEndpoints(minimalSpec);
    const getUser = endpoints.find((e) => e.method === 'GET' && e.path === '/users/{id}');
    expect(getUser).toBeDefined();
    expect(getUser!.url).toContain('{{params.id}}');
  });

  it('uses operationId as name, falls back to generated name', () => {
    const endpoints = extractEndpoints(minimalSpec);
    const del = endpoints.find((e) => e.method === 'DELETE' && e.path === '/users/{id}');
    expect(del).toBeDefined();
    expect(del!.name).toMatch(/^delete/);
  });

  it('skips cookie parameters', () => {
    const spec: OpenAPISpec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'testCookie',
            parameters: [
              { name: 'sessionid', in: 'cookie', required: false, schema: { type: 'string' } },
              { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
            ],
          },
        },
      },
    };
    const endpoints = extractEndpoints(spec);
    expect(endpoints[0].parameters).toHaveLength(1);
    expect(endpoints[0].parameters[0].location).toBe('query');
  });
});

describe('extractAuthSuggestion', () => {
  it('returns null when no security schemes', () => {
    expect(extractAuthSuggestion(minimalSpec)).toBeNull();
  });

  it('detects Bearer security scheme', () => {
    const spec: OpenAPISpec = {
      ...minimalSpec,
      components: {
        securitySchemes: {
          HTTPBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    };
    const auth = extractAuthSuggestion(spec);
    expect(auth).toEqual({
      type: 'bearer',
      schemeName: 'HTTPBearer',
      description: 'JWT',
    });
  });

  it('detects API Key security scheme', () => {
    const spec: OpenAPISpec = {
      ...minimalSpec,
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    };
    const auth = extractAuthSuggestion(spec);
    expect(auth).toEqual({
      type: 'api_key',
      schemeName: 'ApiKey',
      headerName: 'X-API-Key',
    });
  });

  it('detects Basic security scheme', () => {
    const spec: OpenAPISpec = {
      ...minimalSpec,
      components: {
        securitySchemes: {
          BasicAuth: { type: 'http', scheme: 'basic' },
        },
      },
    };
    const auth = extractAuthSuggestion(spec);
    expect(auth).toEqual({ type: 'basic', schemeName: 'BasicAuth' });
  });

  it('prefers Bearer over API Key', () => {
    const spec: OpenAPISpec = {
      ...minimalSpec,
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
          HTTPBearer: { type: 'http', scheme: 'bearer' },
        },
      },
    };
    const auth = extractAuthSuggestion(spec);
    expect(auth!.type).toBe('bearer');
  });
});
