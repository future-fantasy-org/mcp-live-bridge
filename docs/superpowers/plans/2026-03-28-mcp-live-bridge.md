# mcp-live-bridge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that reads config files (JSON/YAML/TOML) and exposes external HTTP APIs as MCP tools via the SSE protocol.

**Architecture:** Pipeline architecture with clear module boundaries. Config Loader → Tool Registry → SSE Server. Each tool call flows through: Auth Middleware → Template Engine → HTTP Client → Response Transformer. Auth Lifecycle Manager runs independently with mutex-protected refresh.

**Tech Stack:** TypeScript, Node.js >= 18, @modelcontextprotocol/sdk, Zod, Handlebars, jsonpath-plus, Commander, tsup, Vitest

**Design Spec:** `docs/superpowers/specs/2026-03-28-mcp-live-bridge-design.md`

---

## Chunk 1: Foundation (Project scaffolding + Config + Logger)

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "mcp-live-bridge",
  "version": "0.1.0",
  "description": "Config-driven CLI that exposes external HTTP APIs as MCP tools",
  "type": "module",
  "bin": {
    "mcp-live-bridge": "./dist/index.js"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "start": "node dist/index.js"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/cong/workspace/mcp-live-bridge && npm install @modelcontextprotocol/sdk zod commander js-yaml toml handlebars jsonpath-plus chalk`
Run: `npm install -D typescript tsup vitest @types/node @types/js-yaml @types/toml`

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  sourcemap: true,
});
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 7: Create src directory structure**

Run: `mkdir -p src/config src/auth src/tool src/server src/utils tests`

- [ ] **Step 8: Verify build works**

Create a minimal `src/index.ts`:
```typescript
console.log('mcp-live-bridge');
```

Run: `npm run build`
Expected: builds successfully, produces `dist/index.js`

- [ ] **Step 9: Verify test works**

Create `tests/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('placeholder', () => {
  it('passes', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passes

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with TypeScript, tsup, vitest"
```

---

### Task 2: Logger Utility

**Files:**
- Create: `src/utils/logger.ts`
- Test: `tests/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, type Logger } from '../src/utils/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let logger: Logger;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger = createLogger('default');
  });

  it('logs info messages with prefix', () => {
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[mcp-live-bridge]'),
      expect.stringContaining('test message')
    );
  });

  it('logs verbose messages only in verbose mode', () => {
    logger.verbose('debug detail');
    expect(consoleSpy).not.toHaveBeenCalled();

    const verboseLogger = createLogger('verbose');
    consoleSpy.mockClear();
    verboseLogger.verbose('debug detail');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs errors in quiet mode', () => {
    const quietLogger = createLogger('quiet');
    quietLogger.info('should not show');
    expect(consoleSpy).not.toHaveBeenCalled();

    quietLogger.error('should show');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/logger.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```typescript
// src/utils/logger.ts
import chalk from 'chalk';

export type LogLevel = 'quiet' | 'default' | 'verbose';

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const prefix = chalk.dim('[mcp-live-bridge]');
  const isQuiet = level === 'quiet';
  const isVerbose = level === 'verbose';

  return {
    info(msg: string) {
      if (isQuiet) return;
      console.log(`${prefix} ${msg}`);
    },
    verbose(msg: string) {
      if (!isVerbose) return;
      console.log(`${prefix} ${chalk.dim(msg)}`);
    },
    warn(msg: string) {
      if (isQuiet) return;
      console.log(`${prefix} ${chalk.yellow(msg)}`);
    },
    error(msg: string) {
      console.log(`${prefix} ${chalk.red(msg)}`);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/logger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/logger.ts tests/logger.test.ts
git commit -m "feat: add logger utility with quiet/default/verbose levels"
```

---

### Task 3: Config Types + Zod Schema

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/schema.ts`
- Test: `tests/config/schema.test.ts`

- [ ] **Step 1: Write config types**

```typescript
// src/config/types.ts
export interface ParameterDef {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  description?: string;
  location: 'query' | 'body' | 'header' | 'path';
  enum?: string[];
}

export interface ResponseDef {
  extract?: string;
  template?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  content_type?: string;
  body?: string;
  parameters?: Record<string, ParameterDef>;
  response?: ResponseDef;
}

export interface ValidationDef {
  check_url: string;
  check_method?: string;
  check_body?: string;
  check_headers?: Record<string, string>;
  valid_when?: {
    status?: number;
    jsonpath_not_exists?: string;
    jsonpath_equals?: Record<string, any>;
    json_match?: { pattern: string };
  };
}

export interface RefreshDef {
  on_failure?: boolean;
  poll_interval?: number;
  retry_count?: number;
  retry_delay?: number;
}

export interface AuthDef {
  provider: string;
  config: Record<string, any>;
  validation?: ValidationDef;
  refresh?: RefreshDef;
}

export interface ServerDef {
  host?: string;
  port?: number;
  cors_origin?: string;
  timeout?: number;
}

export interface BridgeConfig {
  name: string;
  version?: string;
  server?: ServerDef;
  auth: AuthDef;
  headers?: Record<string, string>;
  tools: ToolDef[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/config/schema.test.ts
import { describe, it, expect } from 'vitest';
import { parseAndValidateConfig } from '../src/config/schema.js';
import * as path from 'path';

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
    expect(() => parseAndValidateConfig({ ...validConfig, name: undefined }))
      .toThrow();
  });

  it('rejects config without auth', () => {
    expect(() => parseAndValidateConfig({ name: 'test', auth: undefined, tools: [] }))
      .toThrow();
  });

  it('rejects config with empty tools', () => {
    expect(() => parseAndValidateConfig({ ...validConfig, tools: [] }))
      .toThrow();
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
    const config = {
      ...validConfig,
      auth: {
        ...validConfig.auth,
        refresh: {},
      },
    };
    const result = parseAndValidateConfig(config);
    expect(result.auth.refresh!.on_failure).toBe(true);
    expect(result.auth.refresh!.retry_count).toBe(3);
    expect(result.auth.refresh!.retry_delay).toBe(5);
    expect(result.auth.refresh!.poll_interval).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Write Zod schema**

```typescript
// src/config/schema.ts
import { z } from 'zod';
import type { BridgeConfig } from './types.js';

const parameterDefSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
  required: z.boolean().optional(),
  default: z.any().optional(),
  description: z.string().optional(),
  location: z.enum(['query', 'body', 'header', 'path']),
  enum: z.array(z.string()).optional(),
});

const responseDefSchema = z.object({
  extract: z.string().optional(),
  template: z.string().optional(),
});

const toolDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  method: z.string().toUpperCase(),
  headers: z.record(z.string()).optional(),
  content_type: z.string().optional(),
  body: z.string().optional(),
  parameters: z.record(parameterDefSchema).optional(),
  response: responseDefSchema.optional(),
});

const validWhenSchema = z.object({
  status: z.number().optional(),
  jsonpath_not_exists: z.string().optional(),
  jsonpath_equals: z.record(z.any()).optional(),
  json_match: z.object({ pattern: z.string() }).optional(),
});

const validationDefSchema = z.object({
  check_url: z.string(),
  check_method: z.string().optional(),
  check_body: z.string().optional(),
  check_headers: z.record(z.string()).optional(),
  valid_when: validWhenSchema.optional(),
});

const refreshDefSchema = z.object({
  on_failure: z.boolean().default(true),
  poll_interval: z.number().optional(),
  retry_count: z.number().default(3),
  retry_delay: z.number().default(5),
});

const authDefSchema = z.object({
  provider: z.string().min(1),
  config: z.record(z.any()),
  validation: validationDefSchema.optional(),
  refresh: refreshDefSchema.optional(),
});

const serverDefSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().default(8080),
  cors_origin: z.string().default('*'),
  timeout: z.number().default(30000),
}).optional();

const configSchema = z.object({
  name: z.string().min(1),
  version: z.string().default('1.0'),
  server: serverDefSchema,
  auth: authDefSchema,
  headers: z.record(z.string()).optional(),
  tools: z.array(toolDefSchema).min(1),
});

export function parseAndValidateConfig(input: unknown): BridgeConfig {
  return configSchema.parse(input) as BridgeConfig;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/types.ts src/config/schema.ts tests/config/schema.test.ts
git commit -m "feat: config types and Zod validation schema"
```

---

### Task 4: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Test: `tests/config/loader.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config/loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlb-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTmp(filename: string, content: string) {
    fs.writeFileSync(path.join(tmpDir, filename), content);
  }

  it('loads YAML config', () => {
    writeTmp('test.yaml', `
name: yaml-bridge
auth:
  provider: form
  config:
    login_url: https://example.com/login
    username: u
    password: p
tools:
  - name: t1
    description: test
    url: https://api.example.com/t
    method: GET
`);
    const config = loadConfig(path.join(tmpDir, 'test.yaml'));
    expect(config.name).toBe('yaml-bridge');
  });

  it('loads JSON config', () => {
    writeTmp('test.json', JSON.stringify({
      name: 'json-bridge',
      auth: { provider: 'form', config: { login_url: 'https://x.com', username: 'u', password: 'p' } },
      tools: [{ name: 't1', description: 'test', url: 'https://api.example.com/t', method: 'GET' }],
    }));
    const config = loadConfig(path.join(tmpDir, 'test.json'));
    expect(config.name).toBe('json-bridge');
  });

  it('loads TOML config', () => {
    writeTmp('test.toml', `
name = "toml-bridge"

[auth]
provider = "form"

[auth.config]
login_url = "https://example.com/login"
username = "u"
password = "p"

[[tools]]
name = "t1"
description = "test"
url = "https://api.example.com/t"
method = "GET"
`);
    const config = loadConfig(path.join(tmpDir, 'test.toml'));
    expect(config.name).toBe('toml-bridge');
  });

  it('throws on unsupported file extension', () => {
    writeTmp('test.xml', '<config/>');
    expect(() => loadConfig(path.join(tmpDir, 'test.xml'))).toThrow('Unsupported config format');
  });

  it('throws on invalid config content', () => {
    writeTmp('test.yaml', 'name: bad\nauth:');
    expect(() => loadConfig(path.join(tmpDir, 'test.yaml'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```typescript
// src/config/loader.ts
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { parseAndValidateConfig } from './schema.js';
import type { BridgeConfig } from './types.js';

export function loadConfig(filePath: string): BridgeConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  let parsed: unknown;
  switch (ext) {
    case '.json':
      parsed = JSON.parse(raw);
      break;
    case '.yaml':
    case '.yml':
      parsed = yaml.load(raw);
      break;
    case '.toml':
      parsed = toml.parse(raw);
      break;
    default:
      throw new Error(`Unsupported config format: ${ext}. Use .json, .yaml, .yml, or .toml`);
  }

  return parseAndValidateConfig(parsed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/loader.ts tests/config/loader.test.ts
git commit -m "feat: config loader supporting JSON, YAML, TOML"
```

---

## Chunk 2: Template Engine + Response Transformer + HTTP Client

### Task 5: Template Engine

**Files:**
- Create: `src/tool/template.ts`
- Test: `tests/tool/template.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tool/template.test.ts
import { describe, it, expect } from 'vitest';
import { renderUrl, renderBody, renderHeaders, renderQueryParams } from '../src/tool/template.js';

describe('renderUrl', () => {
  it('replaces path parameters', () => {
    const result = renderUrl(
      'https://api.example.com/users/{{params.id}}/posts/{{params.postId}}',
      { id: '123', postId: '456' }
    );
    expect(result).toBe('https://api.example.com/users/123/posts/456');
  });

  it('leaves URL unchanged when no path params', () => {
    const result = renderUrl('https://api.example.com/search', { q: 'test' });
    expect(result).toBe('https://api.example.com/search');
  });
});

describe('renderBody', () => {
  it('renders body template with params', () => {
    const template = '{"title":"{{params.title}}","content":"{{params.content}}"}';
    const result = renderBody(template, { title: 'Hello', content: 'World' });
    expect(result).toBe('{"title":"Hello","content":"World"}');
  });

  it('returns undefined when no body template', () => {
    expect(renderBody(undefined, {})).toBeUndefined();
  });
});

describe('renderHeaders', () => {
  it('renders header templates with auth context', () => {
    const headers = {
      Authorization: 'Bearer {{auth.token}}',
      'X-Static': 'fixed-value',
    };
    const result = renderHeaders(headers, { token: 'abc123' }, {});
    expect(result.Authorization).toBe('Bearer abc123');
    expect(result['X-Static']).toBe('fixed-value');
  });

  it('tool-level headers override global headers', () => {
    const global = { Accept: 'text/plain', 'X-Custom': 'global' };
    const tool = { Accept: 'application/json' };
    const result = renderHeaders(tool, { token: 'abc123' }, {}, global);
    expect(result.Accept).toBe('application/json');
    expect(result['X-Custom']).toBe('global');
  });

  it('auth headers have lowest priority, tool/global can override', () => {
    const authHeaders = { Authorization: 'Bearer old', 'X-From-Auth': 'auth-val' };
    const global = { 'X-From-Auth': 'global-override', Accept: 'text/plain' };
    const tool = { Accept: 'application/json' };
    const result = renderHeaders(tool, {}, {}, global, authHeaders);
    // Auth lowest → global overrides auth → tool overrides global
    expect(result.Authorization).toBe('Bearer old');         // auth only, not overridden
    expect(result['X-From-Auth']).toBe('global-override');   // global overrides auth
    expect(result.Accept).toBe('application/json');          // tool overrides global
  });

  it('injects header-location parameters into request headers', () => {
    const paramDefs = {
      'X-Request-Id': { type: 'string' as const, location: 'header' as const, required: true },
    };
    const params = { 'X-Request-Id': '12345' };
    const result = renderHeaders({}, {}, params, {}, {});
    expect(result['X-Request-Id']).toBe('12345');
  });
});

describe('renderQueryParams', () => {
  it('builds query string from params with query location', () => {
    const params = { keyword: 'test', limit: 10 };
    const paramDefs = {
      keyword: { type: 'string' as const, location: 'query' as const, required: true },
      limit: { type: 'integer' as const, location: 'query' as const, default: 10 },
    };
    const result = renderQueryParams(params, paramDefs);
    expect(result).toBe('?keyword=test&limit=10');
  });

  it('returns empty string when no query params', () => {
    const result = renderQueryParams({}, {});
    expect(result).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool/template.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/tool/template.ts
import Handlebars from 'handlebars';
import type { ParameterDef } from '../config/types.js';

Handlebars.registerHelper('json', (context: any) => JSON.stringify(context));

export function renderUrl(urlTemplate: string, params: Record<string, any>): string {
  const template = Handlebars.compile(urlTemplate, { noEscape: true });
  return template({ params });
}

export function renderBody(
  bodyTemplate: string | undefined,
  params: Record<string, any>
): string | undefined {
  if (!bodyTemplate) return undefined;
  const template = Handlebars.compile(bodyTemplate, { noEscape: true });
  return template({ params });
}

export function renderHeaders(
  toolHeaders: Record<string, string> | undefined,
  authContext: Record<string, any>,
  params: Record<string, any>,
  globalHeaders?: Record<string, string>,
  authProviderHeaders?: Record<string, string>
): Record<string, string> {
  // Priority: auth headers (lowest) → global headers → tool headers (highest)
  const merged = { ...(authProviderHeaders ?? {}), ...(globalHeaders ?? {}), ...toolHeaders };
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(merged)) {
    const template = Handlebars.compile(value, { noEscape: true });
    result[key] = template({ auth: authContext, params });
  }

  return result;
}

export function renderQueryParams(
  params: Record<string, any>,
  paramDefs: Record<string, ParameterDef>
): string {
  const queryParams: string[] = [];

  for (const [name, def] of Object.entries(paramDefs)) {
    if (def.location !== 'query') continue;
    const value = params[name] ?? def.default;
    if (value !== undefined && value !== null) {
      queryParams.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }

  return queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool/template.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tool/template.ts tests/tool/template.test.ts
git commit -m "feat: template engine with Handlebars for URL, body, headers, query"
```

---

### Task 6: Response Transformer

**Files:**
- Create: `src/tool/transformer.ts`
- Test: `tests/tool/transformer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tool/transformer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { transformResponse } from '../src/tool/transformer.js';
import type { ResponseDef } from '../src/config/types.js';

describe('transformResponse', () => {
  it('returns raw body when no response config', () => {
    expect(transformResponse('{"key":"value"}', undefined)).toBe('{"key":"value"}');
  });

  it('returns raw string when no response config and non-JSON body', () => {
    expect(transformResponse('plain text response', undefined)).toBe('plain text response');
  });

  it('extracts with JSONPath', () => {
    const body = '{"data":{"id":42,"name":"test"}}';
    const response: ResponseDef = { extract: '$.data.id' };
    expect(transformResponse(body, response)).toBe(42);
  });

  it('extracts array with JSONPath', () => {
    const body = '{"results":[{"title":"A"},{"title":"B"}]}';
    const response: ResponseDef = { extract: '$.results[*].title' };
    const result = transformResponse(body, response);
    expect(result).toEqual(['A', 'B']);
  });

  it('extracts root with $', () => {
    const body = '{"everything":true}';
    const response: ResponseDef = { extract: '$' };
    expect(transformResponse(body, response)).toEqual({ everything: true });
  });

  it('applies Handlebars template after extraction', () => {
    const body = '{"results":[{"title":"Doc1","url":"/1"},{"title":"Doc2","url":"/2"}]}';
    const response: ResponseDef = {
      extract: '$.results',
      template: '{{#each this}}- {{title}} ({{url}})\n{{/each}}',
    };
    const result = transformResponse(body, response);
    expect(result).toContain('- Doc1 (/1)');
    expect(result).toContain('- Doc2 (/2)');
  });

  it('returns raw body on JSONPath failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = 'not json at all';
    const response: ResponseDef = { extract: '$.missing' };
    const result = transformResponse(body, response);
    expect(result).toBe('not json at all');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns extracted data when template fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = '{"results":42}';
    const response: ResponseDef = {
      extract: '$.results',
      template: '{{#each this}}bad{{/each}}',
    };
    const result = transformResponse(body, response);
    expect(result).toBe(42);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool/transformer.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/tool/transformer.ts
import { JSONPath } from 'jsonpath-plus';
import Handlebars from 'handlebars';
import type { ResponseDef } from '../config/types.js';

export function transformResponse(body: string, responseDef: ResponseDef | undefined): any {
  // No response config → raw body
  if (!responseDef) return body;

  // Try parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Non-JSON response → return raw body as string
    return body;
  }

  // If no extract, return full parsed JSON (or pass to template if present)
  if (!responseDef.extract) {
    if (responseDef.template) {
      return applyTemplate(parsed, responseDef.template);
    }
    return parsed;
  }

  // JSONPath extraction
  try {
    const extracted = JSONPath({ path: responseDef.extract, json: parsed, wrap: false });

    if (responseDef.template) {
      return applyTemplate(extracted, responseDef.template);
    }

    return extracted;
  } catch (err) {
    console.warn(`[mcp-live-bridge] JSONPath extraction failed: ${err}. Returning raw body.`);
    return parsed;
  }
}

function applyTemplate(data: any, templateStr: string): any {
  try {
    const template = Handlebars.compile(templateStr, { noEscape: true });
    return template(data);
  } catch (err) {
    console.warn(`[mcp-live-bridge] Template rendering failed: ${err}. Returning extracted data.`);
    return data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool/transformer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tool/transformer.ts tests/tool/transformer.test.ts
git commit -m "feat: response transformer with JSONPath extraction and Handlebars templates"
```

---

### Task 7: HTTP Client

**Files:**
- Create: `src/utils/http.ts`
- Test: `tests/http.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/http.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpClient } from '../src/utils/http.js';
import * as http from 'node:http';

describe('HttpClient', () => {
  let server: http.Server;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (req.url === '/ok') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else if (req.url === '/error') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
        } else if (req.url === '/slow') {
          // never responds
        } else if (req.url === '/echo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(body);
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(async () => {
    await closeServer();
  });

  it('makes GET request and returns response', async () => {
    const client = createHttpClient({ timeout: 5000 });
    const result = await client.request({
      url: `${baseUrl}/ok`,
      method: 'GET',
      headers: {},
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"status":"ok"}');
  });

  it('makes POST request with body', async () => {
    const client = createHttpClient({ timeout: 5000 });
    const result = await client.request({
      url: `${baseUrl}/echo`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"key":"value"}');
  });

  it('throws on timeout', async () => {
    const client = createHttpClient({ timeout: 100 });
    await expect(
      client.request({ url: `${baseUrl}/slow`, method: 'GET', headers: {} })
    ).rejects.toThrow('timeout');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/http.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/utils/http.ts
export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface HttpClientOptions {
  timeout?: number;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const timeout = options.timeout ?? 30000;

  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          signal: controller.signal,
        });

        const responseBody = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          body: responseBody,
          headers,
        };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error(`Request to ${req.url} timed out after ${timeout}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/http.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/http.ts tests/http.test.ts
git commit -m "feat: HTTP client with timeout support"
```

---

## Chunk 3: Auth System

### Task 8: Auth Provider Interface + Custom Provider Loader

**Files:**
- Create: `src/auth/provider.ts`
- Create: `src/auth/loader.ts`
- Test: `tests/auth/loader.test.ts`

- [ ] **Step 1: Write the provider interface**

```typescript
// src/auth/provider.ts
export interface AuthProvider {
  init(config: Record<string, any>): Promise<void>;
  getAuthHeaders(): Promise<Record<string, string>>;
  isValid(): Promise<boolean>;
  refresh(): Promise<void>;
  dispose(): Promise<void>;
  getAuthContext?(): Promise<Record<string, any>>;
}
```

- [ ] **Step 2: Write the failing test for loader**

```typescript
// tests/auth/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAuthProvider } from '../src/auth/loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('loadAuthProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlb-auth-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads built-in form provider', () => {
    const provider = loadAuthProvider('form');
    expect(provider).toBeDefined();
    expect(typeof provider.init).toBe('function');
    expect(typeof provider.getAuthHeaders).toBe('function');
    expect(typeof provider.isValid).toBe('function');
    expect(typeof provider.refresh).toBe('function');
    expect(typeof provider.dispose).toBe('function');
  });

  it('loads built-in oauth2 provider', () => {
    const provider = loadAuthProvider('oauth2');
    expect(provider).toBeDefined();
  });

  it('loads custom provider from JS file', async () => {
    const providerPath = path.join(tmpDir, 'my-auth.js');
    fs.writeFileSync(providerPath, `
export default class MyAuth {
  async init() {}
  async getAuthHeaders() { return {}; }
  async isValid() { return true; }
  async refresh() {}
  async dispose() {}
}
`);
    const provider = loadAuthProvider(providerPath);
    expect(provider).toBeDefined();
  });

  it('throws for unknown built-in name', () => {
    expect(() => loadAuthProvider('unknown')).toThrow('Unknown built-in auth provider');
  });

  it('throws for missing file', () => {
    expect(() => loadAuthProvider('/nonexistent/path.js')).toThrow('Auth provider file not found');
  });

  it('throws for file with invalid export', async () => {
    const providerPath = path.join(tmpDir, 'bad-auth.js');
    fs.writeFileSync(providerPath, `export default 42;`);
    expect(() => loadAuthProvider(providerPath)).toThrow('must be a class');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/auth/loader.test.ts`
Expected: FAIL

- [ ] **Step 4: Write loader implementation**

```typescript
// src/auth/loader.ts
import { existsSync } from 'node:fs';
import type { AuthProvider } from './provider.js';
import { FormAuthProvider } from './form.js';
import { OAuth2AuthProvider } from './oauth2.js';

const BUILTINS: Record<string, () => AuthProvider> = {
  form: () => new FormAuthProvider(),
  oauth2: () => new OAuth2AuthProvider(),
};

export function loadAuthProvider(providerNameOrPath: string): AuthProvider {
  if (BUILTINS[providerNameOrPath]) {
    return BUILTINS[providerNameOrPath]();
  }

  if (!existsSync(providerNameOrPath)) {
    throw new Error(`Auth provider file not found: ${providerNameOrPath}`);
  }

  // Dynamic import — this is sync at module level but the import itself is async
  // We load synchronously for simplicity; the file path is known at startup
  throw new Error(
    `Custom auth provider loading requires async initialization. Use loadAuthProviderAsync instead.`
  );
}

export async function loadAuthProviderAsync(providerNameOrPath: string): Promise<AuthProvider> {
  if (BUILTINS[providerNameOrPath]) {
    return BUILTINS[providerNameOrPath]();
  }

  if (!existsSync(providerNameOrPath)) {
    throw new Error(`Auth provider file not found: ${providerNameOrPath}`);
  }

  const mod = await import(providerNameOrPath);
  const ProviderClass = mod.default;

  if (typeof ProviderClass !== 'function' || !ProviderClass.prototype) {
    throw new Error(
      `Auth provider file ${providerNameOrPath} must have a default export that is a class`
    );
  }

  const requiredMethods = ['init', 'getAuthHeaders', 'isValid', 'refresh', 'dispose'];
  for (const method of requiredMethods) {
    if (typeof ProviderClass.prototype[method] !== 'function') {
      throw new Error(
        `Auth provider class from ${providerNameOrPath} is missing required method: ${method}`
      );
    }
  }

  return new ProviderClass();
}
```

- [ ] **Step 5: Update test to use async loader**

Update the test's `loadAuthProvider('form')` and `loadAuthProvider('oauth2')` calls to use `loadAuthProviderAsync`. For built-in providers, `loadAuthProvider` (sync) still works. For custom file providers, use `loadAuthProviderAsync`.

Update the custom provider tests:
```typescript
  it('loads custom provider from JS file', async () => {
    // ... (write file)
    const provider = await loadAuthProviderAsync(providerPath);
    expect(provider).toBeDefined();
  });

  it('throws for file with invalid export', async () => {
    // ... (write file)
    await expect(loadAuthProviderAsync(providerPath)).rejects.toThrow('must be a class');
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/auth/loader.test.ts`
Expected: PASS (Note: form and oauth2 tests need their implementations to exist — create stub files first if needed)

- [ ] **Step 7: Commit**

```bash
git add src/auth/provider.ts src/auth/loader.ts tests/auth/loader.test.ts
git commit -m "feat: auth provider interface and dynamic loader"
```

---

### Task 9: Form Auth Provider

**Files:**
- Create: `src/auth/form.ts`
- Test: `tests/auth/form.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/auth/form.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FormAuthProvider } from '../../src/auth/form.js';
import * as http from 'node:http';

describe('FormAuthProvider', () => {
  let server: http.Server;
  let baseUrl: string;

  function createServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    const s = http.createServer(handler);
    return new Promise<{ server: http.Server; url: string }>((resolve) => {
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address() as any;
        resolve({ server: s, url: `http://127.0.0.1:${addr.port}` });
      });
    });
  }

  it('authenticates and stores cookies', async () => {
    const { server: s, url } = await createServer((req, res) => {
      if (req.url === '/login') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=abc123; Path=/',
        });
        res.end('{"ok":true}');
      } else if (req.url === '/check') {
        const cookie = req.headers.cookie;
        res.writeHead(cookie ? 200 : 401);
        res.end(cookie ? '{"valid":true}' : '{"valid":false}');
      }
    });

    const provider = new FormAuthProvider();
    await provider.init({
      login_url: `${url}/login`,
      username: 'testuser',
      password: 'testpass',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers['Cookie']).toBe('session=abc123');

    const valid = await provider.isValid();
    expect(valid).toBe(true);

    await provider.dispose();
    s.close();
  });

  it('supports custom login_body template', async () => {
    const { server: s, url } = await createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        expect(parsed.user).toBe('myuser');
        expect(parsed.pass).toBe('mypass');
        res.writeHead(200, { 'Set-Cookie': 'token=xyz' });
        res.end('ok');
      });
    });

    const provider = new FormAuthProvider();
    await provider.init({
      login_url: `${url}/login`,
      login_body: '{"user":"{{username}}","pass":"{{password}}"}',
      login_headers: { 'Content-Type': 'application/json' },
      username: 'myuser',
      password: 'mypass',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers['Cookie']).toContain('token=xyz');

    await provider.dispose();
    s.close();
  });

  it('getAuthContext exposes cookies', async () => {
    const { server: s, url } = await createServer((req, res) => {
      res.writeHead(200, { 'Set-Cookie': 'sid=999' });
      res.end('ok');
    });

    const provider = new FormAuthProvider();
    await provider.init({ login_url: `${url}/login`, username: 'u', password: 'p' });

    const ctx = await provider.getAuthContext!();
    expect(ctx.cookies.sid).toBe('999');
    expect(ctx.cookie_header).toContain('sid=999');

    await provider.dispose();
    s.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/form.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/auth/form.ts
import Handlebars from 'handlebars';
import type { AuthProvider } from './provider.js';
import { createHttpClient } from '../utils/http.js';

export class FormAuthProvider implements AuthProvider {
  private cookies: Map<string, string> = new Map();
  private config: Record<string, any> = {};
  private httpClient = createHttpClient();
  private cookieString = '';

  async init(config: Record<string, any>): Promise<void> {
    this.config = config;
    await this.login();
  }

  private async login(): Promise<void> {
    let body: string | undefined;
    let headers: Record<string, string> = {};

    if (this.config.login_body) {
      const template = Handlebars.compile(this.config.login_body, { noEscape: true });
      body = template({ username: this.config.username, password: this.config.password });
      headers = { ...(this.config.login_headers ?? {}), 'Content-Type': 'application/json' };
    } else {
      const params = new URLSearchParams();
      params.append('username', this.config.username);
      params.append('password', this.config.password);
      body = params.toString();
      headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }

    const method = (this.config.login_method ?? 'POST').toUpperCase();
    const response = await this.httpClient.request({
      url: this.config.login_url,
      method,
      headers,
      body,
    });

    if (!response.headers['set-cookie']) {
      throw new Error(`Form login failed: no Set-Cookie header in response from ${this.config.login_url}`);
    }

    this.extractCookies(response.headers['set-cookie']);
  }

  private extractCookies(setCookieHeaders: string | string[]): void {
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    for (const header of headers) {
      const cookiePart = header.split(';')[0];
      const [name, ...valueParts] = cookiePart.split('=');
      this.cookies.set(name.trim(), valueParts.join('=').trim());
    }

    this.cookieString = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.cookieString) {
      await this.refresh();
    }
    return { Cookie: this.cookieString };
  }

  async isValid(): Promise<boolean> {
    // This is called by the AuthLifecycleManager using its own check_url logic.
    // The provider itself just checks if it has cookies.
    return this.cookies.size > 0;
  }

  async refresh(): Promise<void> {
    this.cookies.clear();
    this.cookieString = '';
    await this.login();
  }

  async dispose(): Promise<void> {
    this.cookies.clear();
    this.cookieString = '';
  }

  async getAuthContext(): Promise<Record<string, any>> {
    return {
      cookies: Object.fromEntries(this.cookies),
      cookie_header: this.cookieString,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/form.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/form.ts tests/auth/form.test.ts
git commit -m "feat: form auth provider with cookie management"
```

---

### Task 10: OAuth2 Auth Provider

**Files:**
- Create: `src/auth/oauth2.ts`
- Test: `tests/auth/oauth2.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/auth/oauth2.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { OAuth2AuthProvider } from '../../src/auth/oauth2.js';
import * as http from 'node:http';

function createServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const s = http.createServer(handler);
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address() as any;
      resolve({ server: s, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('OAuth2AuthProvider', () => {
  it('client_credentials grant: gets token and returns Bearer header', async () => {
    const { server: s, url } = await createServer((req, res) => {
      if (req.url === '/token') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'my-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }));
        });
      }
    });

    const provider = new OAuth2AuthProvider();
    await provider.init({
      grant_type: 'client_credentials',
      token_url: `${url}/token`,
      client_id: 'test-client',
      client_secret: 'test-secret',
      scope: 'read write',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer my-access-token');

    const ctx = await provider.getAuthContext!();
    expect(ctx.token).toBe('my-access-token');
    expect(ctx.token_type).toBe('Bearer');

    await provider.dispose();
    s.close();
  });

  it('stores refresh token and uses it on refresh', async () => {
    let callCount = 0;
    const { server: s, url } = await createServer((req, res) => {
      callCount++;
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // First call: return access + refresh token
        // Second call (refresh): return new access token
        const parsed = new URLSearchParams(body);
        if (parsed.get('grant_type') === 'refresh_token') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'new-access-token',
            token_type: 'Bearer',
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'initial-token',
            token_type: 'Bearer',
            refresh_token: 'my-refresh-token',
            expires_in: 3600,
          }));
        }
      });
    });

    const provider = new OAuth2AuthProvider();
    await provider.init({
      grant_type: 'client_credentials',
      token_url: `${url}/token`,
      client_id: 'c',
      client_secret: 's',
    });

    expect((await provider.getAuthHeaders())['Authorization']).toBe('Bearer initial-token');

    await provider.refresh();
    expect((await provider.getAuthHeaders())['Authorization']).toBe('Bearer new-access-token');
    expect(callCount).toBe(2); // init + refresh

    await provider.dispose();
    s.close();
  });

  it('authorization_code grant: uses provided code', async () => {
    const { server: s, url } = await createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const parsed = new URLSearchParams(body);
        expect(parsed.get('grant_type')).toBe('authorization_code');
        expect(parsed.get('code')).toBe('my-auth-code');
        expect(parsed.get('redirect_uri')).toBe('http://localhost:8080/callback');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'auth-code-token',
          token_type: 'Bearer',
          refresh_token: 'refresh-me',
        }));
      });
    });

    const provider = new OAuth2AuthProvider();
    await provider.init({
      grant_type: 'authorization_code',
      token_url: `${url}/token`,
      client_id: 'c',
      client_secret: 's',
      redirect_uri: 'http://localhost:8080/callback',
      code: 'my-auth-code',
    });

    expect((await provider.getAuthHeaders())['Authorization']).toBe('Bearer auth-code-token');

    await provider.dispose();
    s.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/oauth2.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/auth/oauth2.ts
