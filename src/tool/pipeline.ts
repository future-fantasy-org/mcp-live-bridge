import type { ToolDef } from '../config/types.js';
import { createHttpClient } from '../utils/http.js';
import { renderUrl, renderBody, renderHeaders, renderQueryParams } from './template.js';
import { transformResponse } from './transformer.js';
import type { Logger } from '../utils/logger.js';

export interface Pipeline {
  execute(params: Record<string, any>): Promise<any>;
  setAuthManager(manager: {
    getAuthHeaders(): Promise<Record<string, string>>;
    getAuthContext(): Promise<Record<string, any>>;
    refreshWithRetry(): Promise<void>;
  }): void;
}

export function createPipeline(
  toolDef: ToolDef,
  globalHeaders: Record<string, string>,
  timeout: number,
  logger?: Logger
): Pipeline {
  const httpClient = createHttpClient({ timeout });
  let authManager: {
    getAuthHeaders(): Promise<Record<string, string>>;
    getAuthContext(): Promise<Record<string, any>>;
    refreshWithRetry(): Promise<void>;
  } | null = null;

  return {
    setAuthManager(manager) {
      authManager = manager;
    },

    async execute(params: Record<string, any>): Promise<any> {
      const maxRetries = 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let url = renderUrl(toolDef.url, params);
        const queryParams = renderQueryParams(params, toolDef.parameters ?? {});
        url += queryParams;

        const authHeaders = authManager ? await authManager.getAuthHeaders() : {};
        const authContext = authManager ? await authManager.getAuthContext() : {};
        const headers = renderHeaders(toolDef.headers, authContext, params, globalHeaders, authHeaders, toolDef.parameters);
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

        if (response.status === 401 && authManager) {
          logger?.info(`Tool call: ${toolDef.name} -> 401, refreshing auth...`);
          await authManager.refreshWithRetry();
          continue;
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.body}`);
        }

        return transformResponse(response.body, toolDef.response);
      }

      throw new Error(`Tool ${toolDef.name} failed after ${maxRetries} retries`);
    },
  };
}
