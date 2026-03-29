# mcp-live-bridge

**配置驱动的 CLI 工具，将外部 HTTP API 暴露为 MCP 工具。**

mcp-live-bridge 通过读取描述 HTTP 端点的配置文件，自动将它们作为 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 工具通过 Streamable HTTP 传输暴露出去。无需为每个 API 编写代码 —— 在 YAML/JSON/TOML 中定义端点，它们就会变成可调用的 MCP 工具。

[**English**](README.md) | 中文

## 特性

- **零代码创建工具** — 在配置中定义 HTTP 端点，即刻获得 MCP 工具
- **灵活的认证系统** — 内置 Form 和 OAuth2 提供者，支持自定义提供者
- **模板引擎** — 基于 Handlebars 的参数映射，支持 URL、查询参数、请求体和请求头
- **响应转换** — JSONPath 提取和 Handlebars 模板格式化
- **多格式配置** — 支持 YAML、JSON 和 TOML
- **认证生命周期管理** — 自动令牌刷新、轮询验证、401 自动重试
- **Streamable HTTP 传输** — 使用官方 MCP SDK 的 Streamable HTTP 传输
- **CLI 界面** — `start`、`validate`、`list` 命令

## 快速开始

### 安装

```bash
npm install -g mcp-live-bridge
```

或从源码构建：

```bash
git clone https://github.com/<your-org>/mcp-live-bridge.git
cd mcp-live-bridge
npm install
npm run build
```

### 创建配置文件

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
    description: "获取所有用户列表"
    url: https://api.example.com/users
    method: GET

  - name: get_user
    description: "根据 ID 获取用户"
    url: https://api.example.com/users/{{params.id}}
    method: GET
    parameters:
      id:
        type: integer
        required: true
        description: "用户 ID"
        location: path
```

### 启动服务

```bash
mcp-live-bridge start -c bridge-config.yaml
```

MCP 服务器现在在 `http://localhost:8090` 上监听。

### 配置 Claude Desktop / IDE

在 MCP 客户端配置中添加（例如 Claude Desktop 的 `claude_desktop_config.json`）：

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

## CLI 命令

```bash
# 启动 MCP 服务器
mcp-live-bridge start -c <配置文件> [选项]

选项:
  -p, --port <端口>     覆盖服务器端口
  --verbose             详细日志
  --quiet               仅输出错误

# 验证配置文件（不启动服务器）
mcp-live-bridge validate -c <配置文件>

# 列出配置中定义的所有工具
mcp-live-bridge list -c <配置文件>

# 交互式配置生成向导
mcp-live-bridge init

# 指定输出文件
mcp-live-bridge init -o my-config.yaml

# 从 OpenAPI spec 导入
mcp-live-bridge import -u https://api.example.com/openapi.json -n my-bridge

# 从本地文件导入
mcp-live-bridge import -f ./openapi.yaml -n my-bridge -o config.yaml
```

## 配置参考

### 完整配置结构

```yaml
name: bridge-name                    # 必填：Bridge 实例名称
version: "1.0"                      # 可选：配置格式版本（默认："1.0"）

server:                             # 可选：服务器设置
  host: 0.0.0.0                     # 默认：0.0.0.0
  port: 8080                        # 默认：8080
  cors_origin: "*"                  # 默认："*"
  timeout: 30000                    # 请求超时时间，单位毫秒（默认：30000）

auth:                               # 必填：认证配置
  provider: form                    # 内置："form" | "oauth2" 或自定义 .mjs 文件路径
  config: {}                        # 提供者特定配置
  validation: {}                    # 可选：认证验证
  refresh: {}                       # 可选：刷新策略

headers:                            # 可选：全局默认请求头
  Content-Type: application/json

tools:                              # 必填：工具定义数组
  - name: tool_name                 # 必填：工具名称（唯一）
    description: "工具描述"          # 必填：工具描述
    url: https://api.example.com    # 必填：完整端点 URL
    method: GET                     # 必填：HTTP 方法
    headers: {}                     # 可选：工具级别请求头（与全局合并）
    body: ""                        # 可选：请求体模板
    content_type: ""                # 可选：Content-Type 覆盖
    parameters: {}                  # 可选：参数定义
    response: {}                    # 可选：响应转换
```

### 工具参数

每个参数支持以下字段：

| 字段          | 类型     | 必填 | 说明                                          |
|---------------|----------|------|-----------------------------------------------|
| `type`        | string   | 是   | `string`、`number`、`integer`、`boolean`、`array`、`object` |
| `required`    | boolean  | 否   | 是否必填（默认：根据 `default` 推断）           |
| `default`     | any      | 否   | 默认值                                        |
| `description` | string   | 否   | 参数描述                                      |
| `location`    | string   | 是   | `path`、`query`、`body`、`header`             |
| `enum`        | string[] | 否   | 允许的值列表                                  |

