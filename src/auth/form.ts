import Handlebars from 'handlebars';
import type { AuthProvider } from './provider.js';
import { createHttpClient } from '../utils/http.js';

export class FormAuthProvider implements AuthProvider {
  private cookies: Map<string, string> = new Map();
  private config: Record<string, any> = {};
  private httpClient = createHttpClient();
  private cookieString = '';

  async init(config: Record<string, any>): Promise<void> {
    this.config = config;
    await this.login();
  }

  private async login(): Promise<void> {
    let body: string | undefined;
    let headers: Record<string, string> = {};

    if (this.config.login_body) {
      const template = Handlebars.compile(this.config.login_body, { noEscape: true });
      body = template({ username: this.config.username, password: this.config.password });
      headers = { ...(this.config.login_headers ?? {}), 'Content-Type': 'application/json' };
    } else {
      const params = new URLSearchParams();
      params.append('username', this.config.username);
      params.append('password', this.config.password);
      body = params.toString();
      headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }

    const method = (this.config.login_method ?? 'POST').toUpperCase();
    const response = await this.httpClient.request({
      url: this.config.login_url,
      method,
      headers,
      body,
    });

    if (!response.headers['set-cookie']) {
      throw new Error(`Form login failed: no Set-Cookie header in response from ${this.config.login_url}`);
    }

    this.extractCookies(response.headers['set-cookie']);
  }

  private extractCookies(setCookieHeaders: string | string[]): void {
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const header of headers) {
      const cookiePart = header.split(';')[0];
      const [name, ...valueParts] = cookiePart.split('=');
      this.cookies.set(name.trim(), valueParts.join('=').trim());
    }
    this.cookieString = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.cookieString) {
      await this.refresh();
    }
    return { Cookie: this.cookieString };
  }

  async isValid(): Promise<boolean> {
    return this.cookies.size > 0;
  }

  async refresh(): Promise<void> {
    this.cookies.clear();
    this.cookieString = '';
    await this.login();
  }

  async dispose(): Promise<void> {
    this.cookies.clear();
    this.cookieString = '';
  }

  async getAuthContext(): Promise<Record<string, any>> {
    return {
      cookies: Object.fromEntries(this.cookies),
      cookie_header: this.cookieString,
    };
  }
}
