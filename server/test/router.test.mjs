import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { createRouter, json } from '../src/router.js';

const fakeEnv = ({ fail = false } = {}) => ({
  DB: {
    prepare(sql) {
      assert.equal(sql, 'SELECT 1');
      return {
        async all() {
          if (fail) throw new Error('database unavailable');
          return { results: [] };
        },
      };
    },
  },
});

test('matches a method and pathname pattern', async () => {
  const router = createRouter();
  router.route('GET', '/items/:id', ({ params }) => json({ id: params.id }));

  const response = await router.handle(new Request('https://example.test/items/deck%201'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'deck 1' });
});

test('returns the JSON 404 envelope for an unknown route', async () => {
  const router = createRouter();
  const response = await router.handle(new Request('https://example.test/missing'));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not found' });
});

test('health checks the D1 binding', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/health'),
    fakeEnv(),
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'deck-auto-battler-api',
    db: 'up',
  });
});

test('health reports a failed D1 probe without failing the endpoint', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/health'),
    fakeEnv({ fail: true }),
    {},
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).db, 'down');
});

for (const path of [
  '/api/sim',
  '/api/replays',
]) {
  test(`POST ${path} is an explicit B2–C3 stub`, async () => {
    const response = await worker.fetch(
      new Request(`https://example.test${path}`, { method: 'POST' }),
      fakeEnv(),
      {},
    );

    assert.equal(response.status, 501);
    assert.deepEqual(await response.json(), { error: 'not implemented — lands in B2–C3' });
  });
}

test('checkout stub rejects requests without a bearer session', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/checkout', { method: 'POST' }),
    fakeEnv(),
    {},
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
});

test('deck routes require a bearer session', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/decks'), fakeEnv(), {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
});

test('API preflight returns CORS headers', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/google', { method: 'OPTIONS' }), fakeEnv(), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-headers'), /x-guest-token/);
});
