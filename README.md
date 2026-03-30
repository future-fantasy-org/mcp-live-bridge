# mcp-live-bridge

**Config-driven CLI that exposes external HTTP APIs as MCP tools.**

mcp-live-bridge reads a configuration file describing HTTP endpoints and automatically exposes them as [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools via Streamable HTTP transport. No per-API coding required — define your endpoints in YAML/JSON/TOML and they become callable MCP tools.

## Features

- **Zero-code tool creation** — Define HTTP endpoints in config, get MCP tools instantly
- **Flexible auth system** — Built-in Form and OAuth2 providers, plus custom provider support
- **Template engine** — Handlebars-based parameter mapping for URL, query, body, and headers
- **Response transformation** — JSONPath extraction and Handlebars template formatting
- **Multi-format config** — YAML, JSON, or TOML
- **Auth lifecycle management** — Auto token refresh, polling validation, and retry on 401
- **Per-session transport** — Each MCP client gets its own transport instance, supporting multiple simultaneous connections
- **Debug logging** — Configurable log levels (`quiet`, `default`, `verbose`, `debug`) with request/response detail tracing
- **OpenAPI import** — Generate bridge config from OpenAPI/Swagger specs
- **Interactive init** — Guided config generation wizard
- **Streamable HTTP transport** — Uses the official MCP SDK with Streamable HTTP
- **CLI interface** — `start`, `validate`, `list`, `init`, and `import` commands

## Quick Start

### Install

```bash
npm install -g mcp-live-bridge
```

Or build from source:

```bash
git clone https://github.com/<your-org>/mcp-live-bridge.git
cd mcp-live-bridge
npm install
npm run build
```

### Create a config file

```yaml
# bridge-config.yaml
name: my-api-bridge
server:
  port: 8090

auth:
  provider: form
  config:
    login_url: https://api.example.com/login
    username: your-username
    password: your-password

tools:
  - name: list_users
    description: "List all users"
    url: https://api.example.com/users
    method: GET

  - name: get_user
    description: "Get a user by ID"
    url: https://api.example.com/users/{{params.id}}
    method: GET
    parameters:
      id:
        type: integer
        required: true
        description: "User ID"
        location: path
```

### Start the server

```bash
mcp-live-bridge start -c bridge-config.yaml
```

The MCP server is now listening on `http://localhost:8090`.

### Configure with Claude Desktop / IDE

Add to your MCP client config (e.g., Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-api-bridge": {
      "url": "http://localhost:8090/mcp",
      "headers": {}
    }
  }
}
```

## CLI Commands

```bash
# Start the MCP server
mcp-live-bridge start -c <config-file> [options]

Options:
  -p, --port <number>   Override server port
  --verbose             Verbose logging (can also be set via server.log_level in config)
  --quiet               Errors only

# Validate config file without starting
mcp-live-bridge validate -c <config-file>

# List all tools defined in config
mcp-live-bridge list -c <config-file>

# Interactive config generation wizard
mcp-live-bridge init

# Specify output file
mcp-live-bridge init -o my-config.yaml

# Import from OpenAPI spec
mcp-live-bridge import -u https://api.example.com/openapi.json -n my-bridge

# Import from local file
mcp-live-bridge import -f ./openapi.yaml -n my-bridge -o config.yaml
```

## Configuration Reference

### Full Config Schema

```yaml
name: bridge-name                    # Required: Bridge instance name
version: "1.0"                      # Optional: Config format version (default: "1.0")

server:                             # Optional: Server settings
  host: 0.0.0.0                     # Default: 0.0.0.0
  port: 8080                        # Default: 8080
  cors_origin: "*"                  # Default: "*"
  timeout: 30000                    # Request timeout in ms (default: 30000)
  log_level: default                # "quiet" | "default" | "verbose" | "debug" (default: "default")

auth:                               # Required: Authentication config
  provider: form                    # Built-in: "form" | "oauth2" | path to custom .mjs
  config: {}                        # Provider-specific config
  validation: {}                    # Optional: Auth validation
  refresh: {}                       # Optional: Refresh strategy

headers:                            # Optional: Global default headers
  Content-Type: application/json

tools:                              # Required: Array of tool definitions
  - name: tool_name                 # Required: Tool name (unique)
    description: "Tool description" # Required: Tool description
    url: https://api.example.com    # Required: Full endpoint URL
    method: GET                     # Required: HTTP method
    headers: {}                     # Optional: Tool-level headers (merged with global)
    body: ""                        # Optional: Request body template
    content_type: ""                # Optional: Content-Type override
    parameters: {}                  # Optional: Parameter definitions
    response: {}                    # Optional: Response transformation
```

### Tool Parameters

Each parameter supports these fields:

| Field       | Type     | Required | Description                      |
|-------------|----------|----------|----------------------------------|
| `type`      | string   | Yes      | `string`, `number`, `integer`, `boolean`, `array`, `object` |
| `required`  | boolean  | No       | Whether the parameter is required (default: inferred from `default`) |
| `default`   | any      | No       | Default value                    |
| `description` | string | No       | Parameter description            |
| `location`  | string   | Yes      | `path`, `query`, `body`, `header` |
| `enum`      | string[] | No       | Allowed values                   |

Parameters are injected into templates via `{{params.<name>}}`.

### Response Transformation

```yaml
tools:
  - name: search
    url: https://api.example.com/search?q={{params.query}}
    method: GET
    response:
      extract: "$.results[*]"         # JSONPath expression to extract data
      template: "{{#each this}}{{name}}: {{url}}\n{{/each}}"  # Handlebars template
