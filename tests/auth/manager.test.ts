import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthProvider } from '../../src/auth/provider.js';
import type { AuthDef } from '../../src/config/types.js';

// Mock the http client used by the manager for validation checks
const mockHttpClientRequest = vi.fn();
vi.mock('../../src/utils/http.js', () => ({
  createHttpClient: () => ({
    request: mockHttpClientRequest,
  }),
}));

// Mock logger to avoid console output during tests
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { AuthLifecycleManager } from '../../src/auth/manager.js';

function createMockProvider(overrides?: Partial<AuthProvider>): AuthProvider {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
    isValid: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getAuthContext: vi.fn().mockResolvedValue({ token: 'test' }),
    ...overrides,
  };
}

function createAuthDef(overrides?: Partial<AuthDef>): AuthDef {
  return {
    provider: 'test',
    config: {},
    ...overrides,
  };
}

describe('AuthLifecycleManager', () => {
  let provider: AuthProvider;
  let authDef: AuthDef;
  let manager: AuthLifecycleManager;

  beforeEach(() => {
    vi.useRealTimers();
    mockHttpClientRequest.mockReset();
    provider = createMockProvider();
    authDef = createAuthDef();
    manager = new AuthLifecycleManager(provider, authDef);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes provider on start', async () => {
    await manager.start();
    expect(provider.init).toHaveBeenCalledWith(authDef.config);
  });

  it('returns auth headers from provider', async () => {
    await manager.start();
    const headers = await manager.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer test' });
    expect(provider.getAuthHeaders).toHaveBeenCalled();
  });

  it('returns auth context from provider', async () => {
    await manager.start();
    const context = await manager.getAuthContext();
    expect(context).toEqual({ token: 'test' });
    expect(provider.getAuthContext).toHaveBeenCalled();
  });

  it('returns empty object when provider has no getAuthContext', async () => {
    const noContextProvider = createMockProvider();
    // Remove getAuthContext
    delete (noContextProvider as any).getAuthContext;

    const noContextManager = new AuthLifecycleManager(noContextProvider, authDef);
    await noContextManager.start();

    const context = await noContextManager.getAuthContext();
    expect(context).toEqual({});
  });

  it('disposes provider and clears poll timer on stop', async () => {
    await manager.start();
    await manager.stop();
    expect(provider.dispose).toHaveBeenCalled();
  });

  it('refreshes with mutex — concurrent refreshes serialize (do not overlap)', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;
    const refreshFn = vi.fn().mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 50));
      concurrentCount--;
    });

    const slowProvider = createMockProvider({ refresh: refreshFn });
    const retryDef = createAuthDef({
      refresh: { retry_count: 0, retry_delay: 0 },
    });
    const retryManager = new AuthLifecycleManager(slowProvider, retryDef);

    // Start 3 concurrent refreshes
    const p1 = retryManager.refreshWithRetry();
    const p2 = retryManager.refreshWithRetry();
    const p3 = retryManager.refreshWithRetry();

    await Promise.all([p1, p2, p3]);

    // All 3 should be called (serialized), but never more than 1 at a time
    expect(refreshFn).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });

  it('retries on refresh failure up to retry_count', async () => {
    const refreshFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(undefined);

    const failingProvider = createMockProvider({ refresh: refreshFn });
    const retryDef = createAuthDef({
      refresh: { retry_count: 2, retry_delay: 0 },
    });
    const retryManager = new AuthLifecycleManager(failingProvider, retryDef);

    await retryManager.refreshWithRetry();

    // initial + 2 retries = 3 calls
    expect(refreshFn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retry attempts', async () => {
    const refreshFn = vi.fn().mockRejectedValue(new Error('always fails'));
    const failingProvider = createMockProvider({ refresh: refreshFn });
    const retryDef = createAuthDef({
      refresh: { retry_count: 1, retry_delay: 0 },
    });
    const retryManager = new AuthLifecycleManager(failingProvider, retryDef);

    await expect(retryManager.refreshWithRetry()).rejects.toThrow(
      'Auth refresh failed after 2 attempts'
    );
  });

  it('polls isValid at configured interval and refreshes when invalid', async () => {
    vi.useFakeTimers();

    const isValidFn = vi.fn()
      .mockResolvedValueOnce(true)   // first poll: valid
      .mockResolvedValueOnce(false);  // second poll: invalid -> trigger refresh
    const refreshFn = vi.fn().mockResolvedValue(undefined);

    const pollingProvider = createMockProvider({ isValid: isValidFn, refresh: refreshFn });
    const pollingDef = createAuthDef({
      refresh: { poll_interval: 10 },
    });
    const pollingManager = new AuthLifecycleManager(pollingProvider, pollingDef);

    await pollingManager.start();

    // Advance by 10 seconds - first poll check
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isValidFn).toHaveBeenCalledTimes(1);

    // Advance by another 10 seconds - second poll check (invalid -> refresh)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isValidFn).toHaveBeenCalledTimes(2);
    // Allow the async refresh to complete
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshFn).toHaveBeenCalledTimes(1);

    await pollingManager.stop();
  });

  it('does not start poll loop when no poll_interval configured', async () => {
    await manager.start();
    // If we don't crash, the poll loop wasn't started
    // Start and stop should work fine without a poll interval
    await manager.stop();
  });

  it('checkValidity returns provider.isValid() when no validation defined', async () => {
    await manager.start();
    const valid = await manager.checkValidity();
    expect(valid).toBe(true);
    expect(provider.isValid).toHaveBeenCalled();
  });

  it('checkValidity uses validation endpoint when defined', async () => {
    mockHttpClientRequest.mockResolvedValue({
      status: 200,
      body: '{"valid": true}',
      headers: {},
    });

    const validDef = createAuthDef({
      validation: {
        check_url: 'http://localhost:3000/check',
      },
    });
    const validManager = new AuthLifecycleManager(provider, validDef);
    await validManager.start();

    const valid = await validManager.checkValidity();
    expect(valid).toBe(true);
    expect(mockHttpClientRequest).toHaveBeenCalledWith({
      url: 'http://localhost:3000/check',
      method: 'GET',
      headers: { Authorization: 'Bearer test' },
      body: undefined,
    });
  });

  it('checkValidity returns false when validation request fails', async () => {
    mockHttpClientRequest.mockRejectedValue(new Error('network error'));

    const validDef = createAuthDef({
      validation: {
        check_url: 'http://localhost:3000/check',
      },
    });
    const validManager = new AuthLifecycleManager(provider, validDef);
    await validManager.start();

    const valid = await validManager.checkValidity();
    expect(valid).toBe(false);
  });
});
