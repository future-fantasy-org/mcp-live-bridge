import type { AuthProvider } from './provider.js';
import type { AuthDef, ValidationDef } from '../config/types.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';
import { createHttpClient } from '../utils/http.js';
import { JSONPath } from 'jsonpath-plus';

export class AuthLifecycleManager {
  private refreshMutex: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private logger: Logger = createLogger('default');
  private httpClient = createHttpClient();

  constructor(
    private provider: AuthProvider,
    private authDef: AuthDef
  ) {}

  async start(): Promise<void> {
    this.logger.debug(`Auth init: provider=${this.authDef.provider}`);
    await this.provider.init(this.authDef.config);
    this.logger.debug('Auth init: success');
    this.startPollLoop();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.provider.dispose();
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers = await this.provider.getAuthHeaders();
    this.logger.debug(`Auth headers: ${JSON.stringify(headers)}`);
    return headers;
  }

  async getAuthContext(): Promise<Record<string, any>> {
    if (this.provider.getAuthContext) {
      return this.provider.getAuthContext();
    }
    return {};
  }

  async refreshWithRetry(): Promise<void> {
    this.refreshMutex = this.refreshMutex.then(async () => {
      const refresh = this.authDef.refresh;
      const maxRetries = refresh?.retry_count ?? 3;
      const retryDelay = refresh?.retry_delay ?? 5;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          this.logger.info('Auth refresh triggered');
          this.logger.debug(`Auth refresh attempt ${attempt + 1}/${maxRetries + 1}`);
          await this.provider.refresh();
          this.logger.debug('Auth refresh: success');
          this.logger.info('Auth refresh success');
          return;
        } catch (err: any) {
          this.logger.error(`Auth refresh failed (attempt ${attempt + 1}/${maxRetries}): ${err.message}`);
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, retryDelay * 1000));
          }
        }
      }
      throw new Error(`Auth refresh failed after ${maxRetries + 1} attempts`);
    });
    return this.refreshMutex;
  }

  async checkValidity(): Promise<boolean> {
    const validation = this.authDef.validation;
    if (!validation) return this.provider.isValid();

    try {
      const authHeaders = await this.provider.getAuthHeaders();
      this.logger.debug(`Auth validate: ${validation.check_method ?? 'GET'} ${validation.check_url}`);
      const response = await this.httpClient.request({
        url: validation.check_url,
        method: validation.check_method ?? (validation.check_body ? 'POST' : 'GET'),
        headers: { ...(validation.check_headers ?? {}), ...authHeaders },
        body: validation.check_body,
      });
      const valid = evaluateValidWhen(response, validation.valid_when);
      this.logger.debug(`Auth validate: status=${response.status} valid=${valid}`);
      return valid;
    } catch {
      return false;
    }
  }

  private startPollLoop(): void {
    const interval = this.authDef.refresh?.poll_interval;
    if (!interval) return;

    this.logger.info(`Auth poll loop started (interval: ${interval}s)`);
    this.pollTimer = setInterval(async () => {
      try {
        const valid = await this.checkValidity();
        if (!valid) {
          this.logger.info('Auth poll check: expired, refreshing...');
          await this.refreshWithRetry();
        } else {
          this.logger.verbose(`Auth poll check: valid (next check in ${interval}s)`);
        }
      } catch (err: any) {
        this.logger.error(`Auth poll check error: ${err.message}`);
      }
    }, interval * 1000);
  }
}

function evaluateValidWhen(
  response: { status: number; body: string },
  validWhen: ValidationDef['valid_when']
): boolean {
  if (!validWhen) return response.status >= 200 && response.status < 300;

  const conditions: boolean[] = [];

  if (validWhen.status !== undefined) {
    conditions.push(response.status === validWhen.status);
  }

  if (validWhen.jsonpath_not_exists) {
    try {
      const parsed = JSON.parse(response.body);
      const result = JSONPath({ path: validWhen.jsonpath_not_exists, json: parsed, wrap: false });
      conditions.push(result === undefined || result === false);
    } catch {
      conditions.push(false);
    }
  }

  if (validWhen.jsonpath_equals) {
    try {
      const parsed = JSON.parse(response.body);
      for (const [path, expected] of Object.entries(validWhen.jsonpath_equals)) {
        const result = JSONPath({ path, json: parsed, wrap: false });
        conditions.push(result === expected);
      }
    } catch {
      conditions.push(false);
    }
  }

  if (validWhen.json_match) {
    const regex = new RegExp(validWhen.json_match.pattern);
    conditions.push(regex.test(response.body));
  }

  return conditions.length === 0 || conditions.every(Boolean);
}
