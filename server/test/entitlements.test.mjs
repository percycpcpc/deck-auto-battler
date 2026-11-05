import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { slotLimitFor } from '../src/slots.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.sql, this.values); }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.entitlements = new Map(); }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  async first(sql, values) {
    if (sql.startsWith('SELECT * FROM users WHERE provider =')) return [...this.users.values()].find(user => user.provider === values[0] && user.provider_id === values[1]) || null;
    if (sql.startsWith('SELECT * FROM users WHERE guest_token =')) return [...this.users.values()].find(user => user.guest_token === values[0]) || null;
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) {
      const session = this.sessions.get(values[0]);
      return session && session.expires_at > values[1] ? this.users.get(session.user_id) || null : null;
    }
    if (sql === 'SELECT user_id, sku, purchased_at FROM entitlements WHERE user_id = ?') return this.entitlements.get(values[0]) || null;
    if (sql === 'SELECT sku FROM entitlements WHERE user_id = ?') return this.entitlements.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async all(sql, values) {
    if (sql === 'SELECT sku, purchased_at FROM entitlements WHERE user_id = ?') {
      const row = this.entitlements.get(values[0]);
      return { results: row ? [{ sku: row.sku, purchased_at: row.purchased_at }] : [] };
    }
    throw new Error(`unexpected all: ${sql}`);
  }
  async run(sql, values) {
    if (sql.startsWith('INSERT INTO users (id, provider,')) {
      const [id, provider, provider_id, email, name, avatar_color, guest_token, created_at] = values;
      this.users.set(id, { id, provider, provider_id, email, name, avatar_color, guest_token, created_at });
      return { success: true };
    }
    if (sql.startsWith('UPDATE users SET provider =')) {
      const [provider, provider_id, email, name, avatar_color, id] = values;
      this.users.set(id, { ...this.users.get(id), provider, provider_id, email, name, avatar_color });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO sessions')) {
      const [token, user_id, created_at, expires_at] = values;
      this.sessions.set(token, { token, user_id, created_at, expires_at });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO entitlements')) {
      const [user_id, purchased_at] = values;
      const existing = this.entitlements.get(user_id);
      this.entitlements.set(user_id, {
        user_id, sku: 'premium', purchased_at: existing?.purchased_at ?? purchased_at,
      });
      return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const request = (db, path, { method = 'GET', token, devToken, body, env = {} } = {}) => worker.fetch(
  new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(devToken ? { 'x-dev-grant-token': devToken } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }),
  { DB: db, ...env },
  {},
);
const login = async (db, body = {}, headers = {}) => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/google', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), { DB: db }, {});
  return response.json();
};
const guestLogin = async (db, guestToken) => (await request(db, '/api/auth/guest', {
  method: 'POST', body: { guestToken },
})).json();

test('dev grant requires both a session and the configured token', async () => {
  const db = new FakeD1();
  assert.equal((await request(db, '/api/entitlement/dev-grant', { method: 'POST', devToken: 'secret', env: { DEV_GRANT_TOKEN: 'secret' } })).status, 401);
  const session = await login(db);
  assert.equal((await request(db, '/api/entitlement/dev-grant', { method: 'POST', token: session.token })).status, 403);
  assert.equal((await request(db, '/api/entitlement/dev-grant', { method: 'POST', token: session.token, devToken: 'wrong', env: { DEV_GRANT_TOKEN: 'secret' } })).status, 403);
});

test('correct dev grant creates premium once and preserves purchased_at', async () => {
  const db = new FakeD1(), session = await login(db);
  const grant = () => request(db, '/api/entitlement/dev-grant', {
    method: 'POST', token: session.token, devToken: 'secret', env: { DEV_GRANT_TOKEN: 'secret' },
  });
  const first = await grant();
  assert.equal(first.status, 200);
  const row = db.entitlements.get(session.user.id);
  assert.equal(row.sku, 'premium');
  const purchasedAt = row.purchased_at;
  const second = await grant();
  assert.equal(second.status, 200);
  assert.equal(db.entitlements.get(session.user.id).purchased_at, purchasedAt);
});

test('GET entitlement reports false before grant and true after grant', async () => {
  const db = new FakeD1(), session = await login(db);
  assert.deepEqual(await (await request(db, '/api/entitlement', { token: session.token })).json(), {
    premium: false, entitlements: [],
  });
  await request(db, '/api/entitlement/dev-grant', {
    method: 'POST', token: session.token, devToken: 'secret', env: { DEV_GRANT_TOKEN: 'secret' },
  });
  const result = await (await request(db, '/api/entitlement', { token: session.token })).json();
  assert.equal(result.premium, true);
  assert.equal(result.entitlements[0].sku, 'premium');
  assert.ok(result.entitlements[0].purchased_at);
});

test('premium survives session loss and guest-token account linking', async () => {
  const db = new FakeD1(), guestToken = crypto.randomUUID();
  const sessionA = await guestLogin(db, guestToken);
  await request(db, '/api/entitlement/dev-grant', {
    method: 'POST', token: sessionA.token, devToken: 'secret', env: { DEV_GRANT_TOKEN: 'secret' },
  });
  db.sessions.delete(sessionA.token);

  const sessionB = await guestLogin(db, guestToken);
  assert.equal(sessionB.user.id, sessionA.user.id);
  const linked = await login(db, {}, { 'x-guest-token': guestToken });
  assert.equal(linked.user.id, sessionA.user.id);
  const result = await (await request(db, '/api/entitlement', { token: linked.token })).json();
  assert.equal(result.premium, true);
});

test('B4 slot limit consumes the premium sku granted by B5', async () => {
  const db = new FakeD1(), session = await login(db);
  await request(db, '/api/entitlement/dev-grant', {
    method: 'POST', token: session.token, devToken: 'secret', env: { DEV_GRANT_TOKEN: 'secret' },
  });
  assert.equal(await slotLimitFor({ DB: db }, session.user), 4);
});
