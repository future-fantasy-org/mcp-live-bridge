# init 交互式脚手架 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 `mcp-live-bridge init` 交互式命令，引导用户逐步输入信息生成配置文件，支持直接输入 OpenAPI URL 自动导入。

**Architecture:** 新增 `src/cli/init.ts` 模块，使用 Node.js 内建 `readline` 实现交互式问答。流程为：桥名称 → 后端 API 地址 → 是否导入 OpenAPI（若是则复用 openapi 模块）→ 选择 auth 方式 → 输入认证信息 → 生成配置文件。

**Tech Stack:** Node.js readline, js-yaml (已有), openapi 模块 (上一个计划)

---

## Chunk 1: 交互式问答引擎

### Task 1: readline 问答工具函数

**Files:**
- Create: `src/cli/prompt.ts`
- Test: `tests/cli/prompt.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// tests/cli/prompt.test.ts
import { describe, it, expect } from 'vitest';
import { formatChoices, validateRequired, validateUrl } from '../../src/cli/prompt.js';

describe('formatChoices', () => {
  it('formats choices for display', () => {
    const result = formatChoices(['Form (cookie)', 'OAuth2', 'Bearer Token', 'Custom'], 1);
    expect(result).toBe('  1. Form (cookie)\n  2. OAuth2\n  3. Bearer Token\n  4. Custom');
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
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/cli/prompt.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现工具函数**

```typescript
// src/cli/prompt.ts
import * as readline from 'node:readline';

export function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

export function formatChoices(choices: string[], selectedIndex: number = -1): string {
  return choices
    .map((choice, i) => `  ${selectedIndex === i ? '>' : ' '} ${(i + 1)}. ${choice}`)
    .join('\n');
}

export function validateRequired(value: string): string | null {
  return value.length > 0 ? null : 'This field is required';
}

export function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'URL must start with http:// or https://';
  } catch {
    return 'Invalid URL format';
  }
}

export function validatePort(value: string): string | null {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return 'Port must be a number between 1 and 65535';
  }
  return null;
}

