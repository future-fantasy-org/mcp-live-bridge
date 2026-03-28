# mcp-live-bridge Design Spec

## Overview

mcp-live-bridge is a CLI tool that reads configuration files (JSON/YAML/TOML) and automatically exposes external HTTP APIs as MCP tools via the SSE protocol. No per-API coding required — define HTTP endpoints in config and they become callable MCP tools.

### Key Capabilities

- Dynamic auth provider system (built-in form/OAuth2 + custom providers)
- Template-based parameter mapping (path/query/body/header)
- Response filtering with JSONPath and formatting with Handlebars templates
- Automatic auth lifecycle management (detection, refresh, retry)
- SSE-based MCP server

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  mcp-live-bridge                 │
│                                                  │
│  ┌──────────┐   ┌──────────────┐   ┌──────────┐ │
│  │ Config    │──→│ Tool Registry │──→│   SSE     │ │
│  │ Loader    │   │              │   │   Server  │ │
│  └──────────┘   └──────┬───────┘   └──────────┘ │
│                        │                         │
│                        ▼                         │
│  ┌─────────────────────────────────────────────┐ │
│  │              Request Pipeline               │ │
│  │                                             │ │
│  │  Auth Middleware                            │ │
│  │    ↓                                        │ │
│  │  Template Engine (path/query/body/header)   │ │
│  │    ↓                                        │ │
│  │  HTTP Client                                │ │
│  │    ↓                                        │ │
│  │  Response Transformer (extract + template)  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │           Auth Lifecycle Manager            │ │
│  │                                             │ │
│  │  init → poll loop ──→ refresh on failure    │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| **Config Loader** | Read JSON/YAML/TOML config files, validate with Zod, convert to internal Config object |
| **Tool Registry** | Register MCP tools (name, description, inputSchema) based on config tool definitions |
| **SSE Server** | Implement MCP SSE protocol, expose `/sse` and `/messages` endpoints, receive tool call requests |
| **Auth Middleware** | Call Auth Provider to get auth headers, inject into requests |
| **Template Engine** | Render tool call parameters into URL path, query string, body templates, header templates |
| **HTTP Client** | Execute actual HTTP requests |
| **Response Transformer** | Apply JSONPath extraction and template formatting to responses |
| **Auth Lifecycle Manager** | Initialize provider at startup, manage polling loop, handle 401 auto-refresh |

### Project Structure

```
mcp-live-bridge/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── config/
│   │   ├── loader.ts         # Config file loading (JSON/YAML/TOML)
│   │   ├── schema.ts         # Config validation (Zod)
│   │   └── types.ts          # Config type definitions
│   ├── auth/
│   │   ├── manager.ts        # Auth Lifecycle Manager
│   │   ├── provider.ts       # AuthProvider interface
│   │   ├── form.ts           # Built-in form provider
│   │   └── oauth2.ts         # Built-in OAuth2 provider
│   ├── tool/
│   │   ├── registry.ts       # Tool Registry
│   │   ├── pipeline.ts       # Request processing pipeline
│   │   ├── template.ts       # Template engine
│   │   └── transformer.ts    # Response transformer
│   ├── server/
│   │   └── sse.ts            # SSE MCP Server
│   └── utils/
│       ├── http.ts           # HTTP client wrapper
│       └── logger.ts         # Logger
├── package.json
└── tsconfig.json
```

## Configuration File Format

A single config file maps to one backend service. One instance of `mcp-live-bridge start` handles exactly one config file. To run multiple services, run multiple instances. Supports JSON, YAML, and TOML formats.

### Header Merge Strategy

Global `headers` and tool-level `headers` are merged per request. Tool-level headers override global headers with the same key. Auth provider headers (from `getAuthHeaders()`) have the lowest priority — both global and tool-level headers can override them.

### Response Default Behavior

If a tool definition omits the `response` section entirely, the raw response body is returned as-is. If `response` is present but `extract` is omitted, the full parsed JSON response is passed to the template (or returned as-is if no template either).

