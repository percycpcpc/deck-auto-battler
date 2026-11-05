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
  constructor() { this.users = new Map(); this.sessions = new Map(); this.decks = new Map(); }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  async first(sql, values) {
    if (sql.startsWith('SELECT * FROM users WHERE provider =')) {
      return [...this.users.values()].find(user => user.provider === values[0] && user.provider_id === values[1]) || null;
    }
    if (sql.startsWith('SELECT * FROM users WHERE guest_token =')) {
      return [...this.users.values()].find(user => user.guest_token === values[0]) || null;
    }
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) {
      const session = this.sessions.get(values[0]);
      return session && session.expires_at > values[1] ? this.users.get(session.user_id) || null : null;
    }
    if (sql === 'SELECT * FROM decks WHERE id = ?') return this.decks.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async all(sql, values) {
    if (sql === 'SELECT * FROM decks WHERE owner_id = ? ORDER BY created_at DESC') {
      return { results: [...this.decks.values()].filter(deck => deck.owner_id === values[0]).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
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
      this.sessions.set(token, { token, user_id, created_at, expires_at });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO decks')) {
      const [id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at] = values;
      this.decks.set(id, { id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at });
      return { success: true };
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
const create = (db, token, body = snapshot) => request(db, '/api/decks', { method: 'POST', token, body });

test('creates and retrieves a snapshot with card order intact', async () => {
  const db = new FakeD1(), session = await login(db, 'A');
  const response = await create(db, session.token);
  assert.equal(response.status, 200);
  const created = await response.json();
  assert.match(created.id, /^[0-9a-f-]{36}$/i);

  const fetched = await request(db, `/api/decks/${created.id}`, { token: session.token });
  assert.equal(fetched.status, 200);
  assert.deepEqual((await fetched.json()).cardIds, snapshot.cardIds);
});

test('rejects unknown cards and malformed or out-of-bounds card lists', async () => {
  const db = new FakeD1(), { token } = await login(db, 'A');
  for (const cardIds of [
    [...snapshot.cardIds.slice(0, 7), 'tampered_card'],
    'dagger_imp',
    snapshot.cardIds.slice(0, 7),
    Array(41).fill('dagger_imp'),
  ]) {
    const response = await create(db, token, { ...snapshot, cardIds });
    assert.equal(response.status, 400);
  }
  assert.equal(db.decks.size, 0);
});

test('requires a valid session', async () => {
  const response = await create(new FakeD1(), null);
  assert.equal(response.status, 401);
});

test('enforces ownership and lists only the caller decks newest first', async () => {
  const db = new FakeD1(), a = await login(db, 'A'), b = await login(db, 'B');
  const older = await (await create(db, a.token)).json();
  db.decks.get(older.id).created_at = '2026-01-01T00:00:00.000Z';
  const newest = await (await create(db, a.token, { ...snapshot, won: true, levelReached: 20, hpLeft: 3 })).json();
  const foreign = await (await create(db, b.token)).json();

  const forbidden = await request(db, `/api/decks/${foreign.id}`, { token: a.token });
  assert.equal(forbidden.status, 403);
  const listed = await (await request(db, '/api/decks', { token: a.token })).json();
  assert.deepEqual(listed.map(deck => deck.id), [newest.id, older.id]);
  assert.ok(listed.every(deck => deck.ownerId === a.user.id));
});
