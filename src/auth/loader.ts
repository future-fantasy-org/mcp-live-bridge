import { existsSync } from 'node:fs';
import type { AuthProvider } from './provider.js';
import { FormAuthProvider } from './form.js';
import { OAuth2AuthProvider } from './oauth2.js';

const BUILTINS: Record<string, () => AuthProvider> = {
  form: () => new FormAuthProvider(),
  oauth2: () => new OAuth2AuthProvider(),
};

export function loadAuthProvider(providerNameOrPath: string): AuthProvider {
  if (BUILTINS[providerNameOrPath]) {
    return BUILTINS[providerNameOrPath]();
  }
  if (!existsSync(providerNameOrPath)) {
    throw new Error(`Auth provider file not found: ${providerNameOrPath}`);
  }
  throw new Error(`Custom auth provider loading requires async initialization. Use loadAuthProviderAsync instead.`);
}

export async function loadAuthProviderAsync(providerNameOrPath: string): Promise<AuthProvider> {
  if (BUILTINS[providerNameOrPath]) {
    return BUILTINS[providerNameOrPath]();
  }
  if (!existsSync(providerNameOrPath)) {
    throw new Error(`Auth provider file not found: ${providerNameOrPath}`);
  }
  const mod = await import(providerNameOrPath);
  const ProviderClass = mod.default;
  if (typeof ProviderClass !== 'function' || !ProviderClass.prototype) {
    throw new Error(`Auth provider file ${providerNameOrPath} must have a default export that is a class`);
  }
  const requiredMethods = ['init', 'getAuthHeaders', 'isValid', 'refresh', 'dispose'];
  for (const method of requiredMethods) {
    if (typeof ProviderClass.prototype[method] !== 'function') {
      throw new Error(`Auth provider class from ${providerNameOrPath} is missing required method: ${method}`);
    }
  }
  return new ProviderClass();
}
