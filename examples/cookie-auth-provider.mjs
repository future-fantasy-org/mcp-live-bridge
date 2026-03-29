/**
 * Cookie 认证自定义 Provider 示例
 *
 * 适用于需要两步登录的场景：
 *   1. GET 登录页 → 提取 CSRF token（从 cookie 或响应体中）
 *   2. POST 登录 → 携带 CSRF token，提取 session cookie
 *
 * 很多 Web 框架（Django、Laravel、Spring Security 等）使用这种模式。
 * 如果你的登录不需要 CSRF，直接用内置的 form provider 更简单。
 */
export default class CookieAuthProvider {
  constructor() {
    this.cookies = {};
    this.cookieString = '';
    this.config = {};
  }

  async init(config) {
    this.config = config;
    await this.login();
  }

  async login() {
    const loginUrl = this.config.login_url;
    const username = this.config.username;
    const password = this.config.password;

    // 第一步：GET 登录页，提取初始 cookie 和 CSRF token
    const getResponse = await fetch(loginUrl, {
      method: 'GET',
      credentials: 'include',
    });

    this.extractCookies(getResponse.headers.getSetCookie?.() ?? []);

    let csrfToken = this.config.csrf_token;

    if (!csrfToken) {
      // 尝试从响应体中提取 CSRF token（常见于 Django 的 {% csrf_token %}）
      const body = await getResponse.text();
      const match = body.match(/name="csrf[_-]?token"\s+value="([^"]+)"/)
                 || body.match(/csrf[_-]?token["\s:=]+(["'])([^"'\s]+)\1/);

      if (match) {
        csrfToken = match[2];
      }
    }

    // 第二步：POST 登录，携带 cookie 和 CSRF token
    const loginBody = new URLSearchParams({
      username,
      password,
      ...(csrfToken ? { csrf_token: csrfToken } : {}),
    });

    const postResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(this.cookieString ? { Cookie: this.cookieString } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        Referer: loginUrl,
      },
      body: loginBody.toString(),
      credentials: 'include',
    });

    // 更新 cookie（登录成功后通常会设置 session cookie）
    this.extractCookies(postResponse.headers.getSetCookie?.() ?? []);

    if (!this.cookieString) {
      throw new Error(`Cookie login failed: no cookies set after POST to ${loginUrl}`);
    }
  }

  async getAuthHeaders() {
    if (!this.cookieString) {
      await this.refresh();
    }
    return { Cookie: this.cookieString };
  }

  async isValid() {
    return !!this.cookieString;
  }

  async refresh() {
    this.cookies = {};
    this.cookieString = '';
    await this.login();
  }

  async dispose() {
    this.cookies = {};
    this.cookieString = '';
  }

  async getAuthContext() {
    return {
      cookies: this.cookies,
      cookie_header: this.cookieString,
    };
  }

  extractCookies(setCookieHeaders) {
    for (const header of setCookieHeaders) {
      const cookiePart = header.split(';')[0];
      const [name, ...valueParts] = cookiePart.split('=');
      this.cookies[name.trim()] = valueParts.join('=').trim();
    }
    this.cookieString = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}
