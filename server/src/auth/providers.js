import { mockProvider } from './mock.js';

/**
 * Auth provider contract: `resolve(payload)` verifies provider credentials and returns
 * `{ provider, providerId, email, name }`. A future Google implementation must verify
 * a Google ID token server-side, then return exactly that normalized shape.
 */
export function getProvider(env = {}) {
  const name = env.AUTH_PROVIDER || 'mock';
  if (name === 'mock') return mockProvider;
  throw new Error(`unsupported auth provider: ${name}`);
}
