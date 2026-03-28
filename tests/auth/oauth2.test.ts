import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('../../src/utils/http.js', () => ({
  createHttpClient: () => ({
    request: mockRequest,
  }),
}));

import { OAuth2AuthProvider } from '../../src/auth/oauth2.js';

describe('OAuth2AuthProvider', () => {
  let provider: OAuth2AuthProvider;

  beforeEach(() => {
    provider = new OAuth2AuthProvider();
    mockRequest.mockReset();
  });

  it('client_credentials grant gets token and returns Bearer header', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_123', token_type: 'Bearer', expires_in: 3600 }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      grant_type: 'client_credentials',
    });

    // Verify request was made
    const callBody = new URLSearchParams(mockRequest.mock.calls[0][0].body);
    expect(callBody.get('grant_type')).toBe('client_credentials');
    expect(callBody.get('client_id')).toBe('my-client');
    expect(callBody.get('client_secret')).toBe('my-secret');

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer at_123' });
  });

  it('stores refresh token and uses it on refresh', async () => {
    // Initial token response with refresh token
    mockRequest.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ access_token: 'at_initial', refresh_token: 'rt_456', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      grant_type: 'authorization_code',
      code: 'auth_code_123',
      redirect_uri: 'http://localhost:3000/callback',
    });

    expect(await provider.isValid()).toBe(true);

    // Now refresh - should use refresh_token grant
    mockRequest.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ access_token: 'at_refreshed', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.refresh();

    // Verify refresh used the refresh_token grant
    const refreshCall = mockRequest.mock.calls[1][0];
    const refreshBody = new URLSearchParams(refreshCall.body);
    expect(refreshBody.get('grant_type')).toBe('refresh_token');
    expect(refreshBody.get('refresh_token')).toBe('rt_456');

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer at_refreshed' });
  });

  it('authorization_code grant with provided code', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_authcode', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      grant_type: 'authorization_code',
      code: 'auth_code_xyz',
      redirect_uri: 'http://localhost:3000/callback',
    });

    const callBody = new URLSearchParams(mockRequest.mock.calls[0][0].body);
    expect(callBody.get('grant_type')).toBe('authorization_code');
    expect(callBody.get('code')).toBe('auth_code_xyz');
    expect(callBody.get('redirect_uri')).toBe('http://localhost:3000/callback');

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer at_authcode' });
  });

  it('throws when token response has no access_token', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ error: 'invalid_client' }),
      headers: {},
    });

    await expect(
      provider.init({
        token_url: 'http://localhost:3000/oauth/token',
        client_id: 'my-client',
        client_secret: 'my-secret',
      })
    ).rejects.toThrow('OAuth2 token request failed');
  });

  it('isValid() returns false before init', async () => {
    expect(await provider.isValid()).toBe(false);
  });

  it('dispose() clears tokens', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_123', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
    });

    expect(await provider.isValid()).toBe(true);
    await provider.dispose();
    expect(await provider.isValid()).toBe(false);
  });

  it('getAuthContext() returns token and token_type', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_123', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
    });

    const context = await provider.getAuthContext();
    expect(context).toEqual({ token: 'at_123', token_type: 'Bearer' });
  });

  it('refresh without refresh_token re-requests with original grant', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_initial', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      grant_type: 'client_credentials',
    });

    // Refresh without stored refresh token should re-request
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_refreshed', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.refresh();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    const refreshCallBody = new URLSearchParams(mockRequest.mock.calls[1][0].body);
    expect(refreshCallBody.get('grant_type')).toBe('client_credentials');
  });

  it('includes scope when configured', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_123', token_type: 'Bearer' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      scope: 'read write',
    });

    const callBody = new URLSearchParams(mockRequest.mock.calls[0][0].body);
    expect(callBody.get('scope')).toBe('read write');
  });

  it('defaults token_type to Bearer when not in response', async () => {
    mockRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ access_token: 'at_123' }),
      headers: {},
    });

    await provider.init({
      token_url: 'http://localhost:3000/oauth/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
    });

    const headers = await provider.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer at_123' });
  });
});
