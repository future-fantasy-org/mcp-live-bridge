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
  authProviderHeaders?: Record<string, string>,
  paramDefs?: Record<string, ParameterDef>
): Record<string, string> {
  const merged = { ...(authProviderHeaders ?? {}), ...(globalHeaders ?? {}), ...toolHeaders };
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(merged)) {
    const template = Handlebars.compile(value, { noEscape: true });
    result[key] = template({ auth: authContext, params });
  }

  if (paramDefs) {
    for (const [name, def] of Object.entries(paramDefs)) {
      if (def.location === 'header') {
        const value = params[name];
        if (value !== undefined && value !== null) {
          result[name] = String(value);
        }
      }
    }
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
