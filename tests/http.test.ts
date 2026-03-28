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

  it('makes GET request', async () => {
    const client = createHttpClient({ timeout: 5000 });
    const result = await client.request({ url: `${baseUrl}/ok`, method: 'GET', headers: {} });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"status":"ok"}');
  });

  it('makes POST request with body', async () => {
    const client = createHttpClient({ timeout: 5000 });
    const result = await client.request({ url: `${baseUrl}/echo`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"value"}' });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"key":"value"}');
  });

  it('throws on timeout', async () => {
    const client = createHttpClient({ timeout: 100 });
    await expect(client.request({ url: `${baseUrl}/slow`, method: 'GET', headers: {} })).rejects.toThrow('timed out');
  });
});
