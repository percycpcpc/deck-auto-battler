import { createRouter, json, readJson } from './router.js';
import { getProvider } from './auth/providers.js';
import { createGuestLogin, createLogin, readSession } from './auth/service.js';
import { DeckError, createDeck, getDeck, getDeckById, listDecks } from './decks.js';
import { getEntitlements, grantPremium, isPremium } from './entitlements.js';
import { SlotError, listSlots, saveDeckToSlot } from './slots.js';
import { getPaymentProvider } from './payments/provider.js';
import { simulateDeckBattle } from './sim.js';

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

router.route('POST', '/api/replays', notImplemented);

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

router.route('POST', '/api/checkout', async ({ request, env }) => {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'sign in required before purchase' }, { status: 401 });
  const origin = request.headers.get('origin') || new URL(request.url).origin;
  const provider = getPaymentProvider(env);
  const checkout = await provider.createCheckoutSession({
    user,
    successUrl: `${origin}/?purchase=success`,
    cancelUrl: `${origin}/?purchase=cancel`,
  });
  return json({ url: checkout.url });
});

router.route('POST', '/api/payments/webhook', async ({ request, env }) => {
  try {
    const provider = getPaymentProvider(env);
    const event = await provider.handleWebhook({
      payload: await request.text(),
      signature: request.headers.get('stripe-signature'),
    });
    if (event.type === 'checkout.session.completed') {
      await grantPremium(env, event.userId, 'stripe-checkout');
    }
    return json({ received: true });
  } catch {
    return json({ error: 'invalid webhook' }, { status: 400 });
  }
});

router.route('POST', '/api/decks', deckRoute(async ({ request, env, user }) => {
  const payload = await readJson(request);
  return createDeck(env, { user, ...payload });
}));
router.route('GET', '/api/decks', deckRoute(({ env, user }) => listDecks(env, user)));
router.route('GET', '/api/decks/:id', deckRoute(({ env, user, params }) => getDeck(env, user, params.id)));
router.route('POST', '/api/sim', sessionRoute(async ({ request, env }) => {
  const { deckAId, deckBId, seed } = await readJson(request);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return json({ error: 'seed must be a uint32 number' }, { status: 400 });
  }
  try {
    const [deckA, deckB] = await Promise.all([
      getDeckById(env, deckAId),
      getDeckById(env, deckBId),
    ]);
    const result = simulateDeckBattle({ cardIdsA: deckA.cardIds, cardIdsB: deckB.cardIds, seed });
    const replay = {
      id: crypto.randomUUID(),
      deck_a: deckA.id,
      deck_b: deckB.id,
      seed,
      result: JSON.stringify({ winner: result.winner, rounds: result.rounds }),
      created_at: new Date().toISOString(),
    };
    await env.DB.prepare(
      'INSERT INTO replays (id, deck_a, deck_b, seed, result, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(replay.id, replay.deck_a, replay.deck_b, replay.seed, replay.result, replay.created_at).run();
    return json({ replayId: replay.id, ...result });
  } catch (caught) {
    if (caught instanceof DeckError) return json({ error: caught.message }, { status: caught.status });
    throw caught;
  }
}));
router.route('GET', '/api/replays/:id', async ({ env, params }) => {
  const replay = await env.DB.prepare('SELECT * FROM replays WHERE id = ?').bind(params.id).first();
  if (!replay) return json({ error: 'replay not found' }, { status: 404 });
  try {
    const [deckA, deckB] = await Promise.all([
      getDeckById(env, replay.deck_a),
      getDeckById(env, replay.deck_b),
    ]);
    const seed = Number(replay.seed);
    const simulation = simulateDeckBattle({ cardIdsA: deckA.cardIds, cardIdsB: deckB.cardIds, seed });
    return json({
      id: replay.id,
      deckAId: replay.deck_a,
      deckBId: replay.deck_b,
      seed,
      result: JSON.parse(replay.result),
      createdAt: replay.created_at,
      cardIdsA: deckA.cardIds,
      cardIdsB: deckB.cardIds,
      events: simulation.events,
    });
  } catch (caught) {
    if (caught instanceof DeckError) return json({ error: caught.message }, { status: caught.status });
    throw caught;
  }
});
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
