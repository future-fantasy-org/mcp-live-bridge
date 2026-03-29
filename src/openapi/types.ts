export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  tags?: string[];
}

export type OpenAPIParameterLocation = 'query' | 'header' | 'path' | 'cookie';

export interface OpenAPIParameter {
  name: string;
  in: OpenAPIParameterLocation;
  required?: boolean;
  description?: string;
  schema?: {
    type?: string;
    format?: string;
    enum?: string[];
    default?: any;
    items?: { type?: string };
  };
}

export interface OpenAPIRequestBody {
  required?: boolean;
  content?: Record<string, OpenAPIMediaType>;
}

export interface OpenAPIMediaType {
  schema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; format?: string; items?: any }>;
    required?: string[];
  };
}

export interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
  description?: string;
}

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: { url: string; description?: string }[];
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
  security?: Record<string, string[]>[];
}