import type { AuthProvider } from './provider.js';
import { createHttpClient } from '../utils/http.js';

export class OAuth2AuthProvider implements AuthProvider {
  private config: Record<string, any> = {};
  private accessToken = '';
  private refreshToken = '';
  private tokenType = 'Bearer';
  private httpClient = createHttpClient();

  async init(config: Record<string, any>): Promise<void> {
    this.config = config;
    await this.requestToken();
  }

  private async requestToken(params?: Record<string, string>): Promise<void> {
    const body = new URLSearchParams({
      grant_type: params?.grant_type ?? this.config.grant_type ?? 'client_credentials',
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      ...(this.config.scope ? { scope: this.config.scope } : {}),
      ...(params ?? {}),
    });

    // For authorization_code grant, include code and redirect_uri
    if (this.config.grant_type === 'authorization_code' && !params?.grant_type) {
      if (this.config.code) body.set('code', this.config.code);
      if (this.config.redirect_uri) body.set('redirect_uri', this.config.redirect_uri);
    }

    const response = await this.httpClient.request({
      url: this.config.token_url,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const tokenData = JSON.parse(response.body);

    if (!tokenData.access_token) {
      throw new Error(`OAuth2 token request failed: ${response.body}`);
    }

    this.accessToken = tokenData.access_token;
    this.tokenType = tokenData.token_type ?? 'Bearer';

    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.accessToken) {
      await this.refresh();
    }
    return { Authorization: `${this.tokenType} ${this.accessToken}` };
  }

  async isValid(): Promise<boolean> {
    return !!this.accessToken;
  }

  async refresh(): Promise<void> {
    if (this.refreshToken) {
      await this.requestToken({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      });
    } else {
      this.accessToken = '';
      await this.requestToken();
    }
  }

  async dispose(): Promise<void> {
    this.accessToken = '';
    this.refreshToken = '';
  }

  async getAuthContext(): Promise<Record<string, any>> {
    return {
      token: this.accessToken,
      token_type: this.tokenType,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/oauth2.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/oauth2.ts tests/auth/oauth2.test.ts
git commit -m "feat: OAuth2 auth provider with client_credentials and refresh token support"
```

---

### Task 11: Auth Lifecycle Manager

**Files:**
- Create: `src/auth/manager.ts`
- Test: `tests/auth/manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/auth/manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthLifecycleManager } from '../../src/auth/manager.js';
import type { AuthProvider } from '../../src/auth/provider.js';
import type { AuthDef, ValidationDef } from '../../src/config/types.js';

function createMockProvider(overrides?: Partial<AuthProvider>): AuthProvider {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer token' }),
    isValid: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AuthLifecycleManager', () => {
  it('initializes provider on start', async () => {
    const provider = createMockProvider();
    const authDef: AuthDef = {
      provider: 'test',
      config: {},
    };
    const manager = new AuthLifecycleManager(provider, authDef);
    await manager.start();
    expect(provider.init).toHaveBeenCalledWith({});
    await manager.stop();
  });

  it('returns auth headers from provider', async () => {
    const provider = createMockProvider();
    const manager = new AuthLifecycleManager(provider, {
      provider: 'test',
      config: {},
    });
    await manager.start();
    const headers = await manager.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer token' });
    await manager.stop();
  });

  it('refreshes with mutex — concurrent refreshes serialize', async () => {
    let refreshCount = 0;
    const provider = createMockProvider({
      refresh: vi.fn().mockImplementation(async () => {
        refreshCount++;
        await new Promise((r) => setTimeout(r, 50));
      }),
    });

    const manager = new AuthLifecycleManager(provider, {
      provider: 'test',
      config: {},
      refresh: { on_failure: true, retry_count: 3, retry_delay: 1 },
    });
    await manager.start();

    // Trigger 3 concurrent refreshes
    await Promise.all([
      manager.refreshWithRetry(),
      manager.refreshWithRetry(),
      manager.refreshWithRetry(),
    ]);

    // Should only refresh once (mutex)
    expect(refreshCount).toBe(1);
    await manager.stop();
  });

  it('retries on refresh failure up to retry_count', async () => {
    const provider = createMockProvider({
      refresh: vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce(undefined),
    });

    const manager = new AuthLifecycleManager(provider, {
      provider: 'test',
      config: {},
      refresh: { on_failure: true, retry_count: 3, retry_delay: 0 },
    });
    await manager.start();
    await manager.refreshWithRetry();
    expect(provider.refresh).toHaveBeenCalledTimes(3);
    await manager.stop();
  });

  it('polls isValid at configured interval', async () => {
    vi.useFakeTimers();
    let isValidValue = true;
    const provider = createMockProvider({
      isValid: vi.fn().mockImplementation(async () => isValidValue),
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    const manager = new AuthLifecycleManager(provider, {
      provider: 'test',
      config: {},
      refresh: { poll_interval: 10, retry_count: 1, retry_delay: 0 },
    });
    await manager.start();

    // Tick 10s — first poll check (valid, no refresh)
    await vi.advanceTimersByTimeAsync(10000);
    expect(provider.refresh).not.toHaveBeenCalled();

    // Simulate invalid auth
    isValidValue = false;
    await vi.advanceTimersByTimeAsync(10000);
    expect(provider.refresh).toHaveBeenCalled();

    await manager.stop();
    vi.useRealTimers();
  });

  it('returns auth context from provider', async () => {
    const provider = createMockProvider({
      getAuthContext: vi.fn().mockResolvedValue({ token: 'abc' }),
    });
    const manager = new AuthLifecycleManager(provider, {
      provider: 'test',
      config: {},
    });
    await manager.start();
    const ctx = await manager.getAuthContext();
    expect(ctx).toEqual({ token: 'abc' });
    await manager.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/auth/manager.ts
import type { AuthProvider } from './provider.js';
import type { AuthDef } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';
import { createHttpClient } from '../utils/http.js';
import { JSONPath } from 'jsonpath-plus';

export class AuthLifecycleManager {
  private refreshMutex: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private logger: Logger = createLogger('default');
  private httpClient = createHttpClient();

  constructor(
    private provider: AuthProvider,
    private authDef: AuthDef
  ) {}

  async start(): Promise<void> {
    await this.provider.init(this.authDef.config);
    this.startPollLoop();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.provider.dispose();
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    return this.provider.getAuthHeaders();
  }

  async getAuthContext(): Promise<Record<string, any>> {
    if (this.provider.getAuthContext) {
      return this.provider.getAuthContext();
    }
    return {};
  }

  async refreshWithRetry(): Promise<void> {
    // Serialize refresh calls via mutex
    this.refreshMutex = this.refreshMutex.then(async () => {
      const refresh = this.authDef.refresh;
      const maxRetries = refresh?.retry_count ?? 3;
      const retryDelay = refresh?.retry_delay ?? 5;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          this.logger.info('Auth refresh triggered');
          await this.provider.refresh();
          this.logger.info('Auth refresh success');
          return;
        } catch (err: any) {
          this.logger.error(`Auth refresh failed (attempt ${attempt + 1}/${maxRetries}): ${err.message}`);
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, retryDelay * 1000));
          }
        }
      }

      throw new Error(`Auth refresh failed after ${maxRetries + 1} attempts`);
    });

    return this.refreshMutex;
  }

  async checkValidity(): Promise<boolean> {
    const validation = this.authDef.validation;
    if (!validation) {
      return this.provider.isValid();
    }

    try {
      const authHeaders = await this.provider.getAuthHeaders();
      const response = await this.httpClient.request({
        url: validation.check_url,
        method: validation.check_method ?? 'GET',
        headers: { ...(validation.check_headers ?? {}), ...authHeaders },
        body: validation.check_body,
      });

      return evaluateValidWhen(response, validation.valid_when);
    } catch {
      return false;
    }
  }

  private startPollLoop(): void {
    const interval = this.authDef.refresh?.poll_interval;
    if (!interval) return;

    this.logger.info(`Auth poll loop started (interval: ${interval}s)`);

    this.pollTimer = setInterval(async () => {
      try {
        const valid = await this.checkValidity();
        if (!valid) {
          this.logger.info('Auth poll check: expired, refreshing...');
          await this.refreshWithRetry();
        } else {
          this.logger.verbose(`Auth poll check: valid (next check in ${interval}s)`);
        }
      } catch (err: any) {
        this.logger.error(`Auth poll check error: ${err.message}`);
      }
    }, interval * 1000);
  }
}

function evaluateValidWhen(
  response: { status: number; body: string },
  validWhen: AuthDef['validation'] extends { valid_when?: infer V } ? V : never
): boolean {
  if (!validWhen) return response.status >= 200 && response.status < 300;

  const conditions: boolean[] = [];

  if (validWhen.status !== undefined) {
    conditions.push(response.status === validWhen.status);
  }

  if (validWhen.jsonpath_not_exists) {
    try {
      const parsed = JSON.parse(response.body);
      const result = JSONPath({ path: validWhen.jsonpath_not_exists, json: parsed, wrap: false });
      conditions.push(result === undefined || result === false);
    } catch {
      conditions.push(false);
    }
  }

  if (validWhen.jsonpath_equals) {
    try {
      const parsed = JSON.parse(response.body);
      for (const [path, expected] of Object.entries(validWhen.jsonpath_equals)) {
        const result = JSONPath({ path, json: parsed, wrap: false });
        conditions.push(result === expected);
      }
    } catch {
      conditions.push(false);
    }
  }

  if (validWhen.json_match) {
    const regex = new RegExp(validWhen.json_match.pattern);
    conditions.push(regex.test(response.body));
  }

  // All conditions must be true
  return conditions.length === 0 || conditions.every(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/manager.ts tests/auth/manager.test.ts
git commit -m "feat: auth lifecycle manager with mutex, retry, and polling"
```

---

## Chunk 4: Tool System + SSE Server + CLI

### Task 12: Request Pipeline

**Files:**
- Create: `src/tool/pipeline.ts`
- Test: `tests/tool/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tool/pipeline.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPipeline } from '../../src/tool/pipeline.js';
import type { ToolDef } from '../../src/config/types.js';
import * as http from 'node:http';

function createServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const s = http.createServer(handler);
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address() as any;
      resolve({ server: s, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('Pipeline', () => {
  it('executes a simple GET tool call', async () => {
    const { server: s, url } = await createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'hello' }));
    });

    const toolDef: ToolDef = {
      name: 'test_tool',
      description: 'A test tool',
      url: `${url}/api`,
      method: 'GET',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({});
    expect(result).toEqual({ result: 'hello' });

    s.close();
  });

  it('injects auth headers via auth manager', async () => {
    let receivedAuth = '';
    const { server: s, url } = await createServer((req, res) => {
      receivedAuth = req.headers.authorization ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });

    const toolDef: ToolDef = {
      name: 'auth_tool',
      description: 'test',
      url: `${url}/api`,
      method: 'GET',
    };

    const mockAuthManager = {
      getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
      getAuthContext: vi.fn().mockResolvedValue({ token: 'test-token' }),
      refreshWithRetry: vi.fn().mockResolvedValue(undefined),
    };
    const pipeline = createPipeline(toolDef, {}, 5000);
    pipeline.setAuthManager(mockAuthManager);
    const result = await pipeline.execute({});
    expect(receivedAuth).toBe('Bearer test-token');
    expect(mockAuthManager.getAuthHeaders).toHaveBeenCalled();

    s.close();
  });

  it('renders body template with params', async () => {
    let receivedBody = '';
    const { server: s, url } = await createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 1 }));
      });
    });

    const toolDef: ToolDef = {
      name: 'create',
      description: 'test',
      url: `${url}/api`,
      method: 'POST',
      body: '{"title":"{{params.title}}"}',
      parameters: {
        title: { type: 'string', location: 'body', required: true },
      },
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({ title: 'Hello' });
    expect(JSON.parse(receivedBody).title).toBe('Hello');

    s.close();
  });

  it('transforms response with JSONPath and template', async () => {
    const { server: s, url } = await createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { items: [{ name: 'A' }, { name: 'B' }] } }));
    });

    const toolDef: ToolDef = {
      name: 'list',
      description: 'test',
      url: `${url}/api`,
      method: 'GET',
      response: {
        extract: '$.data.items[*].name',
        template: '{{#each this}}- {{this}}\n{{/each}}',
      },
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({});
    expect(result).toContain('- A');
    expect(result).toContain('- B');

    s.close();
  });

  it('auto-retries on 401', async () => {
    let callCount = 0;
    const { server: s, url } = await createServer((req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(401);
        res.end('unauthorized');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });

    const toolDef: ToolDef = {
      name: 'retry_tool',
      description: 'test',
      url: `${url}/api`,
      method: 'GET',
    };

    const mockAuthManager = {
      getAuthHeaders: vi.fn().mockResolvedValue({}),
      getAuthContext: vi.fn().mockResolvedValue({}),
      refreshWithRetry: vi.fn().mockResolvedValue(undefined),
    };
    const pipeline = createPipeline(toolDef, {}, 5000);
    pipeline.setAuthManager(mockAuthManager);

    const result = await pipeline.execute({});
    expect(callCount).toBe(2);
    expect(mockAuthManager.refreshWithRetry).toHaveBeenCalled();

    s.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/tool/pipeline.ts
import type { ToolDef } from '../config/types.js';
import { createHttpClient } from '../utils/http.js';
import { renderUrl, renderBody, renderHeaders, renderQueryParams } from './template.js';
import { transformResponse } from './transformer.js';
import type { Logger } from '../utils/logger.js';

export interface Pipeline {
  execute(params: Record<string, any>): Promise<any>;
  setAuthManager(manager: { getAuthHeaders(): Promise<Record<string, string>>; getAuthContext(): Promise<Record<string, any>>; refreshWithRetry(): Promise<void> }): void;
}

export function createPipeline(
  toolDef: ToolDef,
  globalHeaders: Record<string, string>,
  timeout: number,
  logger?: Logger
): Pipeline {
  const httpClient = createHttpClient({ timeout });
  let authManager: { getAuthHeaders(): Promise<Record<string, string>>; getAuthContext(): Promise<Record<string, any>>; refreshWithRetry(): Promise<void> } | null = null;

  return {
    setAuthManager(manager) { authManager = manager; },

    async execute(params: Record<string, any>): Promise<any> {
      const maxRetries = 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Build URL with path params and query params
        let url = renderUrl(toolDef.url, params);
        const queryParams = renderQueryParams(params, toolDef.parameters ?? {});
        url += queryParams;

        // Get auth headers and context
        const authHeaders = authManager ? await authManager.getAuthHeaders() : {};
        const authContext = authManager ? await authManager.getAuthContext() : {};

        // Build headers: auth headers (lowest) → global headers → tool headers (highest)
        const headers = renderHeaders(toolDef.headers, authContext, params, globalHeaders, authHeaders);

        // Build body
        const body = renderBody(toolDef.body, params);

        const response = await httpClient.request({
          url,
          method: toolDef.method,
          headers: {
            ...(body ? { 'Content-Type': toolDef.content_type ?? 'application/json' } : {}),
            ...headers,
          },
          body,
        });

        // Handle 401 — refresh and retry
        if (response.status === 401 && authManager) {
          logger?.info(`Tool call: ${toolDef.name} → 401, refreshing auth...`);
          await authManager.refreshWithRetry();
          continue;
        }

        // Handle HTTP errors
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.body}`);
        }

        // Transform response
        return transformResponse(response.body, toolDef.response);
      }

      throw new Error(`Tool ${toolDef.name} failed after ${maxRetries} retries`);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tool/pipeline.ts tests/tool/pipeline.test.ts
git commit -m "feat: request pipeline with auth injection, template rendering, and auto-retry"
```

---

### Task 13: Tool Registry

**Files:**
- Create: `src/tool/registry.ts`
- Test: `tests/tool/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tool/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry, paramDefToZodSchema } from '../../src/tool/registry.js';
import type { ToolDef, ParameterDef } from '../../src/config/types.js';

describe('paramDefToZodSchema', () => {
  it('converts string parameter to zod string', () => {
    const defs: Record<string, ParameterDef> = {
      name: { type: 'string', required: true, description: 'name param', location: 'query' },
    };
    const schema = paramDefToZodSchema(defs);
    const result = schema.safeParse({ name: 'test' });
    expect(result.success).toBe(true);
  });

  it('makes optional params not required', () => {
    const defs: Record<string, ParameterDef> = {
      keyword: { type: 'string', required: true, description: 'q', location: 'query' },
      limit: { type: 'integer', location: 'query', default: 10 },
    };
    const schema = paramDefToZodSchema(defs);
    expect(schema.safeParse({ keyword: 'test' }).success).toBe(true);
    expect(schema.safeParse({ keyword: 'test', limit: 5 }).success).toBe(true);
  });

  it('rejects missing required param', () => {
    const defs: Record<string, ParameterDef> = {
      id: { type: 'string', required: true, location: 'path' },
    };
    const schema = paramDefToZodSchema(defs);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('ToolRegistry', () => {
  it('stores tool definitions and retrieves them', () => {
    const tools: ToolDef[] = [
      {
        name: 'search',
        description: 'Search docs',
        url: 'https://api.example.com/search',
        method: 'GET',
        parameters: {
          q: { type: 'string', required: true, description: 'query', location: 'query' },
        },
      },
    ];

    const registry = new ToolRegistry(tools);
    expect(registry.getTool('search')).toBeDefined();
    expect(registry.getTool('nonexistent')).toBeUndefined();
    expect(registry.getAllToolNames()).toEqual(['search']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/tool/registry.ts
import { z } from 'zod';
import type { ToolDef, ParameterDef } from '../config/types.js';

const TYPE_MAP: Record<string, () => z.ZodTypeAny> = {
  string: () => z.string(),
  number: () => z.number(),
  integer: () => z.number().int(),
  boolean: () => z.boolean(),
  array: () => z.array(z.any()),
  object: () => z.record(z.any()),
};

export function paramDefToZodSchema(paramDefs: Record<string, ParameterDef>): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, def] of Object.entries(paramDefs)) {
    let field = TYPE_MAP[def.type]?.() ?? z.string();

    if (def.description) {
      field = field.describe(def.description);
    }

    if (def.enum) {
      field = z.enum(def.enum) as any;
    }

    if (!def.required && !def.default) {
      field = field.optional();
    }

    shape[name] = field;
  }

  return z.object(shape);
}

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map();

  constructor(tools: ToolDef[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getAllTools(): ToolDef[] {
    return Array.from(this.tools.values());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tool/registry.ts tests/tool/registry.test.ts
git commit -m "feat: tool registry with parameter schema conversion"
```

---

### Task 14: SSE MCP Server

**Files:**
- Create: `src/server/sse.ts`
- Test: `tests/server/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/sse.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMcpServer } from '../../src/server/sse.js';

describe('createMcpServer', () => {
  it('creates an McpServer with correct name and version', () => {
    const mcpServer = createMcpServer({ name: 'test-bridge', version: '1.0' });
    expect(mcpServer).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/sse.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/server/sse.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeConfig } from '../config/types.js';

export function createMcpServer(config: Pick<BridgeConfig, 'name' | 'version'>): McpServer {
  return new McpServer({
    name: config.name,
    version: config.version ?? '1.0',
  });
}
```

> **Note:** The exact import path for `McpServer` depends on the installed SDK version. If `@modelcontextprotocol/sdk` is installed, the import might be `@modelcontextprotocol/sdk/server/mcp.js`. Check `node_modules/@modelcontextprotocol/sdk` to confirm the path. If the package has been split into `@modelcontextprotocol/server`, use `@modelcontextprotocol/server` instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/sse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/sse.ts tests/server/sse.test.ts
git commit -m "feat: SSE MCP server factory"
```

---

### Task 15: CLI Entry Point

**Files:**
- Create: `src/index.ts`
- Modify: `src/index.ts` (replace placeholder)

- [ ] **Step 1: Write CLI implementation**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config/loader.js';
import { createLogger, type LogLevel } from './utils/logger.js';
import { loadAuthProviderAsync } from './auth/loader.js';
import { AuthLifecycleManager } from './auth/manager.js';
import { ToolRegistry } from './tool/registry.js';
import { paramDefToZodSchema } from './tool/registry.js';
import { createPipeline } from './tool/pipeline.js';
import { createMcpServer } from './server/sse.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const program = new Command();

program
  .name('mcp-live-bridge')
  .description('Config-driven CLI that exposes external HTTP APIs as MCP tools')
  .version('0.1.0');

function parseLogLevel(verbose: boolean, quiet: boolean): LogLevel {
  if (quiet) return 'quiet';
  if (verbose) return 'verbose';
  return 'default';
}

// start command
program
  .command('start')
  .description('Start the MCP server')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .option('-p, --port <number>', 'Override server port')
  .option('--verbose', 'Verbose logging')
  .option('--quiet', 'Quiet mode (errors only)')
  .action(async (options) => {
    const logLevel = parseLogLevel(options.verbose, options.quiet);
    const logger = createLogger(logLevel);

    try {
      // Load config
      const config = loadConfig(options.config);
      logger.info(`Loading config: ${options.config}`);
      logger.info(`Config loaded: ${config.tools.length} tools registered`);

      // Override port if specified via CLI
      if (options.port) {
        config.server = { ...config.server, port: parseInt(options.port, 10) };
      }

      const host = config.server?.host ?? '0.0.0.0';
      const port = config.server?.port ?? 8080;
      const corsOrigin = config.server?.cors_origin ?? '*';
      const timeout = config.server?.timeout ?? 30000;

      // Init auth
      logger.info(`Initializing auth provider: ${config.auth.provider}`);
      const authProvider = await loadAuthProviderAsync(config.auth.provider);
      const authManager = new AuthLifecycleManager(authProvider, config.auth);
      await authManager.start();
      logger.info('Auth initialized successfully');

      // Create tool registry and pipelines
      const registry = new ToolRegistry(config.tools);

      // Create MCP server
      const mcpServer = createMcpServer(config);

      // Register tools
      for (const toolDef of registry.getAllTools()) {
        const pipeline = createPipeline(toolDef, config.headers ?? {}, timeout, logger);
        pipeline.setAuthManager(authManager);

        const paramDefs = toolDef.parameters ?? {};
        const schema = paramDefToZodSchema(paramDefs);

        mcpServer.tool(
          toolDef.name,
          toolDef.description,
          schema,
          async (params) => {
            logger.info(`Tool call: ${toolDef.name}(${JSON.stringify(params)})`);
            const startTime = Date.now();
            try {
              const result = await pipeline.execute(params);
              const elapsed = Date.now() - startTime;
              logger.info(`Tool call: ${toolDef.name} → 200 OK (${elapsed}ms)`);
              return {
                content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
              };
            } catch (err: any) {
              const elapsed = Date.now() - startTime;
              logger.error(`Tool call: ${toolDef.name} → ${err.message} (${elapsed}ms)`);
              return {
                content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
                isError: true,
              };
            }
          }
        );
      }

      // Start HTTP server with Streamable HTTP transport
      const httpServer = createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Delegate to MCP SDK transport
        // The actual SSE/HTTP handling is done by the MCP SDK's transport layer
      });

      // Graceful shutdown
      const shutdown = async () => {
        logger.info('Shutting down...');
        // Stop accepting new connections
        httpServer.close(() => {
          // Wait up to 10s for in-flight requests, then force exit
          setTimeout(() => {
            authManager.stop().finally(() => process.exit(0));
          }, 10000);
        });
        await authManager.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      httpServer.listen(port, host, () => {
        logger.info(`MCP server listening on http://${host}:${port}`);
      });

    } catch (err: any) {
      logger.error(err.message);
      process.exit(1);
    }
  });

