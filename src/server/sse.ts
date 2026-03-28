import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BridgeConfig } from '../config/types.js';

export function createMcpServer(config: Pick<BridgeConfig, 'name' | 'version'>): McpServer {
  return new McpServer({
    name: config.name,
    version: config.version ?? '1.0',
  });
}
