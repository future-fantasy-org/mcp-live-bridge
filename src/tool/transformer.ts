import { JSONPath } from 'jsonpath-plus';
import Handlebars from 'handlebars';
import type { ResponseDef } from '../config/types.js';

export function transformResponse(body: string, responseDef: ResponseDef | undefined): any {
  if (!responseDef) return body;

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  if (!responseDef.extract) {
    if (responseDef.template) {
      return applyTemplate(parsed, responseDef.template);
    }
    return parsed;
  }

  try {
    const extracted = JSONPath({ path: responseDef.extract, json: parsed, wrap: false });
    if (responseDef.template) {
      return applyTemplate(extracted, responseDef.template);
    }
    return extracted;
  } catch (err) {
    console.warn(`[mcp-live-bridge] JSONPath extraction failed: ${err}. Returning raw body.`);
    return parsed;
  }
}

function applyTemplate(data: any, templateStr: string): any {
  try {
    const template = Handlebars.compile(templateStr, { noEscape: true });
    return template(data);
  } catch (err) {
    console.warn(`[mcp-live-bridge] Template rendering failed: ${err}. Returning extracted data.`);
    return data;
  }
}
