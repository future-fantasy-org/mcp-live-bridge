export default class JwtAuthProvider {
  constructor() {
    this.accessToken = '';
    this.tokenType = 'Bearer';
    this.config = {};
  }

  async init(config) {
    this.config = config;
    await this.login();
  }

  async login() {
    const body = JSON.stringify({
      login: this.config.username,
      password: this.config.password,
    });

    const response = await fetch(this.config.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new Error(`JWT login failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenType = data.token_type || 'Bearer';
  }

  async getAuthHeaders() {
    if (!this.accessToken) {
      await this.refresh();
    }
    return { Authorization: `${this.tokenType} ${this.accessToken}` };
  }

  async isValid() {
    return !!this.accessToken;
  }

  async refresh() {
    this.accessToken = '';
    await this.login();
  }

  async dispose() {
    this.accessToken = '';
  }

  async getAuthContext() {
    return {
      token: this.accessToken,
      token_type: this.tokenType,
    };
  }
}
