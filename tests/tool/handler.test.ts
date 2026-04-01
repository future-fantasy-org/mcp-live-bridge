import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { loadToolHandler, createHandlerContext } from '../../src/tool/handler.js';
import { createHttpClient } from '../../src/utils/http.js';
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body: body || undefined }));
    });
  });
  port = getPort(server);
});

afterAll(async () => {
  await stopServer(server);
});

const logger: Logger = {
  info: vi.fn(),
  verbose: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('loadToolHandler', () => {
  it('loads a handler from .mjs file', async () => {
    const handler = await loadToolHandler('./examples/tools/create-user-and-profile.mjs');
    expect(typeof handler).toBe('function');
  });

  it('throws for non-existent file', async () => {
    await expect(loadToolHandler('./nonexistent.mjs')).rejects.toThrow('Handler file not found');
  });

  it('throws for file without default function export', async () => {
    // Create a temp file with non-function default export
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const tmpFile = '/tmp/test-bad-handler.mjs';
    writeFileSync(tmpFile, 'export default { not: "a function" }');
    try {
      await expect(loadToolHandler(tmpFile)).rejects.toThrow('must have a default export that is a function');
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe('createHandlerContext', () => {
  it('provides http convenience methods', async () => {
    const httpClient = createHttpClient({ timeout: 5000 });
    const ctx = createHandlerContext(httpClient, { Authorization: 'Bearer test' }, {}, logger);

    const result = await ctx.http.get(`http://127.0.0.1:${port}/users/1`, {
      headers: ctx.auth,
    });
    expect(result.method).toBe('GET');
    expect(result.headers.authorization).toBe('Bearer test');
  });

  it('http.post sends JSON body', async () => {
    const httpClient = createHttpClient({ timeout: 5000 });
    const ctx = createHandlerContext(httpClient, {}, {}, logger);

    const result = await ctx.http.post(`http://127.0.0.1:${port}/users`, {
      body: { name: 'Alice' },
    });
    expect(result.method).toBe('POST');
    const sentBody = JSON.parse(result.body);
    expect(sentBody.name).toBe('Alice');
  });

  it('http.get supports query params', async () => {
    const httpClient = createHttpClient({ timeout: 5000 });
    const ctx = createHandlerContext(httpClient, {}, {}, logger);

    const result = await ctx.http.get(`http://127.0.0.1:${port}/search`, {
      params: { q: 'test', page: 2 },
    });
    expect(result.url).toContain('q=test');
    expect(result.url).toContain('page=2');
  });

  it('http.request returns raw response', async () => {
    const httpClient = createHttpClient({ timeout: 5000 });
    const ctx = createHandlerContext(httpClient, {}, {}, logger);

    const res = await ctx.http.request({ url: `http://127.0.0.1:${port}/raw`, method: 'GET' });
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
  });
});
