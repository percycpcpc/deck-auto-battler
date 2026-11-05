import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.sql, this.values); }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() {
    this.users = new Map(); this.sessions = new Map(); this.decks = new Map();
    this.entitlements = new Map(); this.slots = new Map();
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  async first(sql, values) {
    if (sql.startsWith('SELECT * FROM users WHERE provider =')) return [...this.users.values()].find(user => user.provider === values[0] && user.provider_id === values[1]) || null;
    if (sql.startsWith('SELECT * FROM users WHERE guest_token =')) return [...this.users.values()].find(user => user.guest_token === values[0]) || null;
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) {
      const session = this.sessions.get(values[0]);
      return session && session.expires_at > values[1] ? this.users.get(session.user_id) || null : null;
    }
    if (sql === 'SELECT * FROM decks WHERE id = ?') return this.decks.get(values[0]) || null;
    if (sql === 'SELECT sku FROM entitlements WHERE user_id = ?') return this.entitlements.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async all(sql, values) {
    if (sql.startsWith('SELECT save_slots.slot,')) {
      const results = [...this.slots.values()]
        .filter(slot => slot.owner_id === values[0] && this.decks.has(slot.deck_id))
        .sort((a, b) => a.slot - b.slot || b.updated_at.localeCompare(a.updated_at))
        .map(slot => ({ ...this.decks.get(slot.deck_id), slot: slot.slot, updated_at: slot.updated_at }));
      return { results };
    }
    throw new Error(`unexpected all: ${sql}`);
  }
  async run(sql, values) {
    if (sql.startsWith('INSERT INTO users (id, provider,')) {
      const [id, provider, provider_id, email, name, avatar_color, guest_token, created_at] = values;
      this.users.set(id, { id, provider, provider_id, email, name, avatar_color, guest_token, created_at });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO sessions')) {
      const [token, user_id, created_at, expires_at] = values;
      this.sessions.set(token, { token, user_id, created_at, expires_at }); return { success: true };
    }
    if (sql.startsWith('INSERT INTO decks')) {
      const [id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at] = values;
      this.decks.set(id, { id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at }); return { success: true };
    }
    if (sql.startsWith('INSERT INTO save_slots')) {
      const [owner_id, slot, deck_id, updated_at] = values;
      this.slots.set(`${owner_id}:${slot}`, { owner_id, slot, deck_id, updated_at }); return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const snapshot = {
  cardIds: ['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre'],
  starterId: 'oathbound_line', won: false, levelReached: 7, hpLeft: -2,
};
const request = (db, path, { method = 'GET', token, body } = {}) => worker.fetch(new Request(`https://example.test${path}`, {
  method,
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), { DB: db }, {});
const login = async (db, name) => (await (await request(db, '/api/auth/google', { method: 'POST', body: { providerId: crypto.randomUUID(), displayName: name } })).json());
const create = async (db, token, changes = {}) => (await (await request(db, '/api/decks', { method: 'POST', token, body: { ...snapshot, ...changes } })).json());
const save = (db, token, slot, deckId) => request(db, `/api/slots/${slot}/deck`, { method: 'POST', token, body: { deckId } });

test('free user gets one empty slot and can overwrite it without a server confirmation', async () => {
  const db = new FakeD1(), session = await login(db, 'Free');
  assert.deepEqual(await (await request(db, '/api/slots', { token: session.token })).json(), { limit: 1, slots: [null] });
  const first = await create(db, session.token), second = await create(db, session.token, { levelReached: 8 });
  assert.equal((await save(db, session.token, 0, first.id)).status, 200);
  assert.equal((await save(db, session.token, 0, second.id)).status, 200);
  const listed = await (await request(db, '/api/slots', { token: session.token })).json();
  assert.equal(listed.slots[0].deck.id, second.id);
});

test('free user cannot save outside the entitlement-driven limit', async () => {
  const db = new FakeD1(), session = await login(db, 'Free'), deck = await create(db, session.token);
  assert.equal((await (await request(db, '/api/slots', { token: session.token })).json()).limit, 1);
  const response = await save(db, session.token, 1, deck.id);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'slot out of range for your tier' });
});

test('premium entitlement permits exactly four slots', async () => {
  const db = new FakeD1(), session = await login(db, 'Premium');
  db.entitlements.set(session.user.id, { user_id: session.user.id, sku: 'premium' });
  const deck = await create(db, session.token);
  assert.equal((await (await request(db, '/api/slots', { token: session.token })).json()).limit, 4);
  for (let slot = 0; slot < 4; slot += 1) assert.equal((await save(db, session.token, slot, deck.id)).status, 200);
  assert.equal((await save(db, session.token, 4, deck.id)).status, 403);
});

test('save enforces deck existence, ownership, and session', async () => {
  const db = new FakeD1(), a = await login(db, 'A'), b = await login(db, 'B'), foreign = await create(db, b.token);
  assert.equal((await save(db, a.token, 0, foreign.id)).status, 403);
  assert.equal((await save(db, a.token, 0, crypto.randomUUID())).status, 404);
  assert.equal((await save(db, null, 0, foreign.id)).status, 401);
  assert.equal((await request(db, '/api/slots')).status, 401);
});

test('GET returns only the caller slots in index order with full joined decks', async () => {
  const db = new FakeD1(), a = await login(db, 'A'), b = await login(db, 'B');
  db.entitlements.set(a.user.id, { user_id: a.user.id, sku: 'premium' });
  db.entitlements.set(b.user.id, { user_id: b.user.id, sku: 'premium' });
  const a0 = await create(db, a.token), a2 = await create(db, a.token, { won: true, levelReached: 20, hpLeft: 4 });
  const foreign = await create(db, b.token);
  await save(db, a.token, 2, a2.id); await save(db, a.token, 0, a0.id); await save(db, b.token, 1, foreign.id);
  const result = await (await request(db, '/api/slots', { token: a.token })).json();
  assert.equal(result.limit, 4);
  assert.deepEqual(result.slots.map(entry => entry?.slot ?? null), [0, null, 2, null]);
  assert.deepEqual(result.slots[0].deck.cardIds, snapshot.cardIds);
  assert.equal(result.slots[2].deck.won, true);
  assert.ok(result.slots.every(entry => !entry || entry.deck.ownerId === a.user.id));
});
