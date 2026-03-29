# OpenAPI 自动导入 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 `mcp-live-bridge import` 命令，从 OpenAPI/Swagger spec 自动生成 mcp-live-bridge 配置文件。

**Architecture:** 新增 `src/openapi/` 模块负责解析 OpenAPI spec 并转换为 ToolDef[]。新增 `import` CLI 子命令，支持从 URL 或本地文件加载 spec，交互式选择端点，最终输出 YAML 配置文件。不修改现有模块，纯新增代码。

**Tech Stack:** TypeScript, commander (已有), js-yaml (已有), Node.js fetch (内建)

---

## Chunk 1: OpenAPI 解析器核心

### Task 1: OpenAPI 类型定义和解析器

**Files:**
- Create: `src/openapi/types.ts`
- Create: `src/openapi/parser.ts`
- Test: `tests/openapi/parser.test.ts`

- [ ] **Step 1: 定义 OpenAPI 类型**

```typescript
// src/openapi/types.ts

/** 简化的 OpenAPI 3.x 路径项 */
export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  tags?: string[];
}

export type OpenAPIParameterLocation = 'query' | 'header' | 'path' | 'cookie';

export interface OpenAPIParameter {
  name: string;
  in: OpenAPIParameterLocation;
  required?: boolean;
  description?: string;
  schema?: {
    type?: string;
    format?: string;
    enum?: string[];
    default?: any;
    items?: { type?: string };
  };
}

export interface OpenAPIRequestBody {
  required?: boolean;
  content?: Record<string, OpenAPIMediaType>;
}

export interface OpenAPIMediaType {
  schema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; format?: string; items?: any }>;
    required?: string[];
  };
}

export interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
  description?: string;
}

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: { url: string; description?: string }[];
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
  security?: Record<string, string[]>[];
}
```

- [ ] **Step 2: 编写解析器测试**

```typescript
// tests/openapi/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseOpenAPISpec, extractEndpoints } from '../../src/openapi/parser.js';
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
    const get = endpoints.find((e) => e.method === 'DELETE' && e.path === '/users/{id}');
    expect(get).toBeDefined();
    expect(get!.name).toMatch(/^delete/);
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
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/openapi/parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 实现解析器**

```typescript
// src/openapi/parser.ts
import type { OpenAPISpec, OpenAPIPathItem, OpenAPIOperation } from './types.js';
import type { ToolDef, ParameterDef } from '../config/types.js';

export function parseOpenAPISpec(raw: string): OpenAPISpec {
  const parsed = JSON.parse(raw);
  if (!parsed.openapi && !parsed.swagger) {
    throw new Error('Invalid OpenAPI spec: must have "openapi" or "swagger" field');
  }
  return parsed as OpenAPISpec;
}

export interface ExtractedEndpoint {
  name: string;
  description: string;
  method: string;
  path: string;
  url: string;
  parameters: ParameterDef[];
  body?: string;
}

export function extractEndpoints(spec: OpenAPISpec): ExtractedEndpoint[] {
  const baseUrl = spec.servers?.[0]?.url ?? '';
  const endpoints: ExtractedEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
    for (const method of methods) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      const endpoint = convertOperation(method.toUpperCase(), path, baseUrl, operation);
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

function convertOperation(
  method: string,
  path: string,
  baseUrl: string,
  operation: OpenAPIOperation
): ExtractedEndpoint {
  const name = operation.operationId ?? generateName(method, path);
  const description = operation.description || operation.summary || `${method} ${path}`;

  // Convert path params: {id} -> {{params.id}}
  const urlPath = path.replace(/\{(\w+)\}/g, '{{params.$1}}');
  const url = `${baseUrl}${urlPath}`;

  const parameters: ParameterDef[] = [];
  const bodyParams: { name: string; def: ParameterDef }[] = [];

  // Process OpenAPI parameters (query, path, header)
  for (const param of operation.parameters ?? []) {
    if (param.in === 'cookie') continue; // skip cookie params
    parameters.push({
      name: param.name,
      type: mapSchemaType(param.schema?.type),
      required: param.required ?? false,
      description: param.description,
      location: param.in as 'query' | 'header' | 'path',
      enum: param.schema?.enum,
    });
  }

  // Process requestBody properties as body params
  const jsonContent = operation.requestBody?.content?.['application/json'];
  if (jsonContent?.schema?.properties) {
    const bodyFields: string[] = [];
    for (const [propName, propSchema] of Object.entries(jsonContent.schema.properties)) {
      const isRequired = jsonContent.schema.required?.includes(propName) ?? false;
      const paramDef: ParameterDef = {
        name: propName,
        type: mapSchemaType(propSchema.type),
        required: isRequired,
        description: propSchema.description,
        location: 'body',
        enum: propSchema.enum,
      };
      bodyParams.push({ name: propName, def: paramDef });
      parameters.push(paramDef);
    }

    if (bodyFields.length > 0 || bodyParams.length > 0) {
      const bodyTemplate = '{' +
        bodyParams.map((p) => `"${p.name}":"{{params.${p.name}}}"`).join(',') +
        '}';
      return { name, description, method, path, url, parameters, body: bodyTemplate };
    }
  }

  return { name, description, method, path, url, parameters };
}

function mapSchemaType(type?: string): 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' {
  switch (type) {
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default: return 'string';
  }
}