```

- **extract**: JSONPath expression to extract a subset of the response
- **template**: Handlebars template to format the extracted data

If omitted, the raw JSON response is returned.

## Authentication

### Built-in: Form Provider

Cookie-based authentication (posts credentials, extracts cookies from `Set-Cookie` header):

```yaml
auth:
  provider: form
  config:
    login_url: https://api.example.com/login
    login_method: POST               # Default: POST
    login_body: '{"user":"{{username}}","pass":"{{password}}"}'  # Optional: JSON body template
    login_headers: {}                # Optional: Extra login headers
    username: your-username
    password: your-password
```

If `login_body` is omitted, credentials are sent as `application/x-www-form-urlencoded`.

### Built-in: OAuth2 Provider

```yaml
auth:
  provider: oauth2
  config:
    token_url: https://api.example.com/oauth/token
    client_id: your-client-id
    client_secret: your-client-secret
    grant_type: client_credentials   # "authorization_code" | "client_credentials"
    # For authorization_code:
    authorization_url: https://api.example.com/oauth/authorize
    redirect_uri: http://localhost:8090/callback
    scopes:
      - read
      - write
```

### Custom Auth Provider

Write an ESM module that exports a class with these methods:

```javascript
// my-auth-provider.mjs
export default class MyAuthProvider {
  async init(config) { /* Called with auth.config */ }
  async getAuthHeaders() { /* Return headers object, e.g., { Authorization: "Bearer ..." } */ }
  async isValid() { /* Return boolean */ }
  async refresh() { /* Re-authenticate */ }
  async dispose() { /* Cleanup */ }
  async getAuthContext() { /* Optional: return auth metadata */ }
}
```

Then reference it in your config:

```yaml
auth:
  provider: ./my-auth-provider.mjs
  config:
    token_url: https://api.example.com/token
    api_key: your-api-key
```

See [`examples/jwt-auth-provider.mjs`](examples/jwt-auth-provider.mjs) for a complete JWT example.

### Auth Validation & Refresh

The auth system provides two mechanisms to keep credentials valid:

1. **Proactive polling** — Periodically calls a validation endpoint to check if credentials are still valid, and refreshes proactively before they expire
2. **Reactive refresh** — When a tool call receives a 401 response, automatically refreshes credentials and retries the request

```yaml
auth:
  provider: form
  config:
    login_url: https://api.example.com/login
    username: user
    password: pass

  validation:                        # Optional: Auth health check endpoint
    check_url: https://api.example.com/me
    check_method: GET                # Default: GET (or POST if check_body is set)
    check_headers: {}                # Optional: Extra headers for the check request
    check_body: ""                   # Optional: Request body (switches method to POST)
    valid_when:
      status: 200                    # Expected HTTP status code
      # jsonpath_not_exists: "$.expired"   # Optional: JSONPath that must not exist
      # jsonpath_equals:               # Optional: JSONPath value assertions
      #   "$.active": true
      # json_match:                    # Optional: Regex match on response body
      #   pattern: ".*ok.*"

  refresh:                           # Refresh behavior
    on_failure: true                 # Auto-refresh on 401 (default: true)
    retry_count: 3                   # Max retries on refresh failure (default: 3)
    retry_delay: 5                   # Seconds between retries (default: 5)
    poll_interval: 300               # Proactive: validate every N seconds (optional, disabled by default)
```

**How it works:**

| Trigger | Behavior |
|---------|----------|
| `poll_interval` is set | Every N seconds, calls `validation.check_url` with current auth headers. If the check fails, triggers `refresh()` |
| Tool call returns 401 | Automatically calls `refresh()` and retries the request (up to `retry_count + 1` times) |
| No `validation` defined | Falls back to `provider.isValid()` for polling (if `poll_interval` is set) |
| No `poll_interval` | Polling is disabled; refresh only happens reactively on 401 |

## Examples

See the [`examples/`](examples/) directory for complete working examples:

- [`jwt-service-config.yaml`](examples/jwt-service-config.yaml) + [`jwt-auth-provider.mjs`](examples/jwt-auth-provider.mjs) — JWT token auth (custom provider)
- [`cookie-service-config.yaml`](examples/cookie-service-config.yaml) + [`cookie-auth-provider.mjs`](examples/cookie-auth-provider.mjs) — Cookie/session auth with CSRF support (custom provider)
- [`oauth-service-config.yaml`](examples/oauth-service-config.yaml) — OAuth2 client_credentials auth (built-in provider)

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    mcp-live-bridge                   │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Config   │──>│ Tool Registry │──>│ MCP Server   │ │
│  │  Loader   │   │              │   │ (per-session)│ │
│  └──────────┘   └──────┬───────┘   └──────┬───────┘ │
│                        │                    │        │
│                        v                    v        │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Request Pipeline                   │ │
│  │  Auth Headers -> Template -> HTTP -> Transform  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Auth Lifecycle Manager                │ │
│  │  Init -> Poll Validate -> Refresh on 401/fail  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Session Manager (per-client transport)         │ │
│  │  New transport per session -> route by session  │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in watch mode
npm run dev

# Run tests
npm test

# Validate a config file
node dist/index.js validate -c examples/jwt-service-config.yaml

# List tools in a config
node dist/index.js list -c examples/jwt-service-config.yaml
```

## Requirements

- Node.js >= 20

## License

[MIT](LICENSE)
