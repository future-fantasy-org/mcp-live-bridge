import type { OpenAPISpec, OpenAPIOperation } from './types.js';
import type { ParameterDef } from '../config/types.js';

export function parseOpenAPISpec(raw: string): OpenAPISpec {
  const parsed = JSON.parse(raw);
  if (!parsed.openapi && !parsed.swagger) {
    throw new Error('Invalid OpenAPI spec: must have "openapi" or "swagger" field');
  }
  return parsed as OpenAPISpec;
}

export interface ExtractedEndpoint {
  name: string;
  description: string;
  method: string;
  path: string;
  url: string;
  parameters: ParameterDef[];
  body?: string;
}

export function extractEndpoints(spec: OpenAPISpec): ExtractedEndpoint[] {
  const baseUrl = spec.servers?.[0]?.url ?? '';
  const endpoints: ExtractedEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
    for (const method of methods) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      const endpoint = convertOperation(method.toUpperCase(), path, baseUrl, operation);
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

function convertOperation(
  method: string,
  path: string,
  baseUrl: string,
  operation: OpenAPIOperation
): ExtractedEndpoint {
  const name = operation.operationId ?? generateName(method, path);
  const description = operation.description || operation.summary || `${method} ${path}`;

  // Convert path params: {id} -> {{params.id}}
  const urlPath = path.replace(/\{(\w+)\}/g, '{{params.$1}}');
  const url = `${baseUrl}${urlPath}`;

  const parameters: ParameterDef[] = [];
  const bodyParams: { name: string; def: ParameterDef }[] = [];

  // Process OpenAPI parameters (query, path, header)
  for (const param of operation.parameters ?? []) {
    if (param.in === 'cookie') continue;
    parameters.push({
      name: param.name,
      type: mapSchemaType(param.schema?.type),
      required: param.required ?? false,
      description: param.description,
      location: param.in as 'query' | 'header' | 'path',
      enum: param.schema?.enum,
    });
  }

  // Process requestBody properties as body params
  const jsonContent = operation.requestBody?.content?.['application/json'];
  if (jsonContent?.schema?.properties) {
    for (const [propName, propSchema] of Object.entries(jsonContent.schema.properties)) {
      const isRequired = jsonContent.schema.required?.includes(propName) ?? false;
      const paramDef: ParameterDef = {
        name: propName,
        type: mapSchemaType(propSchema.type),
        required: isRequired,
        description: propSchema.description,
        location: 'body',
        enum: propSchema.enum,
      };
      bodyParams.push({ name: propName, def: paramDef });
      parameters.push(paramDef);
    }

    if (bodyParams.length > 0) {
      const bodyTemplate = '{' +
        bodyParams.map((p) => `"${p.name}":"{{params.${p.name}}}"`).join(',') +
        '}';
      return { name, description, method, path, url, parameters, body: bodyTemplate };
    }
  }

  return { name, description, method, path, url, parameters };
}

function mapSchemaType(type?: string): 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' {
  switch (type) {
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default: return 'string';
  }
}

function generateName(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'root';
  const cleanSegment = lastSegment.replace(/\{(\w+)\}/, '$1');
  return `${method.toLowerCase()}_${cleanSegment}`;
}

export interface AuthSuggestion {
  type: 'bearer' | 'api_key' | 'oauth2' | 'basic';
  schemeName: string;
  description?: string;
  headerName?: string;
}

export function extractAuthSuggestion(spec: OpenAPISpec): AuthSuggestion | null {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return null;

  // Prefer the first http/bearer scheme
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      return { type: 'bearer', schemeName: name, description: scheme.bearerFormat };
    }
  }

  // Then apiKey
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'apiKey') {
      return { type: 'api_key', schemeName: name, headerName: scheme.name };
    }
  }

  // Then basic
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'basic') {
      return { type: 'basic', schemeName: name };
    }
  }

  return null;
}