```yaml
name: my-bridge
version: "1.0"

server:
  host: 0.0.0.0
  port: 8080

auth:
  provider: form                       # Built-in: form | oauth2 | or custom file path
  config:
    login_url: https://example.com/login
    username: myuser
    password: mypass

  # Auth validity detection and refresh strategy
  validation:
    check_url: https://example.com/api
    check_method: POST
    check_body: '{"jsonrpc":"2.0","method":"ping","id":1}'
    check_headers:
      Content-Type: application/json
    valid_when:                        # All conditions must be met to be considered "valid"
      status: 200
      jsonpath_not_exists: "$.error"
      # jsonpath_equals:               # JSONPath value equals expected = valid
      #   "$.result.status": "ok"
      # json_match:                    # Regex match against response body = valid
      #   pattern: '"code":\\s*0'

  refresh:
    on_failure: true                   # Auto-refresh on 401 (default: true)
    poll_interval: 300                 # Polling interval in seconds. Omit to disable polling
    retry_count: 3                     # Retry count on refresh failure (default: 3)
    retry_delay: 5                     # Delay between retries in seconds (default: 5)

headers:
  X-Custom-Header: static-value
  Authorization: "Bearer {{auth.token}}"      # Dynamic value from auth context

tools:
  - name: search_documents
    description: "Search documents"
    url: https://example.com/api/search
    method: GET
    headers:
      Accept: application/json
    parameters:
      keyword:
        type: string
        required: true
        description: "Search keyword"
        location: query
      limit:
        type: integer
        default: 10
        location: query
    response:
      extract: "$.results[*]"
      template: |
        {{#each this}}
        - {{title}} ({{url}})
        {{/each}}

  - name: get_document
    description: "Get a document by ID"
    url: https://example.com/api/documents/{{params.id}}    # path parameter
    method: GET
    parameters:
      id:
        type: string
        required: true
        location: path                                    # replaced in URL
    # No response section → raw response body returned as-is

  - name: create_document
    description: "Create a new document"
    url: https://example.com/api/documents
    method: POST
    content_type: application/json                         # default: application/json
    body: |
      {
        "title": "{{params.title}}",
        "content": "{{params.content}}"
      }
    parameters:
      title:
        type: string
        required: true
        location: body
      content:
        type: string
        required: true
        location: body
    response:
      extract: "$.id"
```

## Auth Provider System

### Provider Interface

Every auth provider (built-in or custom) must implement this interface:

```typescript
interface AuthProvider {
  /** Initialize, called once at startup */
  init(config: Record<string, any>): Promise<void>;

  /** Get current valid auth headers */
  getAuthHeaders(): Promise<Record<string, string>>;

  /** Check if current auth is still valid */
  isValid(): Promise<boolean>;

  /** Refresh auth (called on expiry or 401) */
  refresh(): Promise<void>;

  /** Cleanup resources on shutdown */
  dispose(): Promise<void>;
}
```

### Provider Loading

```
Read auth.provider value
  → Built-in name (form/oauth2)? → Use built-in implementation
  → File path? → Dynamic import() load (ESM .js or .ts compiled to ESM)
→ Import contract: module must have a default export that is an AuthProvider implementation
→ new Provider().init(auth.config)
→ Start validation loop (if poll_interval configured)
```

Custom provider files must be ESM format (`.js` or `.mjs`). The file's default export must be a class implementing the `AuthProvider` interface. If the default export does not implement all required methods, the tool fails at startup with a clear error message listing the missing methods.

### Built-in Providers

#### form

POST credentials to a login URL, extract cookies from the response, and inject them into subsequent requests.

```yaml
auth:
  provider: form
  config:
    login_url: https://example.com/login    # POST target
    login_method: POST                      # default: POST
    username: myuser                        # form field: username
    password: mypass                        # form field: password
    login_headers:                          # optional headers for login request
      Content-Type: application/json
    login_body: |                           # optional custom body template
      {"user":"{{username}}","pass":"{{password}}"}
```

Default login behavior sends `username` and `password` as form-encoded fields (`application/x-www-form-urlencoded`). If `login_body` is provided, it is rendered as a template and sent instead (with `Content-Type` from `login_headers` or `application/json`).

#### oauth2

Supports **authorization code** and **client credentials** grant types. Automatically refreshes the access token using the refresh token when available.

```yaml
auth:
  provider: oauth2
  config:
    grant_type: client_credentials          # authorization_code | client_credentials
    token_url: https://example.com/oauth/token
    client_id: my-client-id
    client_secret: my-client-secret
    scope: "read write"                     # optional
    # For authorization_code grant:
    # authorization_url: https://example.com/oauth/authorize
    # redirect_uri: http://localhost:8080/callback
    # code: manually-obtained-authorization-code
```

