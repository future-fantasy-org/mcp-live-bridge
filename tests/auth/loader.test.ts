import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAuthProvider, loadAuthProviderAsync } from '../../src/auth/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '__fixtures__');

function fixturePath(name: string): string {
  return join(FIXTURE_DIR, `${name}.mjs`);
}

describe('AuthProvider loader', () => {
  beforeEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(FIXTURE_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('loadAuthProvider (sync)', () => {
    it('loads built-in form provider', () => {
      const provider = loadAuthProvider('form');
      expect(provider).toBeDefined();
      expect(typeof provider.init).toBe('function');
      expect(typeof provider.getAuthHeaders).toBe('function');
      expect(typeof provider.isValid).toBe('function');
      expect(typeof provider.refresh).toBe('function');
      expect(typeof provider.dispose).toBe('function');
    });

    it('loads built-in oauth2 provider', () => {
      const provider = loadAuthProvider('oauth2');
      expect(provider).toBeDefined();
      expect(typeof provider.init).toBe('function');
      expect(typeof provider.getAuthHeaders).toBe('function');
    });

    it('throws for unknown built-in name', () => {
      expect(() => loadAuthProvider('unknown_provider')).toThrow('Auth provider file not found');
    });

    it('throws for missing file path', () => {
      expect(() => loadAuthProvider('/nonexistent/path/provider.mjs')).toThrow(
        'Auth provider file not found: /nonexistent/path/provider.mjs'
      );
    });

    it('throws for custom file path suggesting async loader', () => {
      writeFileSync(fixturePath('sync-custom'), 'export default class {}');

      expect(() => loadAuthProvider(fixturePath('sync-custom'))).toThrow(
        'Custom auth provider loading requires async initialization. Use loadAuthProviderAsync instead.'
      );
    });
  });

  describe('loadAuthProviderAsync (async)', () => {
    it('loads built-in form provider asynchronously', async () => {
      const provider = await loadAuthProviderAsync('form');
      expect(provider).toBeDefined();
      expect(typeof provider.init).toBe('function');
    });

    it('loads built-in oauth2 provider asynchronously', async () => {
      const provider = await loadAuthProviderAsync('oauth2');
      expect(provider).toBeDefined();
    });

    it('throws for missing file path', async () => {
      await expect(loadAuthProviderAsync('/nonexistent/path/provider.mjs')).rejects.toThrow(
        'Auth provider file not found'
      );
    });

    it('loads custom provider from JS file', async () => {
      writeFileSync(fixturePath('valid-provider'), `
        export default class CustomProvider {
          async init(config) {}
          async getAuthHeaders() { return {}; }
          async isValid() { return true; }
          async refresh() {}
          async dispose() {}
        }
      `);

      const provider = await loadAuthProviderAsync(fixturePath('valid-provider'));
      expect(provider).toBeDefined();
      expect(typeof provider.init).toBe('function');
      expect(typeof provider.getAuthHeaders).toBe('function');
      expect(typeof provider.isValid).toBe('function');
      expect(typeof provider.refresh).toBe('function');
      expect(typeof provider.dispose).toBe('function');
    });

    it('throws when custom file has no default export class', async () => {
      writeFileSync(fixturePath('no-default'), 'export const something = 42;');

      await expect(loadAuthProviderAsync(fixturePath('no-default'))).rejects.toThrow(
        'must have a default export that is a class'
      );
    });

    it('throws when custom file has default export that is not a class', async () => {
      // Anonymous functions in ESM still have .prototype, so they pass
      // the "is a class" check but fail the required methods check.
      writeFileSync(fixturePath('not-class'), 'export default function() {}');

      await expect(loadAuthProviderAsync(fixturePath('not-class'))).rejects.toThrow(
        /missing required method|must have a default export/
      );
    });

    it('throws when custom provider class is missing required methods', async () => {
      writeFileSync(fixturePath('incomplete'), `
        export default class IncompleteProvider {
          async init(config) {}
          async getAuthHeaders() { return {}; }
          // missing isValid, refresh, dispose
        }
      `);

      await expect(loadAuthProviderAsync(fixturePath('incomplete'))).rejects.toThrow(
        'missing required method: isValid'
      );
    });
  });
});
