import { createRouter, json, readJson } from './router.js';
import { getProvider } from './auth/providers.js';
import { createGuestLogin, createLogin, readSession } from './auth/service.js';
import { DeckError, createDeck, getDeck, listDecks } from './decks.js';
import { getEntitlements, grantPremium, isPremium } from './entitlements.js';
import { SlotError, listSlots, saveDeckToSlot } from './slots.js';

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
  '/api/sim',
  '/api/replays',
]) {
  router.route('POST', path, notImplemented);
}

const sessionUser = async (request, env) => {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  return match && readSession(env, match[1]);
};

const deckRoute = handler => async context => {
  const user = await sessionUser(context.request, context.env);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  try {
    return json(await handler({ ...context, user }));
  } catch (caught) {
    if (caught instanceof DeckError) return json({ error: caught.message }, { status: caught.status });
    throw caught;
  }
};

const slotRoute = handler => async context => {
  const user = await sessionUser(context.request, context.env);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  try {
    return json(await handler({ ...context, user }));
  } catch (caught) {
    if (caught instanceof DeckError || caught instanceof SlotError) {
      return json({ error: caught.message }, { status: caught.status });
    }
    throw caught;
  }
};

const sessionRoute = handler => async context => {
  const user = await sessionUser(context.request, context.env);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  return handler({ ...context, user });
};

router.route('GET', '/api/entitlement', sessionRoute(async ({ env, user }) => {
  const entitlements = await getEntitlements(env, user.id);
  return json({ premium: isPremium(entitlements), entitlements });
}));

// Test-only hook; B6 payment webhook replaces it; never set
// DEV_GRANT_TOKEN in production.
router.route('POST', '/api/entitlement/dev-grant', sessionRoute(async ({ request, env, user }) => {
  if (!env.DEV_GRANT_TOKEN || request.headers.get('x-dev-grant-token') !== env.DEV_GRANT_TOKEN) {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  const entitlement = await grantPremium(env, user.id, 'dev-grant');
  return json({ premium: true, entitlement });
}));

// B6 replaces this stub. The session wrapper is the login-gated checkout
// contract: no purchase handler may run without a resolved Bearer session.
router.route('POST', '/api/checkout', sessionRoute(() => notImplemented()));

router.route('POST', '/api/decks', deckRoute(async ({ request, env, user }) => {
  const payload = await readJson(request);
  return createDeck(env, { user, ...payload });
}));
router.route('GET', '/api/decks', deckRoute(({ env, user }) => listDecks(env, user)));
router.route('GET', '/api/decks/:id', deckRoute(({ env, user, params }) => getDeck(env, user, params.id)));
router.route('GET', '/api/slots', slotRoute(({ env, user }) => listSlots(env, user)));
router.route('POST', '/api/slots/:slot/deck', slotRoute(async ({ request, env, user, params }) => {
  const { deckId } = await readJson(request);
  return saveDeckToSlot(env, user, Number(params.slot), deckId);
}));

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
  const user = await sessionUser(request, env);
  return user ? json({ user }) : json({ error: 'unauthorized' }, { status: 401 });
});

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-guest-token, x-dev-grant-token',
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