Returns `Authorization: Bearer <access_token>` header. When a refresh token is available (from the token response), it is used for subsequent refreshes instead of re-running the full grant flow.

### Custom Providers

Users write a JS file (ESM format) with a default export implementing the `AuthProvider` interface. Loaded dynamically at startup via `import()`, no registration or installation required.

Example custom provider file (`./providers/my-auth.js`):

```javascript
export default class MyAuthProvider {
  async init(config) { /* ... */ }
  async getAuthHeaders() { /* ... */ return { "X-Token": "..." }; }
  async isValid() { /* ... */ return true; }
  async refresh() { /* ... */ }
  async dispose() { /* ... */ }
}
```

## Request Pipeline

### Auth Lifecycle Concurrency

The Auth Lifecycle Manager uses a mutex to serialize refresh operations. Only one refresh can be in progress at any time. If multiple concurrent tool calls encounter 401, or the poll loop detects expiry simultaneously, only the first caller triggers a refresh; other callers wait for the in-progress refresh to complete and then use its result. This prevents redundant login requests and race conditions.

### SSE Server Behavior

- **Startup**: Auth initialization completes before the server starts accepting connections. The MCP client will not attempt tool calls before auth is ready.
- **CORS**: `Access-Control-Allow-Origin: *` header on all responses by default. Configurable via `server.cors_origin` in config.
- **Connection lifecycle**: Follows MCP SSE protocol. Server sends heartbeats. Client auto-reconnects on disconnect.
- **Graceful shutdown**: On SIGINT/SIGTERM, stop accepting new connections, wait for in-flight requests to complete (up to 10s timeout), then call `authProvider.dispose()` and exit.

### Flow

1. SSE Server receives JSON-RPC tool call request
2. Auth Middleware: call `authProvider.getAuthHeaders()`, merge into request headers
3. Template Engine: render parameters into URL path, query string, body template, header template
4. HTTP Client: execute the HTTP request
   - 200 OK → proceed to step 5
   - 401/403 → trigger auth refresh → retry (up to retry_count times)
5. Response Transformer: JSONPath extraction → template formatting → return result to LLM

### Error Handling

| Scenario | Behavior |
|---|---|
| Auth failure (401/403) | Auto refresh → retry, return error after exceeding retry count |
| Network timeout | Return error with timeout info, do not trigger auth refresh |
| HTTP 4xx (non-auth) | Return error directly to LLM |
| HTTP 5xx | Return error directly to LLM |
| JSONPath extraction fails | Return raw response body + warning log |
| Template rendering fails | Return JSONPath extraction result + warning log |

## CLI Interface

CLI flags override config file values. Specifically, `--port` overrides `server.port`.

```bash
# Start MCP server
mcp-live-bridge start -c config.yaml

# Specify port
mcp-live-bridge start -c config.yaml --port 9090

# Verbose logging
mcp-live-bridge start -c config.yaml --verbose

# Quiet mode (errors and warnings only)
mcp-live-bridge start -c config.yaml --quiet

# Validate config file without starting
mcp-live-bridge validate -c config.yaml

# List all tools defined in config
mcp-live-bridge list -c config.yaml
```

### Log Levels

| Level | Output |
|---|---|
| Default | Startup info, tool call summary, auth refresh events |
| `--verbose` | Additional: request/response details, template rendering, JSONPath results |
| `--quiet` | Errors and warnings only |

## Tech Stack

| Purpose | Library | Reason |
|---|---|---|
| CLI framework | `commander` | Mature, stable, simple API |
| Config parsing | `js-yaml` + `toml` + built-in JSON | Native support for all three formats |
| Config validation | `zod` | Type-safe, friendly error messages |
| MCP protocol | `@modelcontextprotocol/sdk` | Official SDK |
| HTTP client | `node:fetch` (Node 18+ built-in) | No extra dependency |
| JSONPath | `jsonpath-plus` | Full-featured, standard JSONPath syntax |
| Template engine | `handlebars` | Lightweight, intuitive `{{}}` syntax |
| Logging | `chalk` + `console` | Simple coloring, no heavy logging framework |
| Build tool | `tsup` | Zero-config TypeScript build, outputs ESM + CJS |

### Target Environment

- Node.js >= 18
- Single-file output via `tsup`, usable via `npx mcp-live-bridge` or global install
