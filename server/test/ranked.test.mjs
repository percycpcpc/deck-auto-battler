import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { eloDelta, getCurrentSeason, rankedScores } from '../src/ranked.js';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.db.first(this.sql, this.values); }
  run() { return this.db.run(this.sql, this.values); }
  all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() {
    this.users = new Map(); this.sessions = new Map(); this.entitlements = new Map();
    this.decks = new Map(); this.slots = new Map(); this.ratings = new Map();
    this.queue = new Map(); this.replays = new Map();
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  key(userId, deckId, season) { return `${userId}:${deckId}:${season}`; }
  async first(sql, v) {
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) { const s = this.sessions.get(v[0]); return s && s.expires_at > v[1] ? this.users.get(s.user_id) : null; }
    if (sql === 'SELECT sku FROM entitlements WHERE user_id = ?') return this.entitlements.get(v[0]) || null;
    if (sql === 'SELECT * FROM decks WHERE id = ?') return this.decks.get(v[0]) || null;
    if (sql.startsWith('SELECT 1 AS slotted FROM save_slots')) return [...this.slots.values()].find(x => x.owner_id === v[0] && x.deck_id === v[1]) ? { slotted: 1 } : null;
    if (sql.startsWith('SELECT rating, games, wins FROM ratings')) return this.ratings.get(this.key(v[0], v[1], v[2])) || null;
    if (sql.startsWith('SELECT user_id, deck_id, rating, enqueued_at FROM ranked_queue')) return [...this.queue.values()].filter(x => x.user_id !== v[0] && Math.abs(x.rating - v[1]) <= v[2]).sort((a, b) => a.enqueued_at.localeCompare(b.enqueued_at))[0] || null;
    if (sql === 'SELECT deck_id FROM ranked_queue WHERE user_id = ?') return this.queue.get(v[0]) || null;
    if (sql.startsWith('SELECT deck_id FROM ratings WHERE user_id')) return [...this.ratings.entries()].filter(([key]) => key.startsWith(`${v[0]}:`) && key.endsWith(`:${v[1]}`)).sort((a, b) => b[1].games - a[1].games).map(([key]) => ({ deck_id: key.split(':')[1] }))[0] || null;
    if (sql.startsWith('SELECT replays.* FROM replays JOIN decks')) return [...this.replays.values()].filter(r => this.decks.get(r.deck_a)?.owner_id === v[0] || this.decks.get(r.deck_b)?.owner_id === v[1]).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
    if (sql === 'SELECT * FROM replays WHERE id = ?') return this.replays.get(v[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  async run(sql, v) {
    if (sql.startsWith('INSERT INTO ratings')) { const key = this.key(v[0], v[1], v[2]); if (!this.ratings.has(key)) this.ratings.set(key, { rating: v[3], games: 0, wins: 0 }); return { meta: { changes: 1 } }; }
    if (sql.startsWith('INSERT INTO ranked_queue')) { this.queue.set(v[0], { user_id: v[0], deck_id: v[1], rating: v[2], enqueued_at: v[3] }); return { meta: { changes: 1 } }; }
    if (sql.startsWith('DELETE FROM ranked_queue WHERE user_id IN')) { const changes = Number(this.queue.delete(v[0])) + Number(this.queue.delete(v[1])); return { meta: { changes } }; }
    if (sql === 'DELETE FROM ranked_queue WHERE user_id = ?') return { meta: { changes: Number(this.queue.delete(v[0])) } };
    if (sql.startsWith('INSERT INTO replays')) { this.replays.set(v[0], { id: v[0], deck_a: v[1], deck_b: v[2], seed: v[3], result: v[4], created_at: v[5] }); return { meta: { changes: 1 } }; }
    if (sql.startsWith('UPDATE ratings SET rating')) { const row = this.ratings.get(this.key(v[2], v[3], v[4])); Object.assign(row, { rating: v[0], games: row.games + 1, wins: row.wins + v[1] }); return { meta: { changes: 1 } }; }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const cardsA = ['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre'];
const cardsB = ['dagger_imp', 'dagger_imp', 'twinfang', 'sellsword', 'hex_hurler', 'leeching_tick', 'road_ogre', 'duelist'];
const addUser = (db, id, { premium = true, deckId = `${id}-deck`, slotted = true, cards = cardsA } = {}) => {
  const token = crypto.randomUUID();
  db.users.set(id, { id, provider: 'mock', name: id }); db.sessions.set(token, { user_id: id, expires_at: '9999-01-01T00:00:00.000Z' });
  if (premium) db.entitlements.set(id, { sku: 'premium' });
  db.decks.set(deckId, { id: deckId, owner_id: id, card_ids: JSON.stringify(cards), starter_id: 'oathbound_line', won: 0, level_reached: 7, hp_left: 1, created_at: '2026-01-01T00:00:00.000Z' });
  if (slotted) db.slots.set(id, { owner_id: id, slot: 0, deck_id: deckId });
  return { id, token, deckId };
};
const request = (db, path, { method = 'GET', token, body } = {}) => worker.fetch(new Request(`https://test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db }, {});
const queue = (db, player) => request(db, '/api/ranked/queue', { method: 'POST', token: player.token, body: { deckId: player.deckId } });

test('ELO uses locked K32 formula and half-away-from-zero rounding', () => {
  assert.equal(eloDelta(1500, 1500, 1), 16); assert.equal(eloDelta(1500, 1500, 0), -16);
  assert.equal(eloDelta(1500, 1600, 1), 20); assert.equal(eloDelta(1600, 1500, 0), -20);
  assert.equal(eloDelta(1600, 1500, 1), 12); assert.equal(eloDelta(1500, 1600, 0), -12);
  const diff = 400 * Math.log10((1 / 0.515625) - 1);
  assert.equal(eloDelta(1500, 1500 + diff, 1), 16);
  assert.equal(eloDelta(1500, 1500 + diff, 0), -17);
  assert.deepEqual(rankedScores('draw'), { player: 0.5, enemy: 0.5 });
  assert.equal(eloDelta(1500, 1500, rankedScores('draw').player), 0);
  assert.equal(getCurrentSeason(), 'season_1');
});

test('queues then matches, records replay, and updates seasonal and eternal ratings', async () => {
  const db = new FakeD1(), a = addUser(db, 'a'), b = addUser(db, 'b', { cards: cardsB });
  assert.deepEqual(await (await queue(db, a)).json(), { status: 'queued' });
  const matched = await (await queue(db, b)).json();
  assert.equal(matched.status, 'matched'); assert.ok(db.replays.has(matched.replayId)); assert.equal(db.queue.size, 0);
  for (const player of [a, b]) for (const season of ['season_1', 'eternal']) { const row = db.ratings.get(db.key(player.id, player.deckId, season)); assert.equal(row.games, 1); }
  const winner = matched.winner === 'me' ? b : a;
  assert.equal(db.ratings.get(db.key(winner.id, winner.deckId, 'season_1')).wins, 1);
  const aStatus = await (await request(db, '/api/ranked/status', { token: a.token })).json();
  assert.equal(aStatus.queued, false); assert.ok(aStatus.lastMatch); assert.equal(aStatus.ratings.seasonal.games, 1);
  const replay = await (await request(db, `/api/replays/${matched.replayId}`)).json();
  assert.ok(replay.events.length); assert.deepEqual(replay.events, (await (await request(db, `/api/replays/${matched.replayId}`)).json()).events);
});

test('enforces session, premium, known deck, and save-slot gates', async () => {
  const db = new FakeD1(), free = addUser(db, 'free', { premium: false }), unslotted = addUser(db, 'unslotted', { slotted: false }), premium = addUser(db, 'premium');
  assert.equal((await request(db, '/api/ranked/queue', { method: 'POST', body: { deckId: premium.deckId } })).status, 401);
  assert.equal((await queue(db, free)).status, 403); assert.equal((await queue(db, unslotted)).status, 403);
  assert.equal((await request(db, '/api/ranked/queue', { method: 'POST', token: premium.token, body: { deckId: 'missing' } })).status, 404);
});

test('honors rating window, oldest-first matching, unqueue, and status shape', async () => {
  const db = new FakeD1(), a = addUser(db, 'a'), far = addUser(db, 'far'), near = addUser(db, 'near');
  db.ratings.set(db.key(far.id, far.deckId, 'season_1'), { rating: 1900, games: 0, wins: 0 });
  db.ratings.set(db.key(near.id, near.deckId, 'season_1'), { rating: 1550, games: 0, wins: 0 });
  await queue(db, a); assert.equal((await (await queue(db, far)).json()).status, 'queued');
  assert.equal((await (await queue(db, near)).json()).status, 'matched'); assert.ok(db.queue.has('far'));
  const status = await (await request(db, '/api/ranked/status', { token: far.token })).json();
  assert.equal(status.queued, true); assert.deepEqual(Object.keys(status.ratings), ['seasonal', 'eternal']);
  assert.equal((await request(db, '/api/ranked/unqueue', { method: 'POST', token: far.token })).status, 200);
  assert.equal((await request(db, '/api/ranked/unqueue', { method: 'POST', token: far.token })).status, 404);
});
