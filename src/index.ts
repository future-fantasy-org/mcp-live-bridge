import { Command } from 'commander';
import { loadConfig } from './config/loader.js';
import { createLogger, type LogLevel } from './utils/logger.js';
import { loadAuthProviderAsync } from './auth/loader.js';
import { AuthLifecycleManager } from './auth/manager.js';
import { ToolRegistry, paramDefToZodSchema } from './tool/registry.js';
import { createPipeline } from './tool/pipeline.js';
import { loadToolHandler, createHandlerContext } from './tool/handler.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHttpClient } from './utils/http.js';
import { randomUUID } from 'node:crypto';

const program = new Command();
program
  .name('mcp-live-bridge')
  .description('Config-driven CLI that exposes external HTTP APIs as MCP tools')
  .version('0.1.0');

function resolveLogLevel(verbose: boolean, quiet: boolean, configLevel?: string): LogLevel {
  if (quiet) return 'quiet';
  if (verbose) return 'verbose';
  if (configLevel === 'debug') return 'debug';
  if (configLevel === 'verbose') return 'verbose';
  if (configLevel === 'quiet') return 'quiet';
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
    try {
      const config = loadConfig(options.config);
      const logLevel = resolveLogLevel(options.verbose, options.quiet, config.server?.log_level);
      const logger = createLogger(logLevel);
      logger.info(`Loading config: ${options.config}`);
      logger.info(`Config loaded: ${config.tools.length} tools registered`);

      if (options.port) {
        config.server = { ...config.server, port: parseInt(options.port, 10) };
      }

      const host = config.server?.host ?? '0.0.0.0';
      const port = config.server?.port ?? 8080;
      const corsOrigin = config.server?.cors_origin ?? '*';
      const corsAllowHeaders = (config.server?.cors_allow_headers ?? ['Content-Type', 'Authorization', 'MCP-Session-Id', 'Mcp-Protocol-Version']).join(', ');
      const corsAllowMethods = (config.server?.cors_allow_methods ?? ['GET', 'POST', 'DELETE', 'OPTIONS']).join(', ');
      const corsExposeHeaders = (config.server?.cors_expose_headers ?? ['MCP-Session-Id', 'Mcp-Protocol-Version']).join(', ');
      const timeout = config.server?.timeout ?? 30000;

      logger.info(`Initializing auth provider: ${config.auth.provider}`);
      const authProvider = await loadAuthProviderAsync(config.auth.provider);
      const authManager = new AuthLifecycleManager(authProvider, config.auth);
      await authManager.start();
      logger.info('Auth initialized successfully');

      const registry = new ToolRegistry(config.tools);

      // Session store: sessionId -> transport
      const sessions = new Map<string, StreamableHTTPServerTransport>();

      // Factory: create a new McpServer + transport pair for a session
      async function createSession(): Promise<{ server: McpServer; transport: StreamableHTTPServerTransport }> {
        const mcpServer = new McpServer({
          name: config.name,
          version: config.version ?? '1.0',
        });

        for (const toolDef of registry.getAllTools()) {
          const paramDefs = toolDef.parameters ?? {};
          const schema = paramDefToZodSchema(paramDefs);

          if (toolDef.type === 'handler' && toolDef.handler) {
            const handler = await loadToolHandler(toolDef.handler);
            const httpClient = createHttpClient({ timeout });
            const handlerCtx = createHandlerContext(httpClient, {}, config.auth.config ?? {}, logger);

            mcpServer.tool(toolDef.name, toolDef.description, schema, async (params) => {
              logger.info(`Tool call: ${toolDef.name}(${JSON.stringify(params)}) [handler]`);
              const startTime = Date.now();
              try {
                const authHeaders = await authManager.getAuthHeaders();
                handlerCtx.auth = authHeaders;
                const result = await handler(params, handlerCtx);
                const elapsed = Date.now() - startTime;
                logger.info(`Tool call: ${toolDef.name} -> 200 OK (${elapsed}ms) [handler]`);
                return {
                  content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }],
                };
              } catch (err: any) {
                const elapsed = Date.now() - startTime;
                logger.error(`Tool call: ${toolDef.name} -> ${err.message} (${elapsed}ms) [handler]`);
                return {
                  content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
                  isError: true,
                };
              }
            });
          } else {
            const pipeline = createPipeline(toolDef, config.headers ?? {}, timeout, logger);
            pipeline.setAuthManager(authManager);

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
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId: string) => {
            sessions.set(sessionId, transport);
            logger.info(`MCP session initialized: ${sessionId} (active: ${sessions.size})`);
          },
          onsessionclosed: (sessionId: string) => {
            sessions.delete(sessionId);
            logger.info(`MCP session closed: ${sessionId} (active: ${sessions.size})`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            sessions.delete(sid);
            logger.info(`MCP transport closed for session: ${sid} (active: ${sessions.size})`);
          }
        };
        transport.onerror = (error: Error) => {
          logger.error(`MCP transport error: ${error.message}`);
        };

        mcpServer.connect(transport);

        return { server: mcpServer, transport };
      }

      // Pending transport: reused for all requests without a known session
      // until it gets initialized, then a new pending one is created.
      let pendingTransport = (await createSession()).transport;
      logger.info('MCP server ready (per-session transport mode)');

      const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // Handle CORS preflight
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Headers', corsAllowHeaders);
        res.setHeader('Access-Control-Allow-Methods', corsAllowMethods);
        res.setHeader('Access-Control-Expose-Headers', corsExposeHeaders);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          const sessionId = req.headers['mcp-session-id'] as string | undefined;

          // Route to existing session transport if session ID is known
          const sessionTransport = sessionId ? sessions.get(sessionId) : undefined;
          if (sessionTransport) {
            await sessionTransport.handleRequest(req, res);
            return;
          }

          // Request has a session ID that doesn't match any known session — stale session.
          // Strip the header silently so the request is treated as a new connection.
          if (sessionId) {
            logger.debug(`Stale session ID: ${sessionId}, treating as new connection`);
            delete req.headers['mcp-session-id'];
          }

          // Use the pending transport for new connections. After initialization
          // completes, prepare a new pending transport for the next client.
          await pendingTransport.handleRequest(req, res);

          if (pendingTransport.sessionId !== undefined) {
            pendingTransport = (await createSession()).transport;
          }
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
        for (const [sid, transport] of sessions) {
          logger.info(`Closing session: ${sid}`);
          await transport.close();
        }
        await pendingTransport.close();
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

program
  .command('init')
  .description('Interactive config file generator')
  .option('-o, --output <path>', 'Output file path', 'bridge-config.yaml')
  .action(async (options) => {
    try {
      const { runInit } = await import('./cli/init.js');
      await runInit(options.output);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('import')
  .description('Generate bridge config from an OpenAPI/Swagger spec')
  .option('-u, --url <url>', 'URL to OpenAPI spec')
  .option('-f, --file <path>', 'Local OpenAPI spec file path')
  .option('-n, --name <name>', 'Bridge name', 'mcp-bridge')
  .option('-p, --port <number>', 'Server port')
  .option('-o, --output <path>', 'Output file path', 'bridge-config.yaml')
  .action(async (options) => {
    try {
      if (!options.url && !options.file) {
        console.error('Error: Provide either --url or --file');
        process.exit(1);
      }

      const importOpts = {
        name: options.name,
        port: options.port ? parseInt(options.port, 10) : undefined,
      };

      let result: Awaited<ReturnType<typeof import('./openapi/import.js').importFromUrl>>;
      if (options.url) {
        const { importFromUrl } = await import('./openapi/import.js');
        result = await importFromUrl(options.url, importOpts);
      } else {
        const { importFromFile } = await import('./openapi/import.js');
        result = importFromFile(options.file, importOpts);
      }

      const { writeFileSync } = await import('node:fs');
      writeFileSync(options.output, result.config, 'utf-8');

      console.log(`Generated config: ${options.output}`);
      console.log(`  Endpoints: ${result.endpoints.length}`);
      if (result.auth) {
        console.log(`  Auth detected: ${result.auth.type} (${result.auth.schemeName})`);
      }
      console.log(`\nReview and edit ${options.output} to add your credentials, then run:`);
      console.log(`  mcp-live-bridge start -c ${options.output}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
