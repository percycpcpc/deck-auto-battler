import assert from 'node:assert/strict';
import * as engine from '../src/engine.js';
import { SEASONS, __setNowOverride, activePool, activeStarters, currentSeason, unionPool } from '../src/seasons.js';
import { createDeck } from '../server/src/decks.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}

await test('currentSeason selects windows and deterministic fallbacks', () => {
  assert.equal(currentSeason(Date.parse('2026-10-01T00:00:00Z')).id, 'season_1');
  assert.equal(currentSeason(Date.parse('2026-11-15T00:00:00Z')).id, 'season_1');
  assert.equal(currentSeason(Date.parse('2026-11-29T00:00:00Z')).id, 'season_2');
  assert.equal(currentSeason(Date.parse('2027-01-01T00:00:00Z')).id, 'season_2');
});

await test('season 2 rotates starter selection and enemy keyword', () => {
  __setNowOverride('2026-12-01T00:00:00Z');
  assert.deepEqual(activeStarters().map(starter => starter.id), ['ember_vanguard']);
  assert.deepEqual(engine.STARTERS.map(starter => starter.id), ['ember_vanguard']);
  assert.equal(engine.createRun(() => 0).starterId, 'ember_vanguard');
  assert.ok(engine.enemyDeckFor(1).every(card => card.keywords?.includes(SEASONS[1].enemyKeyword)));
});

await test('season 2 pool adds seven cards and restores the mana-bank package', () => {
  const baseIds = new Set(SEASONS[0].starters.flatMap(starter => starter.cards));
  const poolIds = new Set(activePool().map(card => card.id));
  const scout = unionPool().find(card => card.id === 'scout');
  assert.equal(activePool().length, 43);
  assert.deepEqual(unionPool().filter(card => card.deprecated).map(card => card.id), []);
  assert.ok(['tax_collector', 'chrono_imp', 'meddler', 'doomcaller'].every(id => poolIds.has(id)));
  assert.ok(unionPool().find(card => card.id === 'scout') && !unionPool().find(card => card.id === 'scout').deprecated);
  assert.ok([...baseIds].every(id => poolIds.has(id)));
  assert.ok(SEASONS[1].poolExtras.every(id => poolIds.has(id)));
  assert.deepEqual(
    (({ cost, atk, hp, tier, battlecry, heal, healOn, text }) => ({ cost, atk, hp, tier, battlecry, heal, healOn, text }))(scout),
    { cost: 1, atk: 2, hp: 4, tier: 'rare', battlecry: 'oppositeAtkDown2', heal: undefined, healOn: undefined, text: 'Battlecry: the opposing unit gets −2 ATK.' },
  );
});

await test('season 2 draft offers can contain seasonal cards', () => {
  const extras = new Set(SEASONS[1].poolExtras);
  let state = 1;
  const rng = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
  const offered = Array.from({ length: 100 }, () => engine.draftOffers(rng)).flat();
  assert.ok(offered.some(card => extras.has(card.id)));
});

await test('union legality preserves a legacy base deck during season 2', async () => {
  const legalIds = new Set(unionPool().map(card => card.id));
  const legacy = SEASONS[0].starters[0];
  assert.ok(legacy.cards.every(id => legalIds.has(id)));
  const env = { DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => ({ sql, values }) }) }) } };
  const saved = await createDeck(env, { user: { id: 'legacy-user' }, cardIds: legacy.cards, starterId: legacy.id, won: true, levelReached: 20, hpLeft: 4 });
  assert.deepEqual(saved.cardIds, legacy.cards);
});

await test('season clock override resets cleanly', () => {
  __setNowOverride(null);
  assert.equal(engine.STARTERS[0].id, 'oathbound_line');
});

console.log(`# ${passed} season tests passed`);
