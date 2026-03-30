export interface ParameterDef {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  description?: string;
  location: 'query' | 'body' | 'header' | 'path';
  enum?: string[];
}

export interface ResponseDef {
  extract?: string;
  template?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  content_type?: string;
  body?: string;
  parameters?: Record<string, ParameterDef>;
  response?: ResponseDef;
}

export interface ValidationDef {
  check_url: string;
  check_method?: string;
  check_body?: string;
  check_headers?: Record<string, string>;
  valid_when?: {
    status?: number;
    jsonpath_not_exists?: string;
    jsonpath_equals?: Record<string, any>;
    json_match?: { pattern: string };
  };
}

export interface RefreshDef {
  on_failure?: boolean;
  poll_interval?: number;
  retry_count?: number;
  retry_delay?: number;
}

export interface AuthDef {
  provider: string;
  config: Record<string, any>;
  validation?: ValidationDef;
  refresh?: RefreshDef;
}

export interface ServerDef {
  host?: string;
  port?: number;
  cors_origin?: string;
  timeout?: number;
  log_level?: 'quiet' | 'default' | 'verbose' | 'debug';
}

export interface BridgeConfig {
  name: string;
  version?: string;
  server?: ServerDef;
  auth: AuthDef;
  headers?: Record<string, string>;
  tools: ToolDef[];
}
