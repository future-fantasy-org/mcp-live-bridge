import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/utils/http.js';

// We need to mock createHttpClient before importing FormAuthProvider
const mockRequest = vi.fn();
vi.mock('../../src/utils/http.js', () => ({
  createHttpClient: () => ({
    request: mockRequest,
  }),
}));

import { FormAuthProvider } from '../../src/auth/form.js';

describe('FormAuthProvider', () => {
  let provider: FormAuthProvider;

  beforeEach(() => {
    provider = new FormAuthProvider();
    mockRequest.mockReset();
  });

  it('authenticates and stores cookies from Set-Cookie header', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc123; Path=/' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    // Verify request was made with form data
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'http://localhost:3000/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=testuser&password=testpass',
    });

    // Verify cookies are stored
    const context = await provider.getAuthContext();
    expect(context.cookies).toEqual({ session_id: 'abc123' });
    expect(context.cookie_header).toBe('session_id=abc123');
  });

  it('getAuthHeaders() returns Cookie header', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc123; Path=/' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Cookie: 'session_id=abc123' });
  });

  it('isValid() returns true when cookies exist', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc123' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    expect(await provider.isValid()).toBe(true);
  });

  it('isValid() returns false when no cookies', async () => {
    expect(await provider.isValid()).toBe(false);
  });

  it('supports custom login_body template', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'token=xyz789' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/api/login',
      username: 'admin',
      password: 'secret',
      login_body: '{"user": "{{username}}", "pass": "{{password}}"}',
    });

    expect(mockRequest).toHaveBeenCalledWith({
      url: 'http://localhost:3000/api/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"user": "admin", "pass": "secret"}',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Cookie: 'token=xyz789' });
  });

  it('handles multiple Set-Cookie headers (array)', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': ['session=abc; Path=/', 'csrf=token123; Path=/'] },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    const context = await provider.getAuthContext();
    expect(context.cookies).toEqual({ session: 'abc', csrf: 'token123' });
    expect(context.cookie_header).toBe('session=abc; csrf=token123');
  });

  it('getAuthContext() exposes cookies and cookie_header', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc123' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    const context = await provider.getAuthContext();
    expect(context).toEqual({
      cookies: { session_id: 'abc123' },
      cookie_header: 'session_id=abc123',
    });
  });

  it('dispose() clears all state', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc123' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    expect(await provider.isValid()).toBe(true);
    await provider.dispose();
    expect(await provider.isValid()).toBe(false);

    const context = await provider.getAuthContext();
    expect(context.cookies).toEqual({});
    expect(context.cookie_header).toBe('');
  });

  it('throws error when no Set-Cookie header in response', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: {},
    });

    await expect(
      provider.init({
        login_url: 'http://localhost:3000/login',
        username: 'testuser',
        password: 'testpass',
      })
    ).rejects.toThrow('Form login failed: no Set-Cookie header in response');
  });

  it('refresh() clears cookies and re-logins', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=first' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Mock new response for refresh
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=second' },
    });

    await provider.refresh();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    const headers = await provider.getAuthHeaders();
    expect(headers.Cookie).toBe('session_id=second');
  });

  it('supports custom login_method', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: '{"ok": true}',
      headers: { 'set-cookie': 'session_id=abc' },
    });

    await provider.init({
      login_url: 'http://localhost:3000/login',
      username: 'testuser',
      password: 'testpass',
      login_method: 'PUT',
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT' })
    );
  });
});
