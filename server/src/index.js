import { createRouter, json } from './router.js';

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
  '/api/auth/google',
  '/api/entitlement',
  '/api/sim',
  '/api/replays',
]) {
  router.route('POST', path, notImplemented);
}

export default {
  fetch(request, env, context) {
    return router.handle(request, env, context);
  },
};
