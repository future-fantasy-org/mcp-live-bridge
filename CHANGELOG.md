# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `import` CLI command to generate bridge config from OpenAPI/Swagger specs
- OpenAPI spec parser supporting OpenAPI 3.x and Swagger 2.0
- Automatic auth scheme detection (Bearer, API Key, Basic)
- Config generator that converts OpenAPI endpoints to tool definitions
- `init` interactive command to generate bridge config step by step
- Support for importing OpenAPI spec during init flow
- Cookie auth example with CSRF-aware custom provider
- OAuth2 auth example with built-in provider
- **Per-session transport** — Each MCP client gets its own `McpServer` + transport instance, supporting multiple simultaneous connections via session ID routing
- **Debug log level** — New `debug` log level with detailed request/response tracing (`server.log_level: debug` or `--verbose` flag hierarchy: quiet < default < verbose < debug)
- **Request/response debug logging** — Pipeline logs outbound request (method, URL, headers, body, params) and inbound response (status, headers, body) at debug level
- **Auth lifecycle debug logging** — Auth init, refresh attempts, validation checks, and auth headers all traced at debug level
- **`server.log_level` config option** — Set log level via config file in addition to CLI flags
- **Session lifecycle logging** — Session init, close, and transport errors logged with active session count
- **Stale session handling** — Requests with unrecognized `mcp-session-id` are silently re-routed as new connections

### Changed
- **CORS headers updated** — Added `Mcp-Protocol-Version` to allowed and exposed headers for full SDK protocol compliance
- **CLI command list updated** — README reflects `init` and `import` commands
- **Auth validation docs expanded** — Added proactive polling vs reactive refresh explanation, `check_headers`/`check_body`/`jsonpath_not_exists`/`jsonpath_equals`/`json_match` options documented
- **Architecture diagram updated** — Shows per-session transport, session manager, and updated auth lifecycle

### Fixed
- **Graceful shutdown** — Properly closes all active session transports and pending transport before exit
- **Logger interface** — Added `debug()` method to `Logger` interface (was missing, causing type errors)

## [0.1.0] - 2026-03-28

### Added

- **Project scaffolding** — TypeScript project with tsup bundler and Vitest test framework
- **Config system** — Zod validation schema supporting YAML, JSON, and TOML configuration formats
- **Template engine** — Handlebars-based parameter mapping for URL path, query string, request body, and headers
- **Response transformer** — JSONPath extraction and Handlebars template formatting for API responses
- **HTTP client** — Timeout support and error handling for outbound API requests
- **Auth providers**:
  - `FormAuthProvider` — Cookie-based authentication with configurable login URL and body template
  - `OAuth2AuthProvider` — Authorization code and client credentials grant type support
  - Custom provider loading — ESM module support for custom authentication logic
- **Auth lifecycle manager** — Automatic token validation, polling, retry on failure, and 401 auto-refresh with mutex-based concurrency control
- **Request pipeline** — Full request processing: auth headers -> template rendering -> HTTP request -> response transformation
- **Tool registry** — Dynamic MCP tool registration from config file definitions
- **MCP server** — Streamable HTTP transport integration via official `@modelcontextprotocol/sdk`
- **CLI** — `start`, `validate`, and `list` commands with `--verbose` and `--quiet` logging options
- **Examples** — JWT auth service config and custom JWT auth provider

[0.1.0]: https://github.com/<your-org>/mcp-live-bridge/releases/tag/v0.1.0
