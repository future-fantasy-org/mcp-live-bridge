import type { AuthProvider } from './provider.js';
import { createHttpClient } from '../utils/http.js';

export class OAuth2AuthProvider implements AuthProvider {
  private config: Record<string, any> = {};
  private accessToken = '';
  private refreshToken = '';
  private tokenType = 'Bearer';
  private httpClient = createHttpClient();

  async init(config: Record<string, any>): Promise<void> {
    this.config = config;
    await this.requestToken();
  }

  private async requestToken(params?: Record<string, string>): Promise<void> {
    const body = new URLSearchParams({
      grant_type: params?.grant_type ?? this.config.grant_type ?? 'client_credentials',
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      ...(this.config.scope ? { scope: this.config.scope } : {}),
      ...(params ?? {}),
    });

    if (this.config.grant_type === 'authorization_code' && !params?.grant_type) {
      if (this.config.code) body.set('code', this.config.code);
      if (this.config.redirect_uri) body.set('redirect_uri', this.config.redirect_uri);
    }

    const response = await this.httpClient.request({
      url: this.config.token_url,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const tokenData = JSON.parse(response.body);
    if (!tokenData.access_token) {
      throw new Error(`OAuth2 token request failed: ${response.body}`);
    }
    this.accessToken = tokenData.access_token;
    this.tokenType = tokenData.token_type ?? 'Bearer';
    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.accessToken) await this.refresh();
    return { Authorization: `${this.tokenType} ${this.accessToken}` };
  }

  async isValid(): Promise<boolean> {
    return !!this.accessToken;
  }

  async refresh(): Promise<void> {
    if (this.refreshToken) {
      await this.requestToken({ grant_type: 'refresh_token', refresh_token: this.refreshToken });
    } else {
      this.accessToken = '';
      await this.requestToken();
    }
  }

  async dispose(): Promise<void> {
    this.accessToken = '';
    this.refreshToken = '';
  }

  async getAuthContext(): Promise<Record<string, any>> {
    return { token: this.accessToken, token_type: this.tokenType };
  }
}