// validate command
program
  .command('validate')
  .description('Validate config file without starting')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .action((options) => {
    try {
      loadConfig(options.config);
      console.log(`Config valid: ${options.config}`);
    } catch (err: any) {
      console.error(`Config invalid: ${err.message}`);
      process.exit(1);
    }
  });

// list command
program
  .command('list')
  .description('List all tools defined in config')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .action((options) => {
    try {
      const config = loadConfig(options.config);
      for (const tool of config.tools) {
        console.log(`  ${tool.name}: ${tool.description}`);
        console.log(`    ${tool.method} ${tool.url}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Build and verify CLI commands**

Run: `npm run build`
Expected: builds successfully

Run: `node dist/index.js --help`
Expected: shows help text

Run: `node dist/index.js validate -c nonexistent.yaml`
Expected: exits with code 1, error message

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with start, validate, list commands"
```

---

### Task 16: Integration — Wire SSE Transport to MCP Server

This is the final wiring step. The MCP SDK needs a transport adapter to connect the McpServer to the HTTP server.

**Files:**
- Modify: `src/index.ts`
- Create: `tests/fixtures/test-config.yaml`

- [ ] **Step 1: Check the installed MCP SDK transport API**

Run: `ls node_modules/@modelcontextprotocol/sdk/dist/esm/server/` (or similar path)

The MCP SDK provides `SSEServerTransport` for SSE-based communication. Import it and connect it to the HTTP server.

- [ ] **Step 2: Replace the placeholder HTTP server in src/index.ts with actual SSE transport**

Replace the empty HTTP handler section in the `start` command with:

```typescript
      import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

      // Inside the start command, after creating mcpServer and registering tools:

      // Store transports by session ID
      const transports: Map<string, SSEServerTransport> = new Map();

      const httpServer = createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // GET /sse — establish SSE connection
        if (req.method === 'GET' && req.url === '/sse') {
          const transport = new SSEServerTransport('/messages', res);
          transports.set(transport.sessionId ?? '', transport);
          transport.onclose = () => {
            const id = transport.sessionId ?? '';
            transports.delete(id);
          };
          await mcpServer.connect(transport);
          return;
        }

        // POST /messages — receive JSON-RPC
        if (req.method === 'POST' && req.url === '/messages') {
          const sessionId = req.headers['mcp-session-id'] as string | undefined;
          const transport = sessionId ? transports.get(sessionId) : undefined;

          if (!transport) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No active session' }, id: null }));
            return;
          }

          // Read request body
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          await transport.handlePostMessage(JSON.parse(body));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });
```

> **Note:** The exact import path and API for `SSEServerTransport` depends on the SDK version. If the import fails, check `node_modules/@modelcontextprotocol/sdk/package.json` exports field. The SDK may have been restructured into `@modelcontextprotocol/server` with `@modelcontextprotocol/node` providing `NodeStreamableHTTPServerTransport` instead. Adapt the code accordingly.

- [ ] **Step 3: Create test config file for smoke test**

```yaml
# tests/fixtures/test-config.yaml
name: test-bridge
auth:
  provider: form
  config:
    login_url: https://httpbin.org/post
    username: test
    password: test
tools:
  - name: get_ip
    description: "Get public IP address"
    url: https://httpbin.org/ip
    method: GET
```

- [ ] **Step 4: Build and test**

Run: `npm run build`
Expected: builds successfully

Run: `node dist/index.js validate -c tests/fixtures/test-config.yaml`
Expected: "Config valid"

Run: `timeout 5 node dist/index.js start -c tests/fixtures/test-config.yaml 2>&1 || true`
Expected: server starts, logs auth init and "MCP server listening on http://0.0.0.0:8080"

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/fixtures/test-config.yaml
git commit -m "feat: wire SSE transport to MCP server for full integration"
```

---

### Task 17: Final Build + All Tests

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: End-to-end smoke test**

Run: `node dist/index.js validate -c tests/fixtures/test-config.yaml`
Expected: "Config valid"

Run: `node dist/index.js list -c tests/fixtures/test-config.yaml`
Expected: Lists tools

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification and smoke tests"
```