export function parseChoiceIndex(input: string, max: number): number | null {
  const n = parseInt(input, 10);
  if (isNaN(n) || n < 1 || n > max) return null;
  return n;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/cli/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/prompt.ts tests/cli/prompt.test.ts
git commit -m "feat: add CLI prompt utilities for interactive init"
```

## Chunk 2: init 流程逻辑

### Task 2: init 命令主体

**Files:**
- Create: `src/cli/init.ts`
- Modify: `src/index.ts` (注册 init 命令)
- Test: `tests/cli/init.test.ts`

- [ ] **Step 1: 编写 init 逻辑的单元测试（纯函数部分）**

```typescript
// tests/cli/init.test.ts
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
    expect(result.name).toBe('test-bridge');
    expect(result.server?.port).toBe(9090);
    expect(result.auth.provider).toBe('bearer');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 init 模块**

```typescript
// src/cli/init.ts
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import {
  createReadline, question, formatChoices,
  validateRequired, validateUrl, validatePort, parseChoiceIndex,
} from './prompt.js';
import { importFromUrl } from '../openapi/import.js';

interface AuthConfig {
  provider: string;
  config: Record<string, any>;
  validation?: Record<string, any>;
  refresh?: Record<string, any>;
}

interface FullConfigInput {
  name: string;
  port: number;
  auth: AuthConfig;
  tools: any[];
  globalHeaders?: Record<string, string>;
}

const AUTH_CHOICES = [
  'Form (cookie-based login)',
  'OAuth2',
  'Bearer Token (static)',
  'Custom provider file',
  'None (no authentication)',
];

export function buildAuthConfig(choice: string, answers: Record<string, string>): AuthConfig {
  switch (choice) {
    case 'form':
      return {
        provider: 'form',
        config: {
          login_url: answers.login_url,
          username: answers.username,
          password: answers.password,
        },
      };
    case 'oauth2':
      return {
        provider: 'oauth2',
        config: {
          token_url: answers.token_url,
          client_id: answers.client_id,
          client_secret: answers.client_secret,
          grant_type: answers.grant_type ?? 'client_credentials',
        },
      };
    case 'bearer':
      return {
        provider: 'bearer',
        config: { token: answers.token },
      };
    case 'custom':
      return {
        provider: answers.provider_path,
        config: {},
      };
    case 'none':
      return { provider: 'form', config: { login_url: 'http://placeholder', username: '', password: '' } };
    default:
      throw new Error(`Unknown auth choice: ${choice}`);
  }
}

export function buildFullConfig(input: FullConfigInput): string {
  const config: Record<string, any> = {
    name: input.name,
    version: '1.0',
  };

  if (input.port !== 8080) {
    config.server = { port: input.port };
  }

  config.auth = input.auth;
  if (input.globalHeaders) {
    config.headers = input.globalHeaders;
  }
  config.tools = input.tools;

  return yaml.dump(config, { lineWidth: 120, noRefs: true });
}

export async function runInit(outputPath: string): Promise<void> {
  const rl = createReadline();
  let tools: any[] = [];
  let detectedAuth: any = null;

  try {
    console.log('\n🚀 mcp-live-bridge init\n');

    // Step 1: Bridge name
    const name = await promptLoop(rl, 'Bridge name:', validateRequired, 'mcp-bridge');

    // Step 2: Server port
    const portStr = await promptLoop(rl, 'Server port (default: 8080):', validatePort, '8080');
    const port = parseInt(portStr, 10);

    // Step 3: Import from OpenAPI or manual
    const importChoice = await promptLoop(rl, 'Import endpoints from OpenAPI spec? (y/N):', null, 'n');
    const shouldImport = importChoice.toLowerCase() === 'y';

    if (shouldImport) {
      const specUrl = await promptLoop(rl, 'OpenAPI spec URL:', validateUrl);
      console.log(`\nFetching spec from ${specUrl}...`);
      try {
        const result = await importFromUrl(specUrl, { name, port });
        console.log(`Found ${result.endpoints.length} endpoints.`);
        if (result.auth) {
          detectedAuth = result.auth;
          console.log(`Detected auth scheme: ${result.auth.type} (${result.auth.schemeName})`);
        }

        // Show endpoints and let user select
        console.log('\nEndpoints found:');
        result.endpoints.forEach((ep, i) => {
          console.log(`  ${(i + 1).toString().padStart(3)}. [${ep.method}] ${ep.path} — ${ep.description}`);
        });
        console.log('  all. Import all endpoints');

        const selection = await promptLoop(rl, 'Select endpoints (comma-separated numbers, or "all"):', null, 'all');
        if (selection.toLowerCase() === 'all') {
          // Parse the generated config to extract tools
          const parsed = yaml.load(result.config) as any;
          tools = parsed.tools ?? [];
        } else {
          const indices = selection.split(',').map((s) => parseInt(s.trim(), 10) - 1);
          const parsed = yaml.load(
            (await import('../openapi/generator.js')).generateConfig({ name, endpoints: result.endpoints, auth: detectedAuth, port, selectedIndices: indices })
          ) as any;
          tools = parsed.tools ?? [];
        }
      } catch (err: any) {
        console.error(`Failed to import: ${err.message}`);
        console.log('Continuing with empty tool list. You can add tools manually.');
        tools = [];
      }
    }

    // Step 4: Auth config
    console.log('\nAuthentication:');
    console.log(formatChoices(AUTH_CHOICES));
    if (detectedAuth) {
      console.log(`  (Detected: ${detectedAuth.type} — selecting it as default)`);
    }

    let authChoice: string;
    if (detectedAuth?.type === 'bearer') {
      authChoice = 'bearer';
      console.log('  > 3. Bearer Token (static)');
    } else {
      const authInput = await promptLoop(rl, 'Choose auth method (1-5):', (v) => {
        const n = parseChoiceIndex(v, AUTH_CHOICES.length);
        return n ? null : 'Enter a number between 1 and 5';
      });
      const idx = parseChoiceIndex(authInput, AUTH_CHOICES.length);
      authChoice = ['form', 'oauth2', 'bearer', 'custom', 'none'][idx! - 1];
    }

    const authAnswers: Record<string, string> = {};
    switch (authChoice) {
      case 'form':
        authAnswers.login_url = await promptLoop(rl, '  Login URL:', validateUrl);
        authAnswers.username = await promptLoop(rl, '  Username:', validateRequired);
        authAnswers.password = await question(rl, '  Password (will be visible): ');
        break;
      case 'oauth2':
        authAnswers.token_url = await promptLoop(rl, '  Token URL:', validateUrl);
        authAnswers.client_id = await promptLoop(rl, '  Client ID:', validateRequired);
        authAnswers.client_secret = await question(rl, '  Client Secret: ');
        break;
      case 'bearer':
        authAnswers.token = await promptLoop(rl, '  Bearer token:', validateRequired);
        break;
      case 'custom':
        authAnswers.provider_path = await promptLoop(rl, '  Provider file path (.mjs):', validateRequired);
        break;
    }

    const auth = buildAuthConfig(authChoice, authAnswers);

    // Step 5: Global headers
    const addHeaders = await promptLoop(rl, 'Add global headers? (y/N):', null, 'n');
    let globalHeaders: Record<string, string> | undefined;
    if (addHeaders.toLowerCase() === 'y') {
      globalHeaders = {};
      console.log('  Enter headers (format: Key: Value), empty line to finish:');
      while (true) {
        const line = await question(rl, '  ');
        if (!line) break;
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          globalHeaders[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
        }
      }
    }

    // Step 6: Generate and write config
    const configYaml = buildFullConfig({ name, port, auth, tools, globalHeaders });
    fs.writeFileSync(outputPath, configYaml, 'utf-8');

    console.log(`\n✅ Config written to ${outputPath}`);
    console.log(`   Tools: ${tools.length}`);
    console.log(`\nStart the server with:`);
    console.log(`  mcp-live-bridge start -c ${outputPath}\n`);

  } finally {
    rl.close();
  }
}

async function promptLoop(
  rl: readline.Interface,
  promptText: string,
  validate: ((v: string) => string | null) | null,
  defaultValue?: string
): Promise<string> {
  const display = defaultValue ? `${promptText} [${defaultValue}] ` : `${promptText} `;
  while (true) {
    const answer = await question(rl, display);
    const value = answer || defaultValue || '';
    if (!validate) return value;
    const error = validate(value);
    if (!error) return value;
    console.log(`  ⚠ ${error}`);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: PASS

- [ ] **Step 5: 在 CLI 中注册 init 命令**

在 `src/index.ts` 中添加：

```typescript
program
  .command('init')
  .description('Interactive config file generator')
  .option('-o, --output <path>', 'Output file path', 'bridge-config.yaml')
  .action(async (options) => {
    try {
      const { runInit } = await import('./cli/init.js');
      await runInit(options.output);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/init.ts src/cli/prompt.ts src/index.ts tests/cli/init.test.ts tests/cli/prompt.test.ts
git commit -m "feat: add interactive init command for config generation"
```

## Chunk 3: 文档更新

### Task 3: 更新文档

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 在 README.md 的 CLI Commands 部分添加 init**

```markdown
```bash
# Interactive config generation wizard
mcp-live-bridge init

# Specify output file
mcp-live-bridge init -o my-config.yaml
```
```

- [ ] **Step 2: 在 README_zh.md 对应位置添加中文版**

- [ ] **Step 3: 更新 CHANGELOG.md 的 `[Unreleased]` 部分**

添加：
```markdown
- `init` interactive command to generate bridge config step by step
- Support for importing OpenAPI spec during init flow
```

- [ ] **Step 4: Commit**

```bash
git add README.md README_zh.md CHANGELOG.md
git commit -m "docs: add init command documentation"
```
