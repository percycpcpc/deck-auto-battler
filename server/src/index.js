import { createRouter, json, readJson } from './router.js';
import { getProvider } from './auth/providers.js';
import { createGuestLogin, createLogin, readSession } from './auth/service.js';

export const router = createRouter();

router.route('GET', '/api/health', async ({ env }) => {
  let db = 'down';
  try {
    await env.DB.prepare('SELECT 1').all();
    db = 'up';
  } catch {
    // Health remains reachable so a missing or unhealthy binding is observable.
  }

  return json({ ok: true, service: 'deck-auto-battler-api', db });
});

const notImplemented = () => json(
  { error: 'not implemented — lands in B2–C3' },
  { status: 501 },
);

for (const path of [
  '/api/decks',
  '/api/entitlement',
  '/api/sim',
  '/api/replays',
]) {
  router.route('POST', path, notImplemented);
}

router.route('POST', '/api/auth/google', async ({ request, env }) => {
  const payload = await readJson(request);
  const identity = await getProvider(env).resolve(payload);
  return json(await createLogin(env, identity, request.headers.get('x-guest-token')));
});

router.route('POST', '/api/auth/guest', async ({ request, env }) => {
  const { guestToken } = await readJson(request);
  return json(await createGuestLogin(env, guestToken));
});

router.route('GET', '/api/auth/session', async ({ request, env }) => {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  const user = match && await readSession(env, match[1]);
  return user ? json({ user }) : json({ error: 'unauthorized' }, { status: 401 });
});

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-guest-token',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const withCors = response => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      return withCors(new Response(null, { status: 204 }));
    }
    const response = await router.handle(request, env, context);
    return pathname.startsWith('/api/') ? withCors(response) : response;
  },
};
