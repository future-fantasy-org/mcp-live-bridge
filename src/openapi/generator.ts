import * as yaml from 'js-yaml';
import type { ExtractedEndpoint, AuthSuggestion } from './parser.js';
import type { ToolDef, ParameterDef } from '../config/types.js';

interface GenerateOptions {
  name: string;
  endpoints: ExtractedEndpoint[];
  auth?: AuthSuggestion | null;
  selectedIndices?: number[];
  port?: number;
}

export function generateConfig(options: GenerateOptions): string {
  const endpoints = options.selectedIndices
    ? options.selectedIndices.map((i) => options.endpoints[i])
    : options.endpoints;

  const tools: ToolDef[] = endpoints.map((ep) => ({
    name: ep.name,
    description: ep.description,
    url: ep.url,
    method: ep.method,
    ...(ep.body ? { body: ep.body } : {}),
    parameters: ep.parameters.length > 0
      ? Object.fromEntries(ep.parameters.map((p) => [p.name, toParamDef(p)]))
      : undefined,
  }));

  const config: Record<string, any> = { name: options.name, version: '1.0' };

  if (options.port) {
    config.server = { port: options.port };
  }

  if (options.auth) {
    config.auth = generateAuthConfig(options.auth);
  } else {
    config.auth = {
      provider: 'form',
      config: { login_url: 'YOUR_LOGIN_URL', username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' },
    };
  }

  if (tools.length > 0) {
    config.tools = tools;
  }

  return yaml.dump(config, { lineWidth: 120, noRefs: true });
}

function toParamDef(p: ParameterDef): ParameterDef {
  return {
    type: p.type,
    required: p.required,
    description: p.description,
    location: p.location,
    ...(p.enum ? { enum: p.enum } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
  };
}

function generateAuthConfig(auth: AuthSuggestion): Record<string, any> {
  switch (auth.type) {
    case 'bearer':
      return {
        provider: 'form',
        config: { login_url: 'YOUR_LOGIN_URL', username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' },
      };
    case 'api_key':
      return {
        provider: 'form',
        config: {
          login_url: 'YOUR_LOGIN_URL',
          login_headers: { [auth.headerName ?? 'X-API-Key']: 'YOUR_API_KEY_HERE' },
          username: 'api',
          password: 'api',
        },
      };
    case 'basic':
      return {
        provider: 'form',
        config: { login_url: 'YOUR_LOGIN_URL', username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD' },
      };
    case 'oauth2':
      return {
        provider: 'oauth2',
        config: {
          token_url: 'YOUR_TOKEN_URL',
          client_id: 'YOUR_CLIENT_ID',
          client_secret: 'YOUR_CLIENT_SECRET',
          grant_type: 'client_credentials',
        },
      };
    default:
      return { provider: 'form', config: { login_url: 'YOUR_LOGIN_URL', username: '', password: '' } };
  }
}
