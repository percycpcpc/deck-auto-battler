import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.js';
import { catalog, checkMatchBadges } from '../src/cosmetics.js';

const CATALOG = [
  ['oathbound_icon', 'icon', 'Oathbound', 'assets/portrait_aegis_knight.png', null, 'Founders profile icon'],
  ['imp_icon', 'icon', 'Dagger Imp', 'assets/portrait_dagger_imp.png', null, 'Founders profile icon'],
  ['brood_icon', 'icon', 'Brood Wisp', 'assets/portrait_brood_wisp.png', null, 'Founders profile icon'],
  ['ember_icon', 'icon', 'Ember Scout', 'assets/portrait_scout.png', 'season_2', 'Play during Emberwake'],
  ['founders_banner', 'banner', 'Founders March', 'assets/banner_victory.png', 'season_1', 'Play during Founders March'],
  ['emberwake_banner', 'banner', 'Emberwake', 'assets/banner_draft.png', 'season_2', 'Play during Emberwake'],
  ['warband_banner', 'banner', 'Warband', 'assets/bg_battlefield.png', null, 'Complete a run'],
  ['bronze_sigil', 'badge', 'Bronze Sigil', 'assets/frame_common.png', null, 'Reach 1400 ranked rating'],
  ['silver_sigil', 'badge', 'Silver Sigil', 'assets/frame_rare.png', null, 'Reach 1600 ranked rating'],
  ['gold_sigil', 'badge', 'Gold Sigil', 'assets/frame_mythic.png', null, 'Reach 1800 ranked rating'],
  ['season_1_trophy', 'trophy', 'Founders Trophy', 'assets/portrait_boss_warherald.png', 'season_1', 'Win level 20 in Founders March'],
  ['season_2_trophy', 'trophy', 'Emberwake Trophy', 'assets/portrait_boss_hivematron.png', 'season_2', 'Win level 20 in Emberwake'],
].map(([id, kind, name, art, season_id, earn]) => ({ id, kind, name, art, season_id, earn }));
const SESSION_TOKEN = '11111111-1111-4111-8111-111111111111';

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  first() { return this.db.first(this.sql, this.values); }
  run() { return this.db.run(this.sql, this.values); }
  all() { return this.db.all(this.sql, this.values); }
}

class FakeD1 {
  constructor() {
    this.users = new Map([['guest', { id: 'guest', provider: 'guest', name: 'Guest' }]]);
    this.sessions = new Map([[SESSION_TOKEN, { user_id: 'guest', expires_at: '9999-01-01T00:00:00.000Z' }]]);
    this.decks = new Map(); this.grants = new Map(); this.cosmetics = CATALOG;
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  first(sql, values) {
    if (sql.startsWith('SELECT users.* FROM sessions JOIN users')) {
      const session = this.sessions.get(values[0]);
      return session && session.expires_at > values[1] ? this.users.get(session.user_id) : null;
    }
    if (sql === 'SELECT * FROM decks WHERE id = ?') return this.decks.get(values[0]) || null;
    throw new Error(`unexpected first: ${sql}`);
  }
  all(sql, values) {
    if (sql.startsWith('SELECT id, kind, name, art, season_id, earn FROM cosmetics')) return { results: this.cosmetics };
    if (sql.startsWith('SELECT cosmetics.id')) {
      return { results: [...this.grants.values()].filter(row => row.user_id === values[0]).map(grant => ({
        ...this.cosmetics.find(row => row.id === grant.cosmetic_id), season_id: grant.season_id, granted_at: grant.granted_at,
      })) };
    }
    throw new Error(`unexpected all: ${sql}`);
  }
  run(sql, values) {
    if (sql.startsWith('INSERT INTO decks')) {
      const [id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at] = values;
      this.decks.set(id, { id, owner_id, card_ids, starter_id, won, level_reached, hp_left, created_at });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO user_cosmetics')) {
      const [user_id, cosmetic_id, season_id, granted_at] = values, key = `${user_id}:${cosmetic_id}`, existed = this.grants.has(key);
      if (!existed) this.grants.set(key, { user_id, cosmetic_id, season_id, granted_at });
      return { meta: { changes: existed ? 0 : 1 } };
    }
    throw new Error(`unexpected run: ${sql}`);
  }
}

const snapshot = {
  cardIds: ['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre'],
  starterId: 'oathbound_line', won: true, levelReached: 20, hpLeft: 4,
};
const request = (db, path, { method = 'GET', token, body } = {}) => worker.fetch(new Request(`https://test${path}`, {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), { DB: db }, {});

test('deck POST grants the level-20 season trophy once and not at level 19', async () => {
  const db = new FakeD1();
  for (let i = 0; i < 2; i += 1) assert.equal((await request(db, '/api/decks', { method: 'POST', token: SESSION_TOKEN, body: snapshot })).status, 200);
  assert.deepEqual([...db.grants.values()].map(row => row.cosmetic_id), ['season_1_trophy']);
  const l19 = new FakeD1();
  await request(l19, '/api/decks', { method: 'POST', token: SESSION_TOKEN, body: { ...snapshot, levelReached: 19 } });
  assert.equal(l19.grants.size, 0);
});

test('rating badge checks are cumulative, thresholded, season-stamped, and idempotent', async () => {
  for (const [rating, expected] of [[1399, []], [1400, ['bronze_sigil']], [1600, ['bronze_sigil', 'silver_sigil']], [1800, ['bronze_sigil', 'silver_sigil', 'gold_sigil']]]) {
    const db = new FakeD1();
    await checkMatchBadges({ DB: db }, 'guest', rating, 'season_1');
    await checkMatchBadges({ DB: db }, 'guest', rating, 'season_1');
    assert.deepEqual([...db.grants.values()].map(row => row.cosmetic_id), expected);
    assert.ok([...db.grants.values()].every(row => row.season_id === 'season_1'));
  }
});

test('catalog rows contain visual metadata only', async () => {
  const rows = await catalog({ DB: new FakeD1() });
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['art', 'earn', 'id', 'kind', 'name', 'seasonId']);
    assert.ok(['icon', 'banner', 'badge', 'trophy'].includes(row.kind));
  }
});

test('GET cosmetics requires a session and accepts guest sessions', async () => {
  const db = new FakeD1();
  assert.equal((await request(db, '/api/cosmetics')).status, 401);
  const response = await request(db, '/api/cosmetics', { token: SESSION_TOKEN });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.catalog.length, 12); assert.deepEqual(body.owned, []);
});
