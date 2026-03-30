import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { createPipeline } from '../../src/tool/pipeline.js';
import type { ToolDef } from '../../src/config/types.js';
import type { Logger } from '../../src/utils/logger.js';

let server: Server;
let port: number;

function getPort(srv: Server): number {
  const addr = srv.address();
  if (typeof addr === 'object' && addr) return addr.port;
  throw new Error('Server not listening');
}

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  return new Promise((resolve) => {
    const srv = createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function stopServer(srv: Server): Promise<void> {
  return new Promise((resolve) => srv.close(() => resolve()));
}

beforeAll(async () => {
  server = await startServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Return 401 for /retry-test without refreshed token
      if (req.url === '/retry-test' && req.headers.authorization !== 'Bearer refreshed-token') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body: body || undefined }));
    });
  });
  port = getPort(server);
});

afterAll(async () => {
  await stopServer(server);
});

describe('Pipeline', () => {
  it('executes a simple GET tool call', async () => {
    const toolDef: ToolDef = {
      name: 'get-user',
      description: 'Get user by ID',
      url: `http://127.0.0.1:${port}/users/42`,
      method: 'GET',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({});

    // Without response def, transformResponse returns raw body string
    const parsed = JSON.parse(result);
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('/users/42');
  });

  it('injects auth headers via auth manager', async () => {
    const toolDef: ToolDef = {
      name: 'auth-test',
      description: 'Test auth',
      url: `http://127.0.0.1:${port}/secret`,
      method: 'GET',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const authManager = {
      getAuthHeaders: async () => ({ Authorization: 'Bearer test-token-123' }),
      getAuthContext: async () => ({ token: 'test-token-123' }),
      refreshWithRetry: async () => {},
    };
    pipeline.setAuthManager(authManager);

    const result = await pipeline.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.headers.authorization).toBe('Bearer test-token-123');
  });

  it('renders body template with params', async () => {
    const toolDef: ToolDef = {
      name: 'create-post',
      description: 'Create a post',
      url: `http://127.0.0.1:${port}/posts`,
      method: 'POST',
      body: '{"title":"{{params.title}}","content":"{{params.content}}"}',
      content_type: 'application/json',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({ title: 'Hello', content: 'World' });

    const parsed = JSON.parse(result);
    // Server echoes body as a nested JSON string
    const sentBody = JSON.parse(parsed.body);
    expect(sentBody.title).toBe('Hello');
    expect(sentBody.content).toBe('World');
    expect(parsed.method).toBe('POST');
  });

  it('renders object body as JSON', async () => {
    const toolDef: ToolDef = {
      name: 'create-user-obj',
      description: 'Create user with object body',
      url: `http://127.0.0.1:${port}/users`,
      method: 'POST',
      body: { username: '{{params.username}}', email: '{{params.email}}', role: 'admin' },
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({ username: 'alice', email: 'alice@example.com' });

    const parsed = JSON.parse(result);
    expect(parsed.headers['content-type']).toBe('application/json');
    const sentBody = JSON.parse(parsed.body);
    expect(sentBody.username).toBe('alice');
    expect(sentBody.email).toBe('alice@example.com');
    expect(sentBody.role).toBe('admin');
  });

  it('renders object body as URL-encoded', async () => {
    const toolDef: ToolDef = {
      name: 'login-form',
      description: 'Login with form body',
      url: `http://127.0.0.1:${port}/login`,
      method: 'POST',
      body: { username: '{{params.username}}', password: '{{params.password}}' },
      content_type: 'application/x-www-form-urlencoded',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({ username: 'bob', password: 'secret' });

    const parsed = JSON.parse(result);
    expect(parsed.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(parsed.body).toBe('username=bob&password=secret');
  });

  it('transforms response with extract', async () => {
    const toolDef: ToolDef = {
      name: 'search',
      description: 'Search items',
      url: `http://127.0.0.1:${port}/search`,
      method: 'GET',
      response: {
        extract: '$.method',
      },
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    const result = await pipeline.execute({});
    expect(result).toBe('GET');
  });

  it('auto-retries on 401', async () => {
    const toolDef: ToolDef = {
      name: 'retry-test',
      description: 'Test retry',
      url: `http://127.0.0.1:${port}/retry-test`,
      method: 'GET',
    };

    const logMessages: string[] = [];
    const logger: Logger = {
      info: (msg: string) => logMessages.push(msg),
      verbose: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    const pipeline = createPipeline(toolDef, {}, 5000, logger);
    let refreshed = false;
    const authManager = {
      getAuthHeaders: async () => ({
        Authorization: refreshed ? 'Bearer refreshed-token' : 'Bearer stale-token',
      }),
      getAuthContext: async () => ({ token: 'stale' }),
      refreshWithRetry: async () => { refreshed = true; },
    };
    pipeline.setAuthManager(authManager);

    const result = await pipeline.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.headers.authorization).toBe('Bearer refreshed-token');
    expect(refreshed).toBe(true);
    expect(logMessages.some((m) => m.includes('401'))).toBe(true);
  });

  it('throws on non-401 error status', async () => {
    const errorSrv = await startServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
    const errorPort = getPort(errorSrv);

    const toolDef: ToolDef = {
      name: 'error-test',
      description: 'Test error',
      url: `http://127.0.0.1:${errorPort}/fail`,
      method: 'GET',
    };

    const pipeline = createPipeline(toolDef, {}, 5000);
    await expect(pipeline.execute({})).rejects.toThrow('HTTP 500');

    await stopServer(errorSrv);
  });
});
