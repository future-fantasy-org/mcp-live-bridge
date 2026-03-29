import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';

let server: Server;
let port: number;

const spec = {
  openapi: '3.1.0',
  info: { title: 'Test', version: '1.0' },
  servers: [{ url: 'http://localhost:0' }],
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
  server = await new Promise<Server>((resolve) => {
    const srv = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
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

describe('importFromUrl', () => {
  it('fetches spec from URL and generates config', async () => {
    const { importFromUrl } = await import('../../src/openapi/import.js');
    const result = await importFromUrl(`http://127.0.0.1:${port}/openapi.json`, { name: 'test-bridge' });
    expect(result.config).toContain('name: test-bridge');
    expect(result.config).toContain('listItems');
    expect(result.config).toContain('get_id');
    expect(result.endpoints).toHaveLength(2);
  });
});

describe('importFromFile', () => {
  it('reads spec from local file', async () => {
    const { importFromFile } = await import('../../src/openapi/import.js');
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync('mcp-test-');
    const specPath = join(tmpDir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec), 'utf-8');

    try {
      const result = importFromFile(specPath, { name: 'file-bridge' });
      expect(result.config).toContain('name: file-bridge');
      expect(result.endpoints).toHaveLength(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