function generateName(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'root';
  const cleanSegment = lastSegment.replace(/\{(\w+)\}/, '$1');
  return `${method.toLowerCase()}_${cleanSegment}`;
}

export interface AuthSuggestion {
  type: 'bearer' | 'api_key' | 'oauth2' | 'basic';
  schemeName: string;
  description?: string;
  headerName?: string;
}

export function extractAuthSuggestion(spec: OpenAPISpec): AuthSuggestion | null {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return null;

  // Prefer the first http/bearer scheme
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      return { type: 'bearer', schemeName: name, description: scheme.bearerFormat };
    }
  }

  // Then apiKey
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'apiKey') {
      return { type: 'api_key', schemeName: name, headerName: scheme.name };
    }
  }

  // Then basic
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'basic') {
      return { type: 'basic', schemeName: name };
    }
  }

  return null;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/openapi/parser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/openapi/types.ts src/openapi/parser.ts tests/openapi/parser.test.ts
git commit -m "feat: add OpenAPI spec parser and endpoint extractor"
```

### Task 2: 配置文件生成器

**Files:**
- Create: `src/openapi/generator.ts`
- Test: `tests/openapi/generator.test.ts`

- [ ] **Step 1: 编写生成器测试**

```typescript
// tests/openapi/generator.test.ts
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
    const yaml = generateConfig({
      name: 'my-bridge',
      endpoints,
    });

    expect(yaml).toContain('name: my-bridge');
    expect(yaml).toContain('listUsers');
    expect(yaml).toContain('getUser');
    expect(yaml).toContain('limit');
    expect(yaml).toContain('id');
  });

  it('generates config with bearer auth suggestion', () => {
    const auth: AuthSuggestion = { type: 'bearer', schemeName: 'HTTPBearer', description: 'JWT' };
    const yaml = generateConfig({ name: 'my-bridge', endpoints, auth });

    expect(yaml).toContain('provider: bearer');
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
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/openapi/generator.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现生成器**

```typescript
// src/openapi/generator.ts
import * as yaml from 'js-yaml';
import type { ExtractedEndpoint, AuthSuggestion } from './parser.js';
import type { BridgeConfig, ToolDef, ParameterDef } from '../config/types.js';

interface GenerateOptions {
  name: string;
  endpoints: ExtractedEndpoint[];
  auth?: AuthSuggestion | null;
  selectedIndices?: number[];
  port?: number;
}

export function generateConfig(options: GenerateOptions): string {
  const endpoints = options.selectedIndices
    ? options.selectedIndices.map((i) => options.endpoints[i])
    : options.endpoints;

  const tools: ToolDef[] = endpoints.map((ep) => ({
    name: ep.name,
    description: ep.description,
    url: ep.url,
    method: ep.method,
    ...(ep.body ? { body: ep.body } : {}),
    parameters: ep.parameters.length > 0
      ? Object.fromEntries(ep.parameters.map((p) => [p.name, toParamDef(p)]))
      : undefined,
  }));

  const config: Record<string, any> = { name: options.name, version: '1.0' };

  if (options.port) {
    config.server = { port: options.port };
  }

  if (options.auth) {
    config.auth = generateAuthConfig(options.auth);
  } else {
    // Placeholder auth that users must fill in
    config.auth = {
      provider: 'bearer',
      config: {
        token: 'YOUR_TOKEN_HERE',
      },
    };
  }

  if (tools.length > 0) {
    config.tools = tools;
  }

  return yaml.dump(config, { lineWidth: 120, noRefs: true });
}

function toParamDef(p: ParameterDef): ParameterDef {
  return {
    type: p.type,
    required: p.required,
    description: p.description,
    location: p.location,
    ...(p.enum ? { enum: p.enum } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
  };
}

function generateAuthConfig(auth: AuthSuggestion): Record<string, any> {
  switch (auth.type) {
    case 'bearer':
      return {
        provider: 'bearer',
        config: { token: 'YOUR_TOKEN_HERE' },
      };
    case 'api_key':
      return {
        provider: 'bearer',
        config: {
          token: 'YOUR_API_KEY_HERE',
          header_name: auth.headerName ?? 'Authorization',
        },
      };
    case 'basic':
      return {
        provider: 'form',
        config: { username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' },
      };
    case 'oauth2':
      return {
        provider: 'oauth2',
        config: {
          token_url: 'YOUR_TOKEN_URL',
          client_id: 'YOUR_CLIENT_ID',
          client_secret: 'YOUR_CLIENT_SECRET',
          grant_type: 'client_credentials',
        },
      };
    default:
      return { provider: 'bearer', config: { token: 'YOUR_TOKEN_HERE' } };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/openapi/generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/openapi/generator.ts tests/openapi/generator.test.ts
git commit -m "feat: add OpenAPI to bridge config generator"
```

## Chunk 2: CLI 集成

### Task 3: 添加 `import` CLI 子命令

**Files:**
- Modify: `src/index.ts` (添加 import 命令)
- Test: `tests/openapi/import.test.ts`

- [ ] **Step 1: 编写 CLI 集成测试**

```typescript
// tests/openapi/import.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;

const spec = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0' },
  servers: [{ url: 'http://localhost:' + 0 }], // will be replaced
  paths: {
    '/items': {
      get: { operationId: 'listItems', summary: 'List items' },
    },
    '/items/{id}': {
      get: {
        summary: 'Get item',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      },
    },
  },
};

beforeAll(async () => {
  spec.servers[0].url = `http://localhost:0`; // placeholder, actual port set below
  server = await new Promise<Server>((resolve) => {
    const srv = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      spec.servers[0].url = `http://localhost:${port}`;
      res.end(JSON.stringify(spec));
    });
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(srv);
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('import command', () => {
  it('fetches spec from URL and generates config', async () => {
    // 测试 importFromUrl 能正确从 HTTP 获取并解析
    const { importFromUrl } = await import('../../src/openapi/import.js');
    const result = await importFromUrl(`http://127.0.0.1:${port}/openapi.json`, { name: 'test-bridge' });
    expect(result.config).toContain('test-bridge');
    expect(result.config).toContain('listItems');
    expect(result.config).toContain('getItem');
    expect(result.endpoints).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/openapi/import.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 import 模块**

```typescript
// src/openapi/import.ts
import { readFileSync } from 'node:fs';
import { parseOpenAPISpec, extractEndpoints, extractAuthSuggestion } from './parser.js';
import type { ExtractedEndpoint, AuthSuggestion } from './parser.js';
import { generateConfig } from './generator.js';

export interface ImportResult {
  config: string;
  endpoints: ExtractedEndpoint[];
  auth: AuthSuggestion | null;
}

export async function importFromUrl(
  url: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): Promise<ImportResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);
  }
  const raw = await response.text();
  return importFromSpec(raw, options);
}

export function importFromFile(
  filePath: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): ImportResult {
  const raw = readFileSync(filePath, 'utf-8');
  return importFromSpec(raw, options);
}

function importFromSpec(
  raw: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): ImportResult {
  const spec = parseOpenAPISpec(raw);
  const endpoints = extractEndpoints(spec);
  const auth = extractAuthSuggestion(spec);

  const config = generateConfig({
    name: options.name,
    endpoints,
    auth,
    port: options.port,
    selectedIndices: options.selectedIndices,
  });

  return { config, endpoints, auth };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/openapi/import.test.ts`
Expected: PASS

- [ ] **Step 5: 在 CLI 中注册 import 命令**

在 `src/index.ts` 中，在 `program.parse()` 之前添加：

```typescript
program
  .command('import')
  .description('Generate bridge config from an OpenAPI/Swagger spec')
  .requiredOption('-u, --url <url>', 'URL to OpenAPI spec (JSON)')
  .option('-f, --file <path>', 'Local OpenAPI spec file path')
  .option('-n, --name <name>', 'Bridge name', 'mcp-bridge')
  .option('-p, --port <number>', 'Server port')
  .option('-o, --output <path>', 'Output file path', 'bridge-config.yaml')
  .option('--all', 'Import all endpoints (skip selection)', false)
  .action(async (options) => {
    try {
      if (!options.url && !options.file) {
        console.error('Error: Provide either --url or --file');
        process.exit(1);
      }

      const importOpts = {
        name: options.name,
        port: options.port ? parseInt(options.port, 10) : undefined,
      };

      let result: Awaited<ReturnType<typeof importFromUrl>>;
      if (options.url) {
        const { importFromUrl } = await import('./openapi/import.js');
        result = await importFromUrl(options.url, importOpts);
      } else {
        const { importFromFile } = await import('./openapi/import.js');
        result = importFromFile(options.file, importOpts);
      }

      // Output config
      const { writeFileSync } = await import('node:fs');
      writeFileSync(options.output, result.config, 'utf-8');

      console.log(`Generated config: ${options.output}`);
      console.log(`  Endpoints: ${result.endpoints.length}`);
      if (result.auth) {
        console.log(`  Auth detected: ${result.auth.type} (${result.auth.schemeName})`);
      }
      console.log(`\nReview and edit ${options.output} to add your credentials, then run:`);
      console.log(`  mcp-live-bridge start -c ${options.output}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 7: 验证 list 子命令能列出 import 的工具**

Run:
```bash
node dist/index.js import -u http://localhost:8000/openapi.json -n jwt-bridge -o /tmp/test-import.yaml
node dist/index.js list -c /tmp/test-import.yaml
```
Expected: 列出从 OpenAPI 导入的所有端点

- [ ] **Step 8: Commit**

```bash
git add src/openapi/import.ts src/index.ts tests/openapi/import.test.ts
git commit -m "feat: add import CLI command for OpenAPI spec"
```

## Chunk 3: 索引文件和导出

### Task 4: 创建 openapi 模块索引和更新 tsup 配置

**Files:**
- Create: `src/openapi/index.ts`
- Modify: `README.md` 和 `README_zh.md` (添加 import 命令文档)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 创建模块索引**

```typescript
// src/openapi/index.ts
export { parseOpenAPISpec, extractEndpoints, extractAuthSuggestion } from './parser.js';
export type { OpenAPISpec, OpenAPIPathItem, OpenAPIOperation, OpenAPIParameter, OpenAPIRequestBody, OpenAPIMediaType, OpenAPISecurityScheme } from './types.js';
export type { ExtractedEndpoint, AuthSuggestion } from './parser.js';
export { generateConfig } from './generator.js';
export { importFromUrl, importFromFile } from './import.js';
export type { ImportResult } from './import.js';
```

- [ ] **Step 2: 在两个 README 中添加 import 命令文档**

在 README.md 的 "CLI Commands" 部分后添加：

```markdown
### Import from OpenAPI

```bash
# Import from a remote OpenAPI spec
mcp-live-bridge import -u https://api.example.com/openapi.json -n my-bridge

# Import from a local file
mcp-live-bridge import -f ./openapi.yaml -n my-bridge

# Specify output file and port
mcp-live-bridge import -u https://api.example.com/openapi.json -n my-bridge -o config.yaml -p 9090
```
```

在 README_zh.md 对应位置添加中文版。

- [ ] **Step 3: 更新 CHANGELOG.md**

在 `[0.1.0]` 之下添加新的 `## [Unreleased]` 部分：

```markdown
## [Unreleased]

### Added
- `import` CLI command to generate bridge config from OpenAPI/Swagger specs
- OpenAPI spec parser supporting OpenAPI 3.x and Swagger 2.0
- Automatic auth scheme detection (Bearer, API Key, Basic)
- Config generator that converts OpenAPI endpoints to tool definitions
```

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/openapi/index.ts README.md README_zh.md CHANGELOG.md
git commit -m "docs: add OpenAPI import command documentation and changelog"
```
