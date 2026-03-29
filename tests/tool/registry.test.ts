import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { paramDefToZodSchema, ToolRegistry } from '../../src/tool/registry.js';
import type { ToolDef, ParameterDef } from '../../src/config/types.js';

describe('paramDefToZodSchema', () => {
  it('creates raw shape for string param', () => {
    const paramDefs: Record<string, ParameterDef> = {
      name: { type: 'string', location: 'query', required: true, description: 'The name' },
    };
    const shape = paramDefToZodSchema(paramDefs);
    expect(shape).toHaveProperty('name');
    // Verify it's a Zod schema that can be used with z.object
    const schema = z.object(shape);
    expect(schema.parse({ name: 'test' }).name).toBe('test');
  });

  it('marks params as optional when not required and no default', () => {
    const paramDefs: Record<string, ParameterDef> = {
      keyword: { type: 'string', location: 'query', required: true },
      limit: { type: 'integer', location: 'query' },
    };
    const shape = paramDefToZodSchema(paramDefs);
    const schema = z.object(shape);
    const result = schema.parse({ keyword: 'test' });
    expect(result.keyword).toBe('test');
    expect(result.limit).toBeUndefined();
  });

  it('validates enum values', () => {
    const paramDefs: Record<string, ParameterDef> = {
      status: { type: 'string', location: 'query', required: true, enum: ['active', 'inactive'] },
    };
    const shape = paramDefToZodSchema(paramDefs);
    const schema = z.object(shape);
    expect(() => schema.parse({ status: 'active' })).not.toThrow();
    expect(() => schema.parse({ status: 'inactive' })).not.toThrow();
    expect(() => schema.parse({ status: 'unknown' })).toThrow();
  });

  it('supports various types', () => {
    const paramDefs: Record<string, ParameterDef> = {
      count: { type: 'integer', location: 'query', required: true },
      rate: { type: 'number', location: 'query', required: true },
      active: { type: 'boolean', location: 'query', required: true },
    };
    const shape = paramDefToZodSchema(paramDefs);
    const schema = z.object(shape);
    expect(() => schema.parse({ count: 10, rate: 3.14, active: true })).not.toThrow();
  });

  it('includes description metadata', () => {
    const paramDefs: Record<string, ParameterDef> = {
      query: { type: 'string', location: 'query', required: true, description: 'Search query' },
    };
    const shape = paramDefToZodSchema(paramDefs);
    expect(shape.query).toBeDefined();
    // Description is embedded in the Zod schema, verify via toJSONSchema
    const jsonSchema = shape.query.toJSONSchema?.();
    expect(jsonSchema?.description).toBe('Search query');
  });

  it('requires fields that are marked required', () => {
    const paramDefs: Record<string, ParameterDef> = {
      id: { type: 'string', location: 'path', required: true },
    };
    const shape = paramDefToZodSchema(paramDefs);
    const schema = z.object(shape);
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ id: '123' })).not.toThrow();
  });
});

describe('ToolRegistry', () => {
  const tools: ToolDef[] = [
    {
      name: 'search',
      description: 'Search for items',
      url: 'https://api.example.com/search',
      method: 'GET',
      parameters: {
        q: { type: 'string', location: 'query', required: true },
      },
    },
    {
      name: 'create-item',
      description: 'Create a new item',
      url: 'https://api.example.com/items',
      method: 'POST',
      body: '{"name":"{{params.name}}"}',
    },
  ];

  it('stores and retrieves tools by name', () => {
    const registry = new ToolRegistry(tools);
    expect(registry.getTool('search')).toBeDefined();
    expect(registry.getTool('search')!.name).toBe('search');
    expect(registry.getTool('nonexistent')).toBeUndefined();
  });

  it('returns all tool names', () => {
    const registry = new ToolRegistry(tools);
    const names = registry.getAllToolNames();
    expect(names).toContain('search');
    expect(names).toContain('create-item');
    expect(names).toHaveLength(2);
  });

  it('returns all tools', () => {
    const registry = new ToolRegistry(tools);
    const allTools = registry.getAllTools();
    expect(allTools).toHaveLength(2);
    expect(allTools.map((t) => t.name)).toEqual(['search', 'create-item']);
  });

  it('handles empty tool list', () => {
    const registry = new ToolRegistry([]);
    expect(registry.getAllToolNames()).toHaveLength(0);
    expect(registry.getAllTools()).toHaveLength(0);
    expect(registry.getTool('anything')).toBeUndefined();
  });
});
