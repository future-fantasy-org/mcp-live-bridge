# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
