import Handlebars from 'handlebars';
import type { ParameterDef } from '../config/types.js';

Handlebars.registerHelper('json', (context: any) => JSON.stringify(context));

export function renderUrl(urlTemplate: string, params: Record<string, any>): string {
  const template = Handlebars.compile(urlTemplate, { noEscape: true });
  return template({ params });
}

export function renderBody(
  bodyTemplate: string | Record<string, unknown> | undefined,
  params: Record<string, any>,
  contentType?: string
): string | undefined {
  if (bodyTemplate === undefined) return undefined;

  if (typeof bodyTemplate === 'string') {
    const template = Handlebars.compile(bodyTemplate, { noEscape: true });
    return template({ params });
  }

  // Object body: recursively render string values, then serialize
  const rendered = renderObjectTemplate(bodyTemplate, params);

  if (contentType === 'application/x-www-form-urlencoded') {
    const flat = flattenObject(rendered);
    return new URLSearchParams(flat).toString();
  }

  // Default: application/json
  return JSON.stringify(rendered);
}

function renderObjectTemplate(
  obj: Record<string, unknown>,
  params: Record<string, any>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const template = Handlebars.compile(value, { noEscape: true });
      result[key] = template({ params });
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? renderObjectTemplate(item as Record<string, unknown>, params)
          : typeof item === 'string'
            ? (() => { const t = Handlebars.compile(item, { noEscape: true }); return t({ params }); })()
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = renderObjectTemplate(value as Record<string, unknown>, params);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
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
