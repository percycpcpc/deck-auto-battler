const MOCK_ID = /^mock-user-[0-9a-f-]{36}$/i;

/** Resolve a mock login payload to the same normalized identity shape as a real provider. */
export async function resolveMockIdentity(payload = {}) {
  const providerId = MOCK_ID.test(payload.providerId || '')
    ? payload.providerId
    : `mock-user-${crypto.randomUUID()}`;
  return {
    provider: 'mock',
    providerId,
    email: `${providerId}@mock.local`,
    name: typeof payload.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim().slice(0, 80)
      : 'Mock Warrior',
  };
}

export const mockProvider = Object.freeze({ resolve: resolveMockIdentity });
