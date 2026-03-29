import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import {
  question,
  formatChoices,
  validateRequired,
  validateUrl,
  validatePort,
  parseChoiceIndex,
} from './prompt.js';

interface AuthConfig {
  provider: string;
  config: Record<string, any>;
  validation?: Record<string, any>;
  refresh?: Record<string, any>;
}

interface FullConfigInput {
  name: string;
  port: number;
  auth: AuthConfig;
  tools: any[];
  globalHeaders?: Record<string, string>;
}

const AUTH_CHOICES = [
  'Form (cookie-based login)',
  'OAuth2',
  'Bearer Token (static)',
  'Custom provider file',
  'None (no authentication)',
];

const AUTH_KEYS = ['form', 'oauth2', 'bearer', 'custom', 'none'] as const;

export function buildAuthConfig(choice: string, answers: Record<string, string>): AuthConfig {
  switch (choice) {
    case 'form':
      return {
        provider: 'form',
        config: {
          login_url: answers.login_url,
          username: answers.username,
          password: answers.password,
        },
      };
    case 'oauth2':
      return {
        provider: 'oauth2',
        config: {
          token_url: answers.token_url,
          client_id: answers.client_id,
          client_secret: answers.client_secret,
          grant_type: answers.grant_type ?? 'client_credentials',
        },
      };
    case 'bearer':
      return {
        provider: 'bearer',
        config: { token: answers.token },
      };
    case 'custom':
      return {
        provider: answers.provider_path,
        config: {},
      };
    case 'none':
      return { provider: 'form', config: { login_url: 'http://placeholder', username: '', password: '' } };
    default:
      throw new Error(`Unknown auth choice: ${choice}`);
  }
}

export function buildFullConfig(input: FullConfigInput): string {
  const config: Record<string, any> = {
    name: input.name,
    version: '1.0',
  };

  if (input.port !== 8080) {
    config.server = { port: input.port };
  }

  config.auth = input.auth;
  if (input.globalHeaders) {
    config.headers = input.globalHeaders;
  }
  config.tools = input.tools;

  return yaml.dump(config, { lineWidth: 120, noRefs: true });
}

async function promptLoop(
  rl: readline.Interface,
  promptText: string,
  validate: ((v: string) => string | null) | null,
  defaultValue?: string
): Promise<string> {
  const display = defaultValue ? `${promptText} [${defaultValue}] ` : `${promptText} `;
  while (true) {
    const answer = await question(rl, display);
    const value = answer || defaultValue || '';
    if (!validate) return value;
    const error = validate(value);
    if (!error) return value;
    console.log(`  Warning: ${error}`);
  }
}