参数通过 `{{params.<name>}}` 注入到模板中。

### 响应转换

```yaml
tools:
  - name: search
    url: https://api.example.com/search?q={{params.query}}
    method: GET
    response:
      extract: "$.results[*]"         # JSONPath 表达式提取数据
      template: "{{#each this}}{{name}}: {{url}}\n{{/each}}"  # Handlebars 模板
```

- **extract**：JSONPath 表达式，用于提取响应的子集
- **template**：Handlebars 模板，用于格式化提取的数据

如果省略，则返回原始 JSON 响应。

## 认证

### 内置：Form 提供者

基于 Cookie 的认证（发送凭据，从 `Set-Cookie` 头中提取 Cookie）：

```yaml
auth:
  provider: form
  config:
    login_url: https://api.example.com/login
    login_method: POST               # 默认：POST
    login_body: '{"user":"{{username}}","pass":"{{password}}"}'  # 可选：JSON 请求体模板
    login_headers: {}                # 可选：额外的登录请求头
    username: your-username
    password: your-password
```

如果省略 `login_body`，凭据将以 `application/x-www-form-urlencoded` 格式发送。

### 内置：OAuth2 提供者

```yaml
auth:
  provider: oauth2
  config:
    token_url: https://api.example.com/oauth/token
    client_id: your-client-id
    client_secret: your-client-secret
    grant_type: client_credentials   # "authorization_code" | "client_credentials"
    # authorization_code 授权码模式需要：
    authorization_url: https://api.example.com/oauth/authorize
    redirect_uri: http://localhost:8090/callback
    scopes:
      - read
      - write
```

### 自定义认证提供者

编写一个 ESM 模块，导出一个包含以下方法的类：

```javascript
// my-auth-provider.mjs
export default class MyAuthProvider {
  async init(config) { /* 使用 auth.config 调用 */ }
  async getAuthHeaders() { /* 返回请求头对象，例如 { Authorization: "Bearer ..." } */ }
  async isValid() { /* 返回布尔值 */ }
  async refresh() { /* 重新认证 */ }
  async dispose() { /* 清理资源 */ }
  async getAuthContext() { /* 可选：返回认证元数据 */ }
}
```

然后在配置中引用：

```yaml
auth:
  provider: ./my-auth-provider.mjs
  config:
    token_url: https://api.example.com/token
    api_key: your-api-key
```

完整 JWT 示例请参考 [`examples/jwt-auth-provider.mjs`](examples/jwt-auth-provider.mjs)。

### 认证验证与刷新

```yaml
auth:
  provider: form
  config:
    login_url: https://api.example.com/login
    username: user
    password: pass

  validation:                        # 可选：定期认证健康检查
    check_url: https://api.example.com/me
    check_method: GET                # 默认：GET
    valid_when:
      status: 200                    # 期望的 HTTP 状态码

  refresh:                           # 可选：刷新行为
    on_failure: true                 # 401 时自动刷新（默认：true）
    retry_count: 3                   # 最大重试次数（默认：3）
    retry_delay: 5                   # 重试间隔秒数（默认：5）
    poll_interval: 300               # 每 N 秒验证一次（可选）
```

## 示例

查看 [`examples/`](examples/) 目录获取完整的工作示例：

- [`jwt-service-config.yaml`](examples/jwt-service-config.yaml) + [`jwt-auth-provider.mjs`](examples/jwt-auth-provider.mjs) — JWT Token 认证（自定义 provider）
- [`cookie-service-config.yaml`](examples/cookie-service-config.yaml) + [`cookie-auth-provider.mjs`](examples/cookie-auth-provider.mjs) — Cookie/Session 认证，支持 CSRF（自定义 provider）
- [`oauth-service-config.yaml`](examples/oauth-service-config.yaml) — OAuth2 client_credentials 认证（内置 provider）

## 架构

```
┌──────────────────────────────────────────────────────┐
│                    mcp-live-bridge                   │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  配置加载  │──>│  工具注册表   │──>│  MCP 服务器  │ │
│  │           │   │              │   │ (Streamable  │ │
│  └──────────┘   └──────┬───────┘   │  HTTP)       │ │
│                        │           └──────────────┘ │
│                        v                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │               请求处理管道                       │ │
│  │  认证头 -> 模板渲染 -> HTTP 请求 -> 响应转换     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │            认证生命周期管理器                    │ │
│  │  初始化 -> 轮询验证 -> 失败时自动刷新            │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式构建
npm run dev

# 运行测试
npm test

# 验证配置文件
node dist/index.js validate -c examples/jwt-service-config.yaml

# 列出配置中的工具
node dist/index.js list -c examples/jwt-service-config.yaml
```

## 环境要求

- Node.js >= 20

## 许可证

[MIT](LICENSE)
