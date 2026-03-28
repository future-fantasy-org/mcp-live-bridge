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

A single config file maps to one backend service. Supports JSON, YAML, and TOML formats.

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

  - name: create_document
    description: "Create a new document"
    url: https://example.com/api/documents
    method: POST
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
  → File path? → Dynamic import() load
→ new Provider().init(auth.config)
→ Start validation loop (if poll_interval configured)
```

### Built-in Providers

- **form**: POST to login URL with credentials, store cookie, inject into requests. Uses validation.check_url to detect expiry.
- **oauth2**: Execute OAuth2 flow to get access_token, return `Authorization: Bearer xxx` header.

### Custom Providers

Users write a JS/TS file exporting a class that implements the `AuthProvider` interface. Loaded dynamically at startup via `import()`, no registration or installation required.

## Request Pipeline

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
