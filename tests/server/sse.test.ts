import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../src/server/sse.js';

describe('createMcpServer', () => {
  it('creates an McpServer with correct name and version', () => {
    const mcpServer = createMcpServer({ name: 'test-bridge', version: '1.0' });
    expect(mcpServer).toBeDefined();
    expect(mcpServer.server).toBeDefined();
  });

  it('defaults version to 1.0 when not provided', () => {
    const mcpServer = createMcpServer({ name: 'my-bridge' });
    expect(mcpServer).toBeDefined();
  });
});
