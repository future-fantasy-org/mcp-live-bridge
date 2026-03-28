import { z } from 'zod';
import type { BridgeConfig } from './types.js';

const parameterDefSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
  required: z.boolean().optional(),
  default: z.any().optional(),
  description: z.string().optional(),
  location: z.enum(['query', 'body', 'header', 'path']),
  enum: z.array(z.string()).optional(),
});

const responseDefSchema = z.object({
  extract: z.string().optional(),
  template: z.string().optional(),
});

const toolDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  method: z.string().toUpperCase(),
  headers: z.record(z.string(), z.string()).optional(),
  content_type: z.string().optional(),
  body: z.string().optional(),
  parameters: z.record(z.string(), parameterDefSchema).optional(),
  response: responseDefSchema.optional(),
});

const validWhenSchema = z.object({
  status: z.number().optional(),
  jsonpath_not_exists: z.string().optional(),
  jsonpath_equals: z.record(z.string(), z.any()).optional(),
  json_match: z.object({ pattern: z.string() }).optional(),
});

const validationDefSchema = z.object({
  check_url: z.string(),
  check_method: z.string().optional(),
  check_body: z.string().optional(),
  check_headers: z.record(z.string(), z.string()).optional(),
  valid_when: validWhenSchema.optional(),
});

const refreshDefSchema = z.object({
  on_failure: z.boolean().default(true),
  poll_interval: z.number().optional(),
  retry_count: z.number().default(3),
  retry_delay: z.number().default(5),
});

const authDefSchema = z.object({
  provider: z.string().min(1),
  config: z.record(z.string(), z.any()),
  validation: validationDefSchema.optional(),
  refresh: refreshDefSchema.optional(),
});

const serverDefSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().default(8080),
  cors_origin: z.string().default('*'),
  timeout: z.number().default(30000),
});

const configSchema = z.object({
  name: z.string().min(1),
  version: z.string().default('1.0'),
  server: z.preprocess((val) => val ?? {}, serverDefSchema),
  auth: authDefSchema,
  headers: z.record(z.string(), z.string()).optional(),
  tools: z.array(toolDefSchema).min(1),
});

export function parseAndValidateConfig(input: unknown): BridgeConfig {
  return configSchema.parse(input) as BridgeConfig;
}
