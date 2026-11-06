import assert from 'node:assert/strict';
import test from 'node:test';

import { HERO_HP, getCard, makeRng, runRound, startRunFight } from '../../src/engine.js';
import worker from '../src/index.js';
import { simulateDeckBattle, simulateSoloFight } from '../src/sim.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.db.first(this.sql, this.values); }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.decks = new Map(); this.replays = new Map(); }
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
    if (sql === 'SELECT * FROM replays WHERE id = ?') return this.replays.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async all(sql) {
    if (sql === 'SELECT 1') return { results: [{ 1: 1 }] };
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
    if (sql.startsWith('INSERT INTO replays')) {
      const [id, deck_a, deck_b, seed, result, created_at] = values;
      this.replays.set(id, { id, deck_a, deck_b, seed, result, created_at });
      return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const deckA = ['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre'];
const deckB = ['dagger_imp', 'dagger_imp', 'twinfang', 'sellsword', 'hex_hurler', 'leeching_tick', 'road_ogre', 'duelist'];
const snapshot = (cardIds, starterId = 'oathbound_line') => ({ cardIds, starterId, won: false, levelReached: 7, hpLeft: 1 });
const request = (db, path, { method = 'GET', token, body } = {}) => worker.fetch(new Request(`https://example.test${path}`, {
  method,
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), { DB: db }, {});
const login = async db => (await (await request(db, '/api/auth/google', { method: 'POST', body: { providerId: crypto.randomUUID(), displayName: 'Simmer' } })).json());
const createDeck = async (db, token, cardIds, starterId) => (await (await request(db, '/api/decks', { method: 'POST', token, body: snapshot(cardIds, starterId) })).json());

async function setup() {
  const db = new FakeD1();
  const { token } = await login(db);
  const a = await createDeck(db, token, deckA, 'oathbound_line');
  const b = await createDeck(db, token, deckB, 'rat_pack');
  return { db, token, a, b };
}

test('simulates stored decks and exposes a public replay with both ordered decks', async () => {
  const { db, token, a, b } = await setup();
  const response = await request(db, '/api/sim', { method: 'POST', token, body: { deckAId: a.id, deckBId: b.id, seed: 123 } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(['player', 'enemy', 'draw'].includes(result.winner));
  assert.ok(result.rounds > 0);
  assert.ok(result.events.length > 0);
  assert.ok(db.replays.has(result.replayId));

  const replayResponse = await request(db, `/api/replays/${result.replayId}`);
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.deepEqual(replay.cardIdsA, deckA);
  assert.deepEqual(replay.cardIdsB, deckB);
  assert.deepEqual(replay.events, result.events);
  assert.deepEqual(replay.result, { winner: result.winner, rounds: result.rounds });
});

test('same seed is byte-identical, different seeds diverge, and replay ids remain unique', async () => {
  const { db, token, a, b } = await setup();
  const simulate = seed => request(db, '/api/sim', { method: 'POST', token, body: { deckAId: a.id, deckBId: b.id, seed } }).then(response => response.json());
  const first = await simulate(0x12345678);
  const second = await simulate(0x12345678);
  const different = await simulate(0x12345679);
  assert.notEqual(first.replayId, second.replayId);
  assert.deepEqual(first.events, second.events);
  assert.notEqual(JSON.stringify(first.events), JSON.stringify(different.events));
  const firstUids = first.events.flatMap(event => [event.uid, event.targetUid].filter(Boolean));
  const secondUids = second.events.flatMap(event => [event.uid, event.targetUid].filter(Boolean));
  assert.ok(firstUids.length > 0);
  assert.deepEqual(firstUids, secondUids);
});

test('simulateDeckBattle matches a client-style engine loop', () => {
  const seed = 987654321;
  const rng = makeRng(seed);
  const run = { fight: 1, hp: HERO_HP, deck: deckA.map(getCard), rng, enemyLine: deckB.map(getCard), won: false, lost: false, starterId: null };
  const fight = startRunFight(run);
  fight.uidRng = run.rng;
  while (!fight.over) runRound(fight);
  const server = simulateDeckBattle({ cardIdsA: deckA, cardIdsB: deckB, seed });
  assert.equal(server.winner, fight.winner);
  assert.equal(server.rounds, fight.round);
  assert.deepEqual(server.events, fight.events);
});

test('validates auth, seeds, missing decks, mirrors, and missing replays', async () => {
  const { db, token, a, b } = await setup();
  const body = { deckAId: a.id, deckBId: b.id, seed: 1 };
  assert.equal((await request(db, '/api/sim', { method: 'POST', body })).status, 401);
  for (const seed of ['1', -1, 0x100000000, 1.5, null]) {
    assert.equal((await request(db, '/api/sim', { method: 'POST', token, body: { ...body, seed } })).status, 400);
  }
  assert.equal((await request(db, '/api/sim', { method: 'POST', token, body: { ...body, deckBId: crypto.randomUUID() } })).status, 404);
  assert.equal((await request(db, '/api/sim', { method: 'POST', token, body: { deckAId: a.id, deckBId: a.id, seed: 7 } })).status, 200);
  assert.equal((await request(db, `/api/replays/${crypto.randomUUID()}`)).status, 404);
});

test('solo simulation is byte-identical including generated uids', async () => {
  const { db, token } = await setup();
  const body = { deckCardIds: deckA, seed: 0x54c0ffee, fight: 1 };
  const first = await (await request(db, '/api/sim/solo', { method: 'POST', token, body })).json();
  const second = await (await request(db, '/api/sim/solo', { method: 'POST', token, body })).json();
  assert.equal(JSON.stringify(first.events), JSON.stringify(second.events));
  const firstUids = first.events.flatMap(event => [event.uid, event.targetUid].filter(Boolean));
  assert.ok(firstUids.length > 0);
  assert.deepEqual(firstUids, second.events.flatMap(event => [event.uid, event.targetUid].filter(Boolean)));
});

test('solo simulation rejects out-of-pool cards and missing auth', async () => {
  const { db, token } = await setup();
  const body = { deckCardIds: deckA, seed: 54, fight: 1 };
  assert.equal((await request(db, '/api/sim/solo', { method: 'POST', body })).status, 401);
  assert.equal((await request(db, '/api/sim/solo', { method: 'POST', token, body: { ...body, deckCardIds: [...deckA, 'not_in_union_pool'] } })).status, 400);
});

test('solo endpoint winner and rounds match the local engine run', async () => {
  const { db, token } = await setup();
  const body = { deckCardIds: deckA, seed: 987654321, fight: 3 };
  const response = await request(db, '/api/sim/solo', { method: 'POST', token, body });
  assert.equal(response.status, 200);
  const server = await response.json();

  const rng = makeRng(body.seed);
  const localRun = { fight: body.fight, hp: HERO_HP, deck: body.deckCardIds.map(getCard), rng, enemyLine: null, won: false, lost: false, starterId: null };
  const local = startRunFight(localRun); local.uidRng = localRun.rng;
  const events = [];
  while (!local.over) { runRound(local); events.push(...local.events); }
  assert.equal(server.winner, local.winner);
  assert.equal(server.rounds, local.round);
  assert.ok(events.length > 0);
  const direct = simulateSoloFight(body);
  assert.equal(direct.winner, local.winner);
  assert.equal(direct.rounds, local.round);
});
