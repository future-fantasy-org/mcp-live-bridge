import { Command } from 'commander';
import { loadConfig } from './config/loader.js';
import { createLogger, type LogLevel } from './utils/logger.js';
import { loadAuthProviderAsync } from './auth/loader.js';
import { AuthLifecycleManager } from './auth/manager.js';
import { ToolRegistry, paramDefToZodSchema } from './tool/registry.js';
import { createPipeline } from './tool/pipeline.js';
import { createMcpServer } from './server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const program = new Command();
program
  .name('mcp-live-bridge')
  .description('Config-driven CLI that exposes external HTTP APIs as MCP tools')
  .version('0.1.0');

function parseLogLevel(verbose: boolean, quiet: boolean): LogLevel {
  if (quiet) return 'quiet';
  if (verbose) return 'verbose';
  return 'default';
}

program
  .command('start')
  .description('Start the MCP server')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .option('-p, --port <number>', 'Override server port')
  .option('--verbose', 'Verbose logging')
  .option('--quiet', 'Quiet mode (errors only)')
  .action(async (options) => {
    const logLevel = parseLogLevel(options.verbose, options.quiet);
    const logger = createLogger(logLevel);

    try {
      const config = loadConfig(options.config);
      logger.info(`Loading config: ${options.config}`);
      logger.info(`Config loaded: ${config.tools.length} tools registered`);

      if (options.port) {
        config.server = { ...config.server, port: parseInt(options.port, 10) };
      }

      const host = config.server?.host ?? '0.0.0.0';
      const port = config.server?.port ?? 8080;
      const corsOrigin = config.server?.cors_origin ?? '*';
      const timeout = config.server?.timeout ?? 30000;

      logger.info(`Initializing auth provider: ${config.auth.provider}`);
      const authProvider = await loadAuthProviderAsync(config.auth.provider);
      const authManager = new AuthLifecycleManager(authProvider, config.auth);
      await authManager.start();
      logger.info('Auth initialized successfully');

      const registry = new ToolRegistry(config.tools);
      const mcpServer = createMcpServer(config);

      for (const toolDef of registry.getAllTools()) {
        const pipeline = createPipeline(toolDef, config.headers ?? {}, timeout, logger);
        pipeline.setAuthManager(authManager);
        const paramDefs = toolDef.parameters ?? {};
        const schema = paramDefToZodSchema(paramDefs);

        mcpServer.tool(toolDef.name, toolDef.description, schema, async (params) => {
          logger.info(`Tool call: ${toolDef.name}(${JSON.stringify(params)})`);
          const startTime = Date.now();
          try {
            const result = await pipeline.execute(params);
            const elapsed = Date.now() - startTime;
            logger.info(`Tool call: ${toolDef.name} -> 200 OK (${elapsed}ms)`);
            return {
              content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
            };
          } catch (err: any) {
            const elapsed = Date.now() - startTime;
            logger.error(`Tool call: ${toolDef.name} -> ${err.message} (${elapsed}ms)`);
            return {
              content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
              isError: true,
            };
          }
        });
      }

      // Create Streamable HTTP transport and connect to MCP server
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => {
        logger.info('MCP transport connection closed');
      };
      transport.onerror = (error: Error) => {
        logger.error(`MCP transport error: ${error.message}`);
      };

      await mcpServer.connect(transport);
      logger.info('MCP server connected to Streamable HTTP transport');

      const httpServer = createServer(async (req, res) => {
        // Handle CORS preflight
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          await transport.handleRequest(req, res);
        } catch (err: any) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: err.message }));
          logger.error(`HTTP request error: ${err.message}`);
        }
      });

      let isShuttingDown = false;
      const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        logger.info('Shutting down...');
        await transport.close();
        httpServer.close();
        setTimeout(() => {
          logger.warn('Graceful shutdown timeout, forcing exit');
          process.exit(1);
        }, 10000);
        await authManager.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      httpServer.listen(port, host, () => {
        logger.info(`MCP server listening on http://${host}:${port}`);
      });
    } catch (err: any) {
      logger.error(err.message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate config file without starting')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .action((options) => {
    try {
      loadConfig(options.config);
      console.log(`Config valid: ${options.config}`);
    } catch (err: any) {
      console.error(`Config invalid: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all tools defined in config')
  .requiredOption('-c, --config <path>', 'Path to config file')
  .action((options) => {
    try {
      const config = loadConfig(options.config);
      for (const tool of config.tools) {
        console.log(`  ${tool.name}: ${tool.description}`);
        console.log(`    ${tool.method} ${tool.url}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
