import { readFileSync } from 'node:fs';
import { parseOpenAPISpec, extractEndpoints, extractAuthSuggestion } from './parser.js';
import type { ExtractedEndpoint, AuthSuggestion } from './parser.js';
import { generateConfig } from './generator.js';

export interface ImportResult {
  config: string;
  endpoints: ExtractedEndpoint[];
  auth: AuthSuggestion | null;
}

export async function importFromUrl(
  url: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): Promise<ImportResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);
  }
  const raw = await response.text();
  return importFromSpec(raw, options);
}

export function importFromFile(
  filePath: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): ImportResult {
  const raw = readFileSync(filePath, 'utf-8');
  return importFromSpec(raw, options);
}

function importFromSpec(
  raw: string,
  options: { name: string; port?: number; selectedIndices?: number[] }
): ImportResult {
  const spec = parseOpenAPISpec(raw);
  const endpoints = extractEndpoints(spec);
  const auth = extractAuthSuggestion(spec);

  const config = generateConfig({
    name: options.name,
    endpoints,
    auth,
    port: options.port,
    selectedIndices: options.selectedIndices,
  });

  return { config, endpoints, auth };
}
