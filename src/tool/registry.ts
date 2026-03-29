import { z } from 'zod';
import type { ToolDef, ParameterDef } from '../config/types.js';

const TYPE_MAP: Record<string, () => z.ZodTypeAny> = {
  string: () => z.string(),
  number: () => z.number(),
  integer: () => z.number().int(),
  boolean: () => z.boolean(),
  array: () => z.array(z.any()),
  object: () => z.record(z.string(), z.any()),
};

export function paramDefToZodSchema(paramDefs: Record<string, ParameterDef>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, def] of Object.entries(paramDefs)) {
    let field = TYPE_MAP[def.type]?.() ?? z.string();

    if (def.description) {
      field = field.describe(def.description);
    }

    if (def.enum) {
      field = z.enum(def.enum) as unknown as z.ZodTypeAny;
    }

    if (!def.required && !def.default) {
      field = field.optional();
    }

    shape[name] = field;
  }

  return shape;
}

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map();

  constructor(tools: ToolDef[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getAllTools(): ToolDef[] {
    return Array.from(this.tools.values());
  }
}
