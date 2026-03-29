# 配置热重载 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加配置文件热重载功能，修改配置后无需重启 MCP 服务器即可生效。

**Architecture:** 新增 `src/server/watcher.ts` 模块，使用 `fs.watch` 监听配置文件变更。变更时：validate 新配置 → 成功则替换 tools/auth → 失败则日志告警并保持当前配置。MCP Server 本身不重建（连接保持），只更新已注册的 tools。新增 `--watch` CLI flag。

**Tech Stack:** Node.js fs.watch, @modelcontextprotocol/sdk (已有)

---

## Chunk 1: 热重载核心

### Task 1: 配置变更检测器

**Files:**
- Create: `src/server/watcher.ts`
- Test: `tests/server/watcher.test.ts`

- [ ] **Step 1: 编写 watcher 测试**

```typescript
// tests/server/watcher.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConfigWatcher, type ConfigChangeCallback } from '../../src/server/watcher.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('createConfigWatcher', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-live-bridge-test-'));
    configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(configPath, `name: test\nserver:\n  port: 8090\nauth:\n  provider: form\n  config:\n    login_url: http://localhost:8000/login\n    username: test\n    password: test\ntools:\n  - name: tool1\n    description: "Tool 1"\n    url: http://localhost:8000/api\n    method: GET\n`, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls onChange callback when config file is modified', async () => {
    const callback: ConfigChangeCallback = vi.fn();
    const watcher = createConfigWatcher(configPath, callback);

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 100));

    // Modify config
    fs.writeFileSync(configPath, fs.readFileSync(configPath, 'utf-8') + '\n# modified', 'utf-8');

    // Wait for debounce + fs event
    await new Promise((r) => setTimeout(r, 500));

    watcher.stop();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call callback for invalid config changes', async () => {
    const callback: ConfigChangeCallback = vi.fn();
    const watcher = createConfigWatcher(configPath, callback);

    await new Promise((r) => setTimeout(r, 100));

    // Write invalid config
    fs.writeFileSync(configPath, 'invalid: yaml: content:', 'utf-8');

    await new Promise((r) => setTimeout(r, 500));

    watcher.stop();
    expect(callback).not.toHaveBeenCalled();
  });

  it('stop() prevents further callbacks', async () => {
    const callback: ConfigChangeCallback = vi.fn();
    const watcher = createConfigWatcher(configPath, callback);

    await new Promise((r) => setTimeout(r, 100));

    watcher.stop();

    fs.writeFileSync(configPath, fs.readFileSync(configPath, 'utf-8') + '\n# modified', 'utf-8');
    await new Promise((r) => setTimeout(r, 500));

    expect(callback).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/server/watcher.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 watcher**

```typescript
// src/server/watcher.ts
import { watch, type FSWatcher } from 'node:fs';
import { loadConfig } from '../config/loader.js';
import type { BridgeConfig } from '../config/types.js';
import type { Logger } from '../utils/logger.js';

export interface ConfigChangeCallback {
  (newConfig: BridgeConfig): void;
}

export interface ConfigWatcher {
  stop(): void;
}

export function createConfigWatcher(
  configPath: string,
  onChange: ConfigChangeCallback,
  logger?: Logger,
  debounceMs: number = 300
): ConfigWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;

  watcher = watch(configPath, { persistent: false }, (eventType) => {
    if (eventType !== 'change') return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const newConfig = loadConfig(configPath);
        logger?.info(`Config reloaded: ${newConfig.tools.length} tools`);
        onChange(newConfig);
      } catch (err: any) {
        logger?.warn(`Config reload failed: ${err.message}. Keeping current config.`);
      }
    }, debounceMs);
  });

  return {
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/server/watcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/watcher.ts tests/server/watcher.test.ts
git commit -m "feat: add config file watcher with debounced reload"
```

## Chunk 2: 集成到 start 命令

### Task 2: 热重载集成到 MCP Server

**Files:**
- Modify: `src/index.ts` (start 命令添加 --watch 和热重载逻辑)
- Test: `tests/server/watcher-integration.test.ts`

**核心思路：** 热重载需要解决一个问题——MCP SDK 的 `McpServer` 不支持动态替换已注册的 tools。需要在 start 命令中封装一层 tool 管理逻辑：配置变更时，移除旧 tools，注册新 tools。

- [ ] **Step 1: 研究 MCP SDK 动态 tool 更新能力**

查看 `@modelcontextprotocol/sdk` 的 McpServer 是否支持：
1. 移除已注册的 tool
2. 动态添加新 tool

```bash
node -e "
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const s = new McpServer({ name: 'test', version: '1.0' });
const t = s.tool('test', 'desc', async () => ({ content: [{ type: 'text', text: 'ok' }] }));
console.log('tool methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(t)).filter(m => m !== 'constructor'));
"
```

根据结果，MCP SDK 的 `registeredTool` 有 `update()` 和 `remove()` 方法。热重载策略：
- 首次加载：正常注册所有 tools
- 配置变更：对比新旧 tool 列表，新增的注册、删除的 remove、修改的 update

- [ ] **Step 2: 编写集成测试**

```typescript
// tests/server/watcher-integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('hot reload tool sync', () => {
  let tmpDir: string;
  let configPath: string;

  const baseConfig = (tools: string) => `
name: test
version: "1.0"
server:
  port: 18090
auth:
  provider: form
  config:
    login_url: http://localhost:18090/login
    username: test
    password: test
tools:
${tools}
`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-reload-test-'));
    configPath = path.join(tmpDir, 'config.yaml');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects added and removed tools between configs', () => {
    const { diffTools } = require('../../src/server/watcher.js');
    const oldTools = [
      { name: 'tool1', description: 'T1', url: 'http://a.com', method: 'GET' },
      { name: 'tool2', description: 'T2', url: 'http://a.com', method: 'GET' },
    ];
    const newTools = [
      { name: 'tool2', description: 'T2 updated', url: 'http://a.com', method: 'GET' },
      { name: 'tool3', description: 'T3', url: 'http://a.com', method: 'GET' },
    ];
    const diff = diffTools(oldTools, newTools);
    expect(diff.added).toEqual([newTools[1]]);
    expect(diff.removed).toEqual(['tool1']);
    expect(diff.updated).toEqual([{ old: oldTools[1], new: newTools[0] }]);
  });
});
```

- [ ] **Step 3: 在 watcher.ts 中添加 diffTools 函数**

在 `src/server/watcher.ts` 中添加：

```typescript
import type { ToolDef } from '../config/types.js';

export interface ToolDiff {
  added: ToolDef[];
  removed: string[];   // removed tool names
  updated: { old: ToolDef; new: ToolDef }[];
}

export function diffTools(oldTools: ToolDef[], newTools: ToolDef[]): ToolDiff {
  const oldMap = new Map(oldTools.map((t) => [t.name, t]));
  const newMap = new Map(newTools.map((t) => [t.name, t]));

  const added: ToolDef[] = [];
  const removed: string[] = [];
  const updated: { old: ToolDef; new: ToolDef }[] = [];

  for (const [name, tool] of newMap) {
    if (!oldMap.has(name)) {
      added.push(tool);
    } else {
      const oldTool = oldMap.get(name)!;
      if (JSON.stringify(oldTool) !== JSON.stringify(tool)) {
        updated.push({ old: oldTool, new: tool });
      }
    }
  }

  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) {
      removed.push(name);
    }
  }

  return { added, removed, updated };
}
```

- [ ] **Step 4: 修改 start 命令添加 --watch 支持**

在 `src/index.ts` 的 start 命令中：

1. 添加 `--watch` 选项
2. 如果 `--watch`，启动后创建 watcher
3. onChange 时重新加载 config，对比 tools，更新 MCP server

关键代码逻辑（添加到 start 命令的 action 中，在 `httpServer.listen` 成功之后）：

```typescript
.option('--watch', 'Watch config file for changes and hot-reload')

// 在 httpServer.listen 回调内：
if (options.watch) {
  const { createConfigWatcher, diffTools } = await import('./server/watcher.js');
  let currentTools = registry.getAllTools();

  createConfigWatcher(options.config, (newConfig) => {
    const diff = diffTools(currentTools, newConfig.tools);

    // Remove deleted tools
    for (const name of diff.removed) {
      const existing = mcpServer._registeredTools[name];
      if (existing) {
        existing.remove();
      }
    }

    // Update changed tools
    for (const { old: _, new: newTool } of diff.updated) {
      const existing = mcpServer._registeredTools[newTool.name];
      if (existing) {
        const newPipeline = createPipeline(newTool, newConfig.headers ?? {}, timeout, logger);
        newPipeline.setAuthManager(authManager);
        existing.update({
          paramsSchema: paramDefToZodSchema(newTool.parameters ?? {}),
          callback: async (params) => {
            try {
              const result = await newPipeline.execute(params);
              return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
            } catch (err: any) {
              return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
            }
          },
        });
      }
    }

    // Add new tools
    for (const newTool of diff.added) {
      const newPipeline = createPipeline(newTool, newConfig.headers ?? {}, timeout, logger);
      newPipeline.setAuthManager(authManager);
      const paramDefs = newTool.parameters ?? {};
      const schema = paramDefToZodSchema(paramDefs);
      mcpServer.tool(newTool.name, newTool.description, schema, async (params) => {
        try {
          const result = await newPipeline.execute(params);
          return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
        }
      });
    }

    currentTools = newConfig.tools;
    logger.info(`Hot reload: +${diff.added.length} ~${diff.updated.length} -${diff.removed.length} tools`);
  }, logger);

  logger.info(`Watching config file: ${options.config}`);
}
```

同时在 shutdown 函数中加入 watcher.stop()（需要在更大作用域保存 watcher 引用）。

- [ ] **Step 5: 运行全部测试**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: 手动验证热重载**

```bash
# Terminal 1: 启动 server with --watch
node dist/index.js start -c examples/jwt-service-config.yaml --verbose --watch

# Terminal 2: 修改配置添加一个 tool，观察 Terminal 1 的日志
```

- [ ] **Step 7: Commit**

```bash
git add src/server/watcher.ts src/index.ts tests/server/watcher-integration.test.ts
git commit -m "feat: add --watch flag for config hot-reload"
```

## Chunk 3: 文档更新

### Task 3: 更新文档

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 在 README.md 的 start 命令中添加 --watch 选项**

```markdown
```bash
# Start with hot-reload (auto-reload on config changes)
mcp-live-bridge start -c <config-file> --watch
```
```

- [ ] **Step 2: 在 README_zh.md 对应位置添加中文版**

- [ ] **Step 3: 更新 CHANGELOG.md**

```markdown
- `--watch` flag for config hot-reload without server restart
- Config file watcher with debounced change detection
```

- [ ] **Step 4: Commit**

```bash
git add README.md README_zh.md CHANGELOG.md
git commit -m "docs: add hot-reload documentation"
```
