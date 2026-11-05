import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { signStripePayload, verifyStripeSignature } from '../src/payments/stripe.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.sql, this.values); }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.entitlements = new Map(); this.grantWrites = 0; }
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
      if (!existing) this.grantWrites += 1;
      this.entitlements.set(user_id, { user_id, sku: 'premium', purchased_at: existing?.purchased_at ?? purchased_at });
      return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const request = (db, path, { method = 'GET', token, body, signature } = {}) => worker.fetch(
  new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(signature ? { 'stripe-signature': signature } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }),
  { DB: db },
  {},
);

const login = async db => {
  const response = await request(db, '/api/auth/google', { method: 'POST', body: {} });
  return response.json();
};

test('checkout requires a signed-in account', async () => {
  const response = await request(new FakeD1(), '/api/checkout', { method: 'POST' });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'sign in required before purchase' });
});

test('mock checkout return completes through webhook and grants premium', async () => {
  const db = new FakeD1();
  const session = await login(db);
  const checkoutResponse = await request(db, '/api/checkout', { method: 'POST', token: session.token });
  assert.equal(checkoutResponse.status, 200);
  const checkout = await checkoutResponse.json();
  const checkoutUrl = new URL(checkout.url);
  assert.equal(checkoutUrl.searchParams.get('purchase'), 'success');
  assert.equal(checkoutUrl.searchParams.get('mock_checkout'), '1');

  const sessionId = checkoutUrl.searchParams.get('sessionId');
  const webhook = await request(db, '/api/payments/webhook', { method: 'POST', body: { sessionId } });
  assert.equal(webhook.status, 200);
  const entitlement = await request(db, '/api/entitlement', { token: session.token });
  assert.deepEqual(await entitlement.json(), {
    premium: true,
    entitlements: [{ sku: 'premium', purchased_at: db.entitlements.get(session.user.id).purchased_at }],
  });
});

test('Stripe signature verification accepts valid input and rejects tampering, expiry, and wrong secret', async () => {
  const secret = 'whsec_test';
  const timestamp = 2_000_000_000;
  const now = timestamp * 1000;
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const digest = await signStripePayload(secret, timestamp, payload);
  const signature = `t=${timestamp},v1=${digest}`;

  await assert.doesNotReject(verifyStripeSignature({ payload, signature, secret, now }));
  await assert.rejects(verifyStripeSignature({ payload: `${payload} `, signature, secret, now }), /invalid/);
  await assert.rejects(verifyStripeSignature({ payload, signature, secret, now: now + 301_000 }), /expired/);
  await assert.rejects(verifyStripeSignature({ payload, signature, secret: 'wrong', now }), /invalid/);
});

test('replayed mock webhook preserves the first purchase and grants once', async () => {
  const db = new FakeD1();
  const session = await login(db);
  const checkout = await (await request(db, '/api/checkout', { method: 'POST', token: session.token })).json();
  const body = { sessionId: new URL(checkout.url).searchParams.get('sessionId') };
  assert.equal((await request(db, '/api/payments/webhook', { method: 'POST', body })).status, 200);
  const purchasedAt = db.entitlements.get(session.user.id).purchased_at;
  assert.equal((await request(db, '/api/payments/webhook', { method: 'POST', body })).status, 200);
  assert.equal(db.entitlements.get(session.user.id).purchased_at, purchasedAt);
  assert.equal(db.grantWrites, 1);
});