export async function runInit(outputPath: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let tools: any[] = [];
  let detectedAuth: any = null;

  try {
    console.log('\nmcp-live-bridge init\n');

    // Step 1: Bridge name
    const name = await promptLoop(rl, 'Bridge name:', validateRequired, 'mcp-bridge');

    // Step 2: Server port
    const portStr = await promptLoop(rl, 'Server port (default: 8080):', validatePort, '8080');
    const port = parseInt(portStr, 10);

    // Step 3: Import from OpenAPI or manual
    const importChoice = await promptLoop(rl, 'Import endpoints from OpenAPI spec? (y/N):', null, 'n');
    const shouldImport = importChoice.toLowerCase() === 'y';

    if (shouldImport) {
      const specUrl = await promptLoop(rl, 'OpenAPI spec URL:', validateUrl);
      console.log(`\nFetching spec from ${specUrl}...`);
      try {
        const { importFromUrl } = await import('../openapi/import.js');
        const result = await importFromUrl(specUrl, { name, port });
        console.log(`Found ${result.endpoints.length} endpoints.`);
        if (result.auth) {
          detectedAuth = result.auth;
          console.log(`Detected auth scheme: ${result.auth.type} (${result.auth.schemeName})`);
        }

        // Show endpoints and let user select
        console.log('\nEndpoints found:');
        result.endpoints.forEach((ep: any, i: number) => {
          console.log(`  ${(i + 1).toString().padStart(3)}. [${ep.method}] ${ep.path} - ${ep.description}`);
        });
        console.log('  all. Import all endpoints');

        const selection = await promptLoop(rl, 'Select endpoints (comma-separated numbers, or "all"):', null, 'all');
        if (selection.toLowerCase() === 'all') {
          const parsed = yaml.load(result.config) as any;
          tools = parsed.tools ?? [];
        } else {
          const { generateConfig } = await import('../openapi/generator.js');
          const indices = selection.split(',').map((s: string) => parseInt(s.trim(), 10) - 1);
          const parsed = yaml.load(
            generateConfig({ name, endpoints: result.endpoints, auth: detectedAuth, port, selectedIndices: indices })
          ) as any;
          tools = parsed.tools ?? [];
        }
      } catch (err: any) {
        console.error(`Failed to import: ${err.message}`);
        console.log('Continuing with empty tool list. You can add tools manually.');
        tools = [];
      }
    }

    // Step 4: Auth config
    console.log('\nAuthentication:');
    console.log(formatChoices(AUTH_CHOICES));
    if (detectedAuth) {
      console.log(`  (Detected: ${detectedAuth.type} - ${detectedAuth.schemeName})`);
    }

    let authChoice: string;
    if (detectedAuth?.type === 'bearer') {
      authChoice = 'bearer';
      console.log(`  > Selected: Bearer Token (static)`);
    } else {
      const authInput = await promptLoop(rl, 'Choose auth method (1-5):', (v) => {
        const n = parseChoiceIndex(v, AUTH_CHOICES.length);
        return n ? null : 'Enter a number between 1 and 5';
      });
      const idx = parseChoiceIndex(authInput, AUTH_CHOICES.length);
      authChoice = AUTH_KEYS[idx! - 1];
    }

    const authAnswers: Record<string, string> = {};
    switch (authChoice) {
      case 'form':
        authAnswers.login_url = await promptLoop(rl, '  Login URL:', validateUrl);
        authAnswers.username = await promptLoop(rl, '  Username:', validateRequired);
        authAnswers.password = await question(rl, '  Password: ');
        break;
      case 'oauth2':
        authAnswers.token_url = await promptLoop(rl, '  Token URL:', validateUrl);
        authAnswers.client_id = await promptLoop(rl, '  Client ID:', validateRequired);
        authAnswers.client_secret = await question(rl, '  Client Secret: ');
        authAnswers.grant_type = await promptLoop(rl, '  Grant type (client_credentials/authorization_code):', null, 'client_credentials');
        break;
      case 'bearer':
        authAnswers.token = await promptLoop(rl, '  Bearer token:', validateRequired);
        break;
      case 'custom':
        authAnswers.provider_path = await promptLoop(rl, '  Provider file path (.mjs):', validateRequired);
        break;
    }

    const auth = buildAuthConfig(authChoice, authAnswers);

    // Step 5: Global headers
    const addHeaders = await promptLoop(rl, 'Add global headers? (y/N):', null, 'n');
    let globalHeaders: Record<string, string> | undefined;
    if (addHeaders.toLowerCase() === 'y') {
      globalHeaders = {};
      console.log('  Enter headers (format: Key: Value), empty line to finish:');
      while (true) {
        const line = await question(rl, '  ');
        if (!line) break;
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          globalHeaders[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
        }
      }
    }

    // Step 6: Generate and write config
    const configYaml = buildFullConfig({ name, port, auth, tools, globalHeaders });
    fs.writeFileSync(outputPath, configYaml, 'utf-8');

    console.log(`\nConfig written to ${outputPath}`);
    console.log(`  Tools: ${tools.length}`);
    console.log(`\nStart the server with:`);
    console.log(`  mcp-live-bridge start -c ${outputPath}\n`);

  } finally {
    rl.close();
  }
}
