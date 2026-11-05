import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { chunkedInsert } from '../src/db.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.sql, this.values); }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return { results: [] }; }
}

class FakeD1 {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.insertSizes = []; }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) {
    const users = new Map(this.users), sessions = new Map(this.sessions);
    try { return await Promise.all(statements.map(statement => statement.run())); }
    catch (error) { this.users = users; this.sessions = sessions; throw error; }
  }
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
    throw new Error(`unexpected first: ${sql}`);
  }
  async run(sql, values) {
    if (sql.startsWith('INSERT INTO users (id, provider,')) {
      const [id, provider, provider_id, email, name, avatar_color, guest_token, created_at] = values;
      if ([...this.users.values()].some(user => (user.provider === provider && user.provider_id === provider_id) || (guest_token && user.guest_token === guest_token))) throw new Error('unique constraint');
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
    if (sql.startsWith('INSERT INTO bulk_rows')) {
      this.insertSizes.push((sql.match(/\(/g)?.length || 1) - 1);
      return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const post = (path, body, db, headers = {}) => worker.fetch(new Request(`https://example.test${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}), { DB: db }, {});

test('mock login creates a user and session, then reuses a stable provider id', async () => {
  const db = new FakeD1();
  const first = await post('/api/auth/google', { displayName: 'Ada' }, db);
  assert.equal(first.status, 200);
  const created = await first.json();
  assert.match(created.token, /^[0-9a-f-]{36}$/i);
  assert.equal(created.user.name, 'Ada');
  assert.equal(db.users.size, 1);
  assert.equal(db.sessions.size, 1);

  const repeat = await post('/api/auth/google', { providerId: created.user.providerId }, db);
  const repeated = await repeat.json();
  assert.equal(repeated.user.id, created.user.id);
  assert.equal(db.users.size, 1);
  assert.equal(db.sessions.size, 2);
});

test('guest token is linked to the mock user without changing its user id', async () => {
  const db = new FakeD1();
  const guestToken = crypto.randomUUID();
  const guest = await (await post('/api/auth/guest', { guestToken }, db)).json();
  const login = await post('/api/auth/google', {}, db, { 'x-guest-token': guestToken });
  const linked = await login.json();
  assert.equal(linked.user.id, guest.user.id);
  assert.equal(linked.user.provider, 'mock');
  assert.equal(db.users.size, 1);
  assert.equal(db.users.get(linked.user.id).guest_token, guestToken);

  const resumed = await (await post('/api/auth/guest', { guestToken }, db)).json();
  assert.equal(resumed.user.provider, 'mock');
  assert.equal(resumed.user.id, linked.user.id);
});

test('session endpoint rejects unknown and expired tokens', async () => {
  const db = new FakeD1();
  const unknown = await worker.fetch(new Request('https://example.test/api/auth/session', { headers: { authorization: `Bearer ${crypto.randomUUID()}` } }), { DB: db }, {});
  assert.equal(unknown.status, 401);

  const login = await (await post('/api/auth/google', {}, db)).json();
  db.sessions.get(login.token).expires_at = '2000-01-01T00:00:00.000Z';
  const expired = await worker.fetch(new Request('https://example.test/api/auth/session', { headers: { authorization: `Bearer ${login.token}` } }), { DB: db }, {});
  assert.equal(expired.status, 401);
});

test('auth responses include CORS headers', async () => {
  const response = await post('/api/auth/google', {}, new FakeD1());
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
});

test('chunkedInsert splits 25 rows into batches of 20 and 5', async () => {
  const db = new FakeD1();
  const rows = Array.from({ length: 25 }, (_, id) => ({ id, value: `row-${id}` }));
  await chunkedInsert(db, { table: 'bulk_rows', columns: ['id', 'value'], rows });
  assert.deepEqual(db.insertSizes, [20, 5]);
});
