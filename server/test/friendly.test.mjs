import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.db.first(this.sql, this.values); }
  run() { return this.db.run(this.sql, this.values); }
}

class FakeD1 {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.decks = new Map();
    this.replays = new Map();
    this.ratings = new Map();
    this.queue = new Map();
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async first(sql, values) {
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) {
      const session = this.sessions.get(values[0]);
      return session && session.expires_at > values[1] ? this.users.get(session.user_id) : null;
    }
    if (sql === 'SELECT * FROM decks WHERE id = ?') return this.decks.get(values[0]) || null;
    if (sql === 'SELECT * FROM replays WHERE id = ?') return this.replays.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async run(sql, values) {
    if (sql.startsWith('INSERT INTO replays')) {
      this.replays.set(values[0], {
        id: values[0], deck_a: values[1], deck_b: values[2], seed: values[3],
        result: values[4], created_at: values[5],
      });
      return { meta: { changes: 1 } };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const cardsA = ['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre'];
const cardsB = ['dagger_imp', 'dagger_imp', 'twinfang', 'sellsword', 'hex_hurler', 'leeching_tick', 'road_ogre', 'duelist'];

function addGuest(db) {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  db.users.set(id, { id, provider: 'guest', name: null });
  db.sessions.set(token, { user_id: id, expires_at: '9999-01-01T00:00:00.000Z' });
  return { id, token };
}

function addDeck(db, ownerId, cards) {
  const id = crypto.randomUUID();
  db.decks.set(id, {
    id, owner_id: ownerId, card_ids: JSON.stringify(cards), starter_id: 'oathbound_line',
    won: 0, level_reached: 7, hp_left: 1, created_at: '2026-01-01T00:00:00.000Z',
  });
  return id;
}

const request = (db, path, { method = 'GET', token, body } = {}) => worker.fetch(new Request(`https://test${path}`, {
  method,
  headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), { DB: db }, {});

test('guest creates a friendly replay without rating, reward, or queue side effects', async () => {
  const db = new FakeD1();
  const guest = addGuest(db);
  const myDeckId = addDeck(db, guest.id, cardsA);
  const theirDeckId = addDeck(db, crypto.randomUUID(), cardsB);

  const response = await request(db, '/api/friendly', {
    method: 'POST', token: guest.token, body: { myDeckId, theirDeckId },
  });
  assert.equal(response.status, 200);
  const friendly = await response.json();
  assert.deepEqual(Object.keys(friendly).sort(), ['replayId', 'rounds', 'url', 'winner']);
  assert.equal(friendly.url, `/?replay=${friendly.replayId}`);
  assert.ok(friendly.rounds > 0);

  const row = db.replays.get(friendly.replayId);
  assert.deepEqual(JSON.parse(row.result), {
    winner: friendly.winner,
    rounds: friendly.rounds,
    kind: 'friendly',
    host: guest.id,
    opponentDeck: theirDeckId,
  });
  assert.equal(db.ratings.size, 0);
  assert.equal(db.queue.size, 0);
});

test('friendly creation requires a valid session', async () => {
  const db = new FakeD1();
  const response = await request(db, '/api/friendly', {
    method: 'POST', body: { myDeckId: crypto.randomUUID(), theirDeckId: crypto.randomUUID() },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
});

test('friendly creation identifies the missing deck', async () => {
  const db = new FakeD1();
  const guest = addGuest(db);
  const myDeckId = addDeck(db, guest.id, cardsA);

  const opponentMissing = await request(db, '/api/friendly', {
    method: 'POST', token: guest.token, body: { myDeckId, theirDeckId: crypto.randomUUID() },
  });
  assert.equal(opponentMissing.status, 404);
  assert.deepEqual(await opponentMissing.json(), { error: 'opponent deck not found' });

  const mineMissing = await request(db, '/api/friendly', {
    method: 'POST', token: guest.token, body: { myDeckId: crypto.randomUUID(), theirDeckId: myDeckId },
  });
  assert.equal(mineMissing.status, 404);
  assert.deepEqual(await mineMissing.json(), { error: 'my deck not found' });
});

test('mirror friendly succeeds and its replay is publicly fetchable with events', async () => {
  const db = new FakeD1();
  const guest = addGuest(db);
  const deckId = addDeck(db, guest.id, cardsA);
  const created = await request(db, '/api/friendly', {
    method: 'POST', token: guest.token, body: { myDeckId: deckId, theirDeckId: deckId },
  });
  assert.equal(created.status, 200);
  const { replayId } = await created.json();

  const replayResponse = await request(db, `/api/replays/${replayId}`);
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.deckAId, deckId);
  assert.equal(replay.deckBId, deckId);
  assert.equal(replay.result.kind, 'friendly');
  assert.ok(replay.events.length > 0);
});
