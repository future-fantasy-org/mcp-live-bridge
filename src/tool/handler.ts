import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { Logger } from '../utils/logger.js';
import type { HttpClient, HttpResponse } from '../utils/http.js';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number>;
}

export interface HandlerContext {
  http: {
    get(url: string, options?: RequestOptions): Promise<any>;
    post(url: string, options?: RequestOptions): Promise<any>;
    put(url: string, options?: RequestOptions): Promise<any>;
    delete(url: string, options?: RequestOptions): Promise<any>;
    request(req: { url: string; method: string; headers?: Record<string, string>; body?: string }): Promise<HttpResponse>;
  };
  auth: Record<string, string>;
  config: Record<string, unknown>;
  logger: Logger;
}

export type ToolHandler = (params: Record<string, any>, context: HandlerContext) => Promise<any>;

export async function loadToolHandler(handlerPath: string): Promise<ToolHandler> {
  if (!existsSync(handlerPath)) {
    throw new Error(`Handler file not found: ${handlerPath}`);
  }
  const absolutePath = path.resolve(handlerPath);
  const mod = await import(pathToFileURL(absolutePath).href);
  const handler = mod.default;
  if (typeof handler !== 'function') {
    throw new Error(`Handler file ${handlerPath} must have a default export that is a function`);
  }
  return handler;
}

export function createHandlerContext(
  httpClient: HttpClient,
  auth: Record<string, string>,
  config: Record<string, unknown>,
  logger: Logger
): HandlerContext {
  function buildUrl(url: string, params?: Record<string, string | number>): string {
    if (!params) return url;
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return qs ? `${url}?${qs}` : url;
  }

  return {
    http: {
      async get(url, options = {}) {
        const finalUrl = buildUrl(url, options.params);
        const res = await httpClient.request({ url: finalUrl, method: 'GET', headers: options.headers ?? {} });
        return JSON.parse(res.body);
      },
      async post(url, options = {}) {
        const finalUrl = buildUrl(url, options.params);
        const body = options.body !== undefined ? String(options.body) : undefined;
        const res = await httpClient.request({ url: finalUrl, method: 'POST', headers: options.headers ?? {}, body });
        return JSON.parse(res.body);
      },
      async put(url, options = {}) {
        const finalUrl = buildUrl(url, options.params);
        const body = options.body !== undefined ? String(options.body) : undefined;
        const res = await httpClient.request({ url: finalUrl, method: 'PUT', headers: options.headers ?? {}, body });
        return JSON.parse(res.body);
      },
      async delete(url, options = {}) {
        const finalUrl = buildUrl(url, options.params);
        const res = await httpClient.request({ url: finalUrl, method: 'DELETE', headers: options.headers ?? {} });
        return JSON.parse(res.body);
      },
      async request(req) {
        return httpClient.request({
          url: req.url,
          method: req.method,
          headers: req.headers ?? {},
          body: req.body,
        });
      },
    },
    auth,
    config,
    logger,
  };
}
