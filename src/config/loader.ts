import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { parseAndValidateConfig } from './schema.js';
import type { BridgeConfig } from './types.js';

export function loadConfig(filePath: string): BridgeConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  let parsed: unknown;
  switch (ext) {
    case '.json':
      parsed = JSON.parse(raw);
      break;
    case '.yaml':
    case '.yml':
      parsed = yaml.load(raw);
      break;
    case '.toml':
      parsed = toml.parse(raw);
      break;
    default:
      throw new Error(`Unsupported config format: ${ext}. Use .json, .yaml, .yml, or .toml`);
  }

  return parseAndValidateConfig(parsed);
}
