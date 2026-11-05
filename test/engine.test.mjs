import assert from 'node:assert/strict';
import {
  CARD_POOL, HERO_HP, RUN_CONFIG, STARTERS, STARTER_IDS, createFight, createRun, effectiveStats, exchange, finishRunFight,
  draftOffers, enemyDeckFor, gapKind, getCard, makeUnit, runEndSnapshot, runRound, startRunFight, summon, tokenCard, triggerBattlecry,
} from '../src/engine.js';
import { createDeckEventFlow, createDraftFlow } from '../src/ui.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}
const empty = () => createFight({ playerDeck: [], enemyDeck: [] });

test('starter registry contains three valid eight-card decks and preserves the legacy default', () => {
  assert.equal(STARTERS.length, 3);
  assert.deepEqual(STARTERS[0].ids, STARTER_IDS);
  for (const starter of STARTERS) {
    assert.equal(starter.ids.length, 8, starter.id);
    assert.ok(starter.ids.every(id => CARD_POOL.some(card => card.id === id)), starter.id);
  }
});

test('createRun selects Rat Pack and falls back to the legacy starter for an unknown id', () => {
  assert.deepEqual(createRun(() => 0, 'rat_pack').deck.map(card => card.id), STARTERS[1].ids);
  assert.deepEqual(createRun(() => 0, 'missing_starter').deck.map(card => card.id), STARTER_IDS);
});

test('createRun and run-end snapshots preserve the resolved starter id', () => {
  const run = createRun(() => 0, 'rat_pack');
  assert.equal(run.starterId, 'rat_pack');
  assert.equal(runEndSnapshot(run).starterId, 'rat_pack');
  assert.equal(createRun(() => 0, 'nope').starterId, STARTERS[0].id);
});

test('fight seeds reproduce event logs and vary the player reveal order', () => {
  const playerDeck = CARD_POOL.slice(0, 8), enemyDeck = enemyDeckFor(1);
  const play = seed => {
    const fight = createFight({ playerDeck, enemyDeck, seed });
    const events = [];
    while (!fight.over) { runRound(fight); events.push(...fight.events); }
    return events;
  };
  const first = play(1), replay = play(1), different = play(2);
  assert.deepEqual(replay, first);
  const firstReveal = events => events.find(event => event.type === 'reveal' && event.side === 'player').state.player.charger.card.id;
  assert.notEqual(firstReveal(different), firstReveal(first));
});

test('round ordering and cost-1 deploys on the following round', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [] });
  runRound(s); assert.equal(s.player.board.length, 0); assert.equal(s.player.charger.counter, 1);
  // Prevent the empty-deck valve from ending this focused fixture.
  s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); s.over = false; s.winner = null;
  runRound(s); assert.equal(s.player.board[0].name, 'Sellsword');
  assert.deepEqual([...new Set(s.events.map(e => e.phase))], ['reveal', 'tick', 'deploy', 'action', 'cleanup']);
});

test('mutual exchange: 2/3 versus 2/3 survive once and die on the second trade', () => {
  const s = empty(), a = summon(s, 'player', getCard('sellsword')), b = summon(s, 'enemy', getCard('sellsword'));
  exchange(s, 'player', a, b); assert.equal(!!a.dead, false); assert.equal(!!b.dead, false);
  exchange(s, 'player', a, b); assert.equal(s.player.board.length, 1); assert.equal(s.enemy.board.length, 1); assert.equal(a.dead, true); assert.equal(b.dead, true);
});

test('Windfury performs two full exchanges', () => {
  const s = empty(); summon(s, 'player', getCard('twinfang')); summon(s, 'enemy', { id: 'dummy', name: 'Dummy', cost: 0, atk: 0, hp: 10 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 });
  runRound(s); const attacks = s.events.filter(e => e.type === 'attack' && e.unit === 'Twinfang'); assert.equal(attacks.length, 2);
});

test('player sweep completes before the first enemy attack', () => {
  const s = empty();
  for (let i = 0; i < 2; i++) { summon(s, 'player', { id: `p${i}`, name: `P${i}`, cost: 0, atk: 0, hp: 10 }); summon(s, 'enemy', { id: `e${i}`, name: `E${i}`, cost: 0, atk: 0, hp: 10 }); }
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const attacks = s.events.map((event, index) => ({ event, index })).filter(({ event }) => event.type === 'attack');
  assert.ok(Math.max(...attacks.filter(x => x.event.side === 'player').map(x => x.index)) < Math.min(...attacks.filter(x => x.event.side === 'enemy').map(x => x.index)));
});

test('enemy killed during the player sweep emits no attack', () => {
  const s = empty(); const doomed = summon(s, 'enemy', { id: 'doomed', name: 'Doomed', cost: 0, atk: 0, hp: 1 });
  summon(s, 'player', getCard('sellsword')); s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.equal(s.events.some(event => event.type === 'attack' && event.uid === doomed.uid), false);
});

test('turnStart events flank the two action sweeps', () => {
  const s = empty(); summon(s, 'player', { id: 'p', name: 'P', cost: 0, atk: 0, hp: 10 }); summon(s, 'enemy', { id: 'e', name: 'E', cost: 0, atk: 0, hp: 10 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const playerTurn = s.events.findIndex(event => event.type === 'turnStart' && event.side === 'player');
  const playerAttack = s.events.findIndex(event => event.type === 'attack' && event.side === 'player');
  const enemyTurn = s.events.findIndex(event => event.type === 'turnStart' && event.side === 'enemy');
  const enemyAttack = s.events.findIndex(event => event.type === 'attack' && event.side === 'enemy');
  assert.ok(playerTurn < playerAttack && playerAttack < enemyTurn && enemyTurn < enemyAttack);
});

test('Divine Shield negates one complete damage instance', () => {
  const s = empty(), a = summon(s, 'player', getCard('sellsword')), b = summon(s, 'enemy', getCard('aegis_knight'));
  exchange(s, 'player', a, b); assert.equal(b.damage, 0); assert.equal(b.shield, false);
});

test('Headsman gains +2/+2 only after killing a unit', () => {
  const s = empty(), headsman = summon(s, 'player', getCard('headsman'));
  let target = summon(s, 'enemy', { id: 'survivor', name: 'Survivor', cost: 0, atk: 0, hp: 4 });
  exchange(s, 'player', headsman, target);
  assert.equal(headsman.baseAtk, 3); assert.equal(headsman.baseMaxHp, 8);
  target.damage = 3; exchange(s, 'player', headsman, target);
  assert.equal(headsman.baseAtk, 5); assert.equal(headsman.baseMaxHp, 10);
  const change = s.events.find(event => event.type === 'statChange' && event.reason === 'onKill');
  assert.equal(change.amount, 2); assert.ok(s.events.findIndex(event => event.type === 'damage' && event.uid === target.uid) < s.events.indexOf(change));
});

test('kill growth cannot rescue an attacker from a lethal exchange', () => {
  const s = empty(), tick = summon(s, 'player', getCard('leeching_tick'));
  const target = summon(s, 'enemy', { id: 'lethal_target', name: 'Lethal Target', cost: 0, atk: 5, hp: 1 });
  exchange(s, 'player', tick, target);
  assert.equal(tick.dead, true);
  assert.equal(tick.baseAtk, 1); assert.equal(tick.baseMaxHp, 5);
  assert.equal(s.events.some(event => event.type === 'statChange' && event.reason === 'onKill'), false);
});

test('retaliation kills do not trigger defender kill growth', () => {
  const s = empty();
  const attacker = summon(s, 'player', { id: 'fragile_attacker', name: 'Fragile Attacker', cost: 0, atk: 1, hp: 1 });
  const defender = summon(s, 'enemy', { id: 'retaliating_grower', name: 'Retaliating Grower', cost: 0, atk: 1, hp: 5, onKill: 2 });
  exchange(s, 'player', attacker, defender);
  assert.equal(attacker.dead, true); assert.equal(defender.dead, undefined);
  assert.equal(defender.baseAtk, 1); assert.equal(defender.baseMaxHp, 5);
  assert.equal(s.events.some(event => event.type === 'statChange' && event.reason === 'onKill'), false);
});

test('Bristleback growth triggers at most once per round per unit', () => {
  const s = empty(), bristle = summon(s, 'player', getCard('bristleback'));
  const attacker = summon(s, 'enemy', { id: 'round_pinger', name: 'Round Pinger', cost: 0, atk: 1, hp: 20 });
  s.round = 1; exchange(s, 'enemy', attacker, bristle); exchange(s, 'enemy', attacker, bristle);
  assert.equal(bristle.baseAtk, 4);
  s.round = 2; exchange(s, 'enemy', attacker, bristle);
  assert.equal(bristle.baseAtk, 7);
  assert.equal(s.events.filter(event => event.type === 'statChange' && event.reason === 'onDamaged').length, 2);
});

test('a surviving initiating attacker still receives kill growth', () => {
  const s = empty(), tick = summon(s, 'player', getCard('leeching_tick'));
  const target = summon(s, 'enemy', { id: 'small_target', name: 'Small Target', cost: 0, atk: 1, hp: 1 });
  exchange(s, 'player', tick, target);
  assert.equal(tick.dead, undefined);
  assert.equal(tick.baseAtk, 2); assert.equal(tick.baseMaxHp, 6);
  const deathIndex = s.events.findIndex(event => event.type === 'death' && event.uid === target.uid);
  const growthIndex = s.events.findIndex(event => event.type === 'statChange' && event.reason === 'onKill');
  assert.ok(deathIndex >= 0 && deathIndex < growthIndex);
  assert.equal(s.events.filter(event => event.type === 'statChange' && event.reason === 'onKill').length, 1);
});

test('Firebelcher damages every enemy including a boss and fizzles on an empty board', () => {
  let s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] });
  const boss = s.enemy.board[0], grunt = summon(s, 'enemy', getCard('sellsword')), firebelcher = summon(s, 'player', getCard('firebelcher'));
  s.events = []; triggerBattlecry(s, 'player', firebelcher);
  assert.equal(boss.damage, 1); assert.equal(grunt.damage, 1);
  assert.equal(s.events[0].type, 'battlecry'); assert.equal(s.events[0].all, true); assert.deepEqual(s.events.slice(1).map(event => event.type), ['damage', 'damage']);
  s = empty(); const lone = summon(s, 'player', getCard('firebelcher')); s.events = []; triggerBattlecry(s, 'player', lone);
  assert.equal(s.events.length, 1); assert.equal(s.events[0].type, 'battlecry'); assert.deepEqual(s.events[0].targetUids, []);
});

test('Shield Saint Divine Shield pops before HP damage', () => {
  const s = empty(), attacker = summon(s, 'player', getCard('sellsword')), saint = summon(s, 'enemy', getCard('shield_saint'));
  exchange(s, 'player', attacker, saint); assert.equal(saint.shield, false); assert.equal(saint.damage, 0);
});

test('Bristleback gains +3 Attack in later rounds but not when killed', () => {
  let s = empty(), bristle = summon(s, 'player', getCard('bristleback'));
  let attacker = summon(s, 'enemy', { id: 'pinger', name: 'Pinger', cost: 0, atk: 1, hp: 20 });
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 4);
  s.round++;
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 7);
  assert.equal(s.events.filter(event => event.type === 'statChange' && event.reason === 'onDamaged').length, 2);
  s = empty(); bristle = summon(s, 'player', getCard('bristleback')); attacker = summon(s, 'enemy', { id: 'finisher', name: 'Finisher', cost: 0, atk: 9, hp: 9 });
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 1); assert.equal(bristle.dead, true);
});

test('Quillback Elder pings enemy and friendly arrivals, can kill a fragile entry, and ignores its own entry', () => {
  const s = empty(); const elder = summon(s, 'player', getCard('quillback_elder'));
  assert.equal(elder.damage, 0); assert.equal(s.events.some(event => event.type === 'summonPing'), false);
  const grunt = summon(s, 'enemy', getCard('sellsword')); assert.equal(grunt.damage, 1);
  const token = summon(s, 'player', tokenCard()); assert.equal(token.damage, 1); assert.equal(!!token.dead, false); assert.ok(s.player.board.includes(token));
  const fragile = summon(s, 'player', { id: 'fragile', name: 'Fragile', cost: 0, atk: 0, hp: 1 }); assert.equal(fragile.dead, true);
  const ping = s.events.find(event => event.type === 'summonPing' && event.targetUid === grunt.uid);
  assert.ok(ping); assert.ok(s.events.indexOf(ping) < s.events.findIndex(event => event.type === 'damage' && event.uid === grunt.uid));
});

test('Quillback Elder pings Hivematron boss-spawned tokens', () => {
  const s = createFight({ fight: 3, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('quillback_elder'));
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const tokenSummon = s.events.find(event => event.type === 'summon' && event.unit === '1/2 Token');
  assert.ok(tokenSummon); assert.ok(s.events.some(event => event.type === 'summonPing' && event.targetUid === tokenSummon.uid));
  assert.equal(s.enemy.board.find(unit => unit.uid === tokenSummon.uid)?.damage, 1);
});

test('an entrant killed by Quillback Elder does not fire its Battlecry', () => {
  const s = empty(); summon(s, 'player', getCard('quillback_elder'));
  s.enemy.charger = { card: { ...getCard('firebelcher'), hp: 1 }, counter: 0, justRevealed: false };
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.equal(s.events.some(event => event.type === 'battlecry' && event.kind === 'firebelch'), false);
});

test('Poisonous kills through HP, but not through a shielded hit', () => {
  let s = empty(), p = summon(s, 'player', getCard('venom_hound')), tank = summon(s, 'enemy', getCard('colossus'));
  exchange(s, 'player', p, tank); assert.equal(tank.dead, true);
  s = empty(); p = summon(s, 'player', getCard('venom_hound')); tank = summon(s, 'enemy', getCard('aegis_knight'));
  exchange(s, 'player', p, tank); assert.ok(s.enemy.board.includes(tank));
});

test('player Deathrattle resolves first and its summon waits until next round', () => {
  const s = empty(); const p = summon(s, 'player', getCard('brood_wisp')); const e = summon(s, 'enemy', getCard('spiteful_imp'));
  p.baseMaxHp = 1; exchange(s, 'player', p, e);
  assert.equal(s.events.filter(x => x.type === 'death')[0].side, 'player');
  const token = s.player.board.find(unit => unit.token); assert.ok(token); assert.equal(token.summonedThisAction, true);
});

test('dynamic adjacent aura recomputes after shift-left', () => {
  const s = empty(); const left = summon(s, 'player', getCard('sellsword')); const war = summon(s, 'player', getCard('warlord')); const right = summon(s, 'player', getCard('sellsword'));
  assert.equal(effectiveStats(s, 'player', right).atk, 3); left.damage = 99; s.phase = 'cleanup';
  // Resolve via an exchange-free round helper path.
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.equal(effectiveStats(s, 'player', right).atk, 3); assert.equal(s.player.board.indexOf(right), 1);
});

test('Hexblade sets base stats and aura reapplies', () => {
  const s = empty(); summon(s, 'enemy', getCard('warlord')); const target = summon(s, 'enemy', getCard('colossus')); const hex = summon(s, 'player', getCard('hexblade'));
  // Align Hexblade opposite target.
  s.player.board.unshift(makeUnit(getCard('sellsword'), 'player')); triggerBattlecry(s, 'player', hex);
  assert.equal(target.baseAtk, 1); assert.equal(effectiveStats(s, 'enemy', target).atk, 2);
});

test('Gravedigger counts token deaths on both sides', () => {
  const s = empty(); s.deaths = 2; const g = summon(s, 'player', getCard('gravedigger')); triggerBattlecry(s, 'player', g);
  assert.equal(s.player.board.filter(u => u.token).length, 2);
});

test('battlecries emit ordered source, target, change, and fizzle details', () => {
  let s = empty(), unit = summon(s, 'player', getCard('tax_collector')); s.events = []; triggerBattlecry(s, 'player', unit);
  let event = s.events[0]; assert.equal(event.type, 'battlecry'); assert.equal(event.uid, unit.uid); assert.equal(event.kind, 'tax'); assert.equal(event.counterDelta, 0);

  s = empty(); unit = summon(s, 'player', getCard('hex_hurler')); const opposite = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.targetUid, opposite.uid); assert.equal(event.amount, 2); assert.equal(s.events[1].type, 'damage');

  s = empty(); unit = summon(s, 'player', getCard('inquisitor')); summon(s, 'enemy', getCard('sellsword')); const strongest = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.targetUid, strongest.uid); assert.equal(event.targetIndex, 1); assert.equal(s.events[1].type, 'damage');

  s = empty(); summon(s, 'player', getCard('sellsword')); unit = summon(s, 'player', getCard('squire')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.deepEqual(event.neighborIndices, [0]); assert.equal(event.targetUids.length, 1);

  s = empty(); unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 5); assert.equal(unit.baseMaxHp, 7); assert.equal(effectiveStats(s, 'player', unit).hp, 7); assert.equal(event.targetUid, unit.uid); assert.equal(event.amount, 2); assert.equal(event.applied, true); assert.equal(event.fizzle, false);

  s = empty(); summon(s, 'player', getCard('sellsword')); unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 3); assert.equal(unit.baseMaxHp, 5); assert.equal(event.amount, 0); assert.equal(event.applied, false); assert.equal(event.fizzle, true); assert.deepEqual(event.neighborIndices, [0]);

  s = empty(); const corpse = summon(s, 'player', getCard('sellsword')); corpse.dead = true; unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 5); assert.equal(unit.baseMaxHp, 7); assert.equal(event.applied, true); assert.deepEqual(event.neighborIndices, []);

  s = empty(); unit = summon(s, 'player', getCard('gate_crasher')); const moved = summon(s, 'enemy', getCard('sellsword')); summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.targetUid, moved.uid); assert.equal(event.fromIndex, 0); assert.equal(event.toIndex, 1);

  s = empty(); s.enemy.charger = { card: getCard('colossus'), counter: 2, justRevealed: false }; unit = summon(s, 'player', getCard('doomcaller')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.destroyed, true); assert.equal(s.events[1].type, 'chargerDestroyed');

  s = empty(); s.enemy.charger = { card: getCard('colossus'), counter: 2, justRevealed: false }; unit = summon(s, 'player', getCard('scout')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.alreadyKnown, true); assert.equal(event.scouted, false); assert.equal(s.enemy.scouted, false);
});

test('Chrono Imp turns a 1 counter into immediate deployment', () => {
  const s = empty(); s.player.charger = { card: getCard('sellsword'), counter: 1, justRevealed: false };
  const chrono = summon(s, 'player', getCard('chrono_imp')); triggerBattlecry(s, 'player', chrono);
  assert.equal(s.player.charger, null); assert.ok(s.player.board.some(u => u.name === 'Sellsword'));
});

test('Meddler bounce returns to top and re-enters charger next reveal', () => {
  const s = empty(); s.enemy.charger = { card: getCard('colossus'), counter: 2, justRevealed: false };
  const med = summon(s, 'player', getCard('meddler')); triggerBattlecry(s, 'player', med); assert.equal(s.enemy.deck[0].id, 'colossus');
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s); assert.equal(s.enemy.charger.card.id, 'colossus');
});

test('deck-out does nothing and stalemate valve favors player on tie', () => {
  const s = empty(); runRound(s); assert.equal(s.over, true); assert.equal(s.winner, 'player'); assert.equal(s.player.hp, HERO_HP);
});

test('regular enemies remain in the trickle deck and reveal one charger at a time', () => {
  const first = createFight({ fight: 1 });
  assert.equal(first.enemy.board.length, 0); assert.equal(first.enemy.deck.length, 8);
  runRound(first);
  assert.equal(first.enemy.deck.length, 7); assert.equal(first.enemy.charger.card.id, 'enemy_grunt'); assert.equal(first.enemy.board.length, 0);
  assert.ok(first.events.some(event => event.type === 'reveal' && event.side === 'enemy'));
});

test('enemy order is identical across 100 runs of the same fight', () => {
  const expected = {
    1: ['enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt', 'enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt'],
    2: ['enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt', 'enemy_brute', 'enemy_grunt'],
    3: ['enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt', 'enemy_brute', 'enemy_grunt'],
  };
  for (const fight of [1, 2, 3]) {
    assert.equal(enemyDeckFor(fight).length, expected[fight].length);
    for (let run = 0; run < 100; run++) assert.deepEqual(enemyDeckFor(fight, Math.random).map(card => card.id), expected[fight]);
  }
});

test('every scripted enemy card is common tier with per-fight stats', () => {
  for (const fight of [1, 2, 3]) assert.ok(enemyDeckFor(fight).every(card => card.tier === 'common'));
  const grunt = enemyDeckFor(1).find(card => card.id === 'enemy_grunt');
  assert.deepEqual([grunt.cost, grunt.atk, grunt.hp], [1, 2, 3]);
  const brute = enemyDeckFor(1).find(card => card.id === 'enemy_brute');
  assert.deepEqual([brute.cost, brute.atk, brute.hp], [2, 2, 6]);
  for (const fight of [2, 3]) {
    const support = enemyDeckFor(fight);
    assert.ok(support.filter(card => card.id === 'enemy_grunt').every(card => card.cost === 1 && card.atk === 2 && card.hp === 3 && card.tier === 'common'));
    assert.ok(support.filter(card => card.id === 'enemy_brute').every(card => card.cost === 2 && card.atk === 2 && card.hp === 6 && card.tier === 'common'));
  }
});

test('level-1 enemy script remains byte-identical to the pre-pass snapshot', () => {
  assert.equal(JSON.stringify(enemyDeckFor(1)), '[{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_brute","name":"Camp Brute","cost":2,"atk":2,"hp":6,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_brute","name":"Camp Brute","cost":2,"atk":2,"hp":6,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"}]');
});

test('gap cadence drafts normally and alternates remove then transform events', () => {
  assert.equal(gapKind(1), 'draft'); assert.equal(gapKind(3), 'remove');
  assert.equal(gapKind(6), 'transform'); assert.equal(gapKind(20), 'draft');
});

test('remove event changes nothing before confirm and removes exactly the selected card in place', () => {
  const deck = [getCard('sellsword'), getCard('oathbound'), getCard('colossus')];
  const flow = createDeckEventFlow({ deck, rng: () => 0, kind: 'remove' });
  assert.equal(flow.confirm(), null); assert.deepEqual(deck.map(card => card.id), ['sellsword', 'oathbound', 'colossus']);
  assert.equal(flow.select(1), true); assert.equal(deck.length, 3);
  const result = flow.confirm();
  assert.equal(result.removed.id, 'oathbound'); assert.deepEqual(deck.map(card => card.id), ['sellsword', 'colossus']);
  assert.equal(flow.confirm(), null);
});

test('transform event replaces the selected slot with a same-tier card and preserves deck size and order', () => {
  const first = getCard('sellsword'), selected = getCard('twinfang'), last = getCard('colossus');
  const deck = [first, selected, last]; const flow = createDeckEventFlow({ deck, rng: () => 0, kind: 'transform' });
  assert.equal(flow.confirm(), null); assert.deepEqual(deck, [first, selected, last]);
  assert.equal(flow.select(1), true); const result = flow.confirm();
  assert.equal(deck.length, 3); assert.equal(deck[0], first); assert.equal(deck[2], last);
  assert.equal(result.removed.id, 'twinfang'); assert.equal(result.replacement.tier, selected.tier); assert.equal(deck[1], result.replacement);
});

test('level-20 Broodmother is pre-boarded and its all aura is effective', () => {
  const s = createFight({ fight: 20, playerDeck: [], enemyDeck: [] });
  const boss = s.enemy.board[0]; assert.equal(boss.name, 'Broodmother'); assert.equal(boss.boss, 'broodmother');
  assert.deepEqual([boss.baseAtk, boss.baseMaxHp, boss.aura], [0, 5, 'all']);
  const ally = summon(s, 'enemy', enemyDeckFor(20)[0]);
  assert.deepEqual(effectiveStats(s, 'enemy', ally), { atk: 3, maxHp: 7, hp: 7 });
});

test('draft offers follow the seeded 50/35/15 tier weighting', () => {
  let value = 1729; const rng = () => ((value = value * 48271 % 2147483647) - 1) / 2147483646;
  const counts = { common: 0, rare: 0, mythic: 0 };
  for (let draw = 0; draw < 200; draw++) for (const card of draftOffers(rng)) counts[card.tier]++;
  assert.ok(counts.common >= 250 && counts.common <= 350, `common=${counts.common}`);
  assert.ok(counts.rare >= 170 && counts.rare <= 250, `rare=${counts.rare}`);
  assert.ok(counts.mythic >= 60 && counts.mythic <= 120, `mythic=${counts.mythic}`);
});

test('draft offers always contain exactly three distinct cards', () => {
  for (let seed = 1; seed <= 200; seed++) {
    let value = seed; const rng = () => ((value = value * 48271 % 2147483647) - 1) / 2147483646;
    const offers = draftOffers(rng);
    assert.equal(offers.length, 3, `seed=${seed}`);
    assert.equal(new Set(offers.map(card => card.id)).size, 3, `seed=${seed}`);
  }
  const fallbackOffers = draftOffers(() => 0);
  assert.equal(fallbackOffers.length, 3, 'bounded fallback length');
  assert.equal(new Set(fallbackOffers.map(card => card.id)).size, 3, 'bounded fallback uniqueness');
});

test('draft flow skips without changing the deck and advances', () => {
  const deck = [getCard('sellsword')]; let advances = 0;
  const flow = createDraftFlow({ deck, rng: () => 0, advance: () => advances++ });
  assert.equal(flow.skip(), true); assert.equal(deck.length, 1); assert.equal(advances, 1);
});

test('draft flow redraw replaces all offers, consumes its charge, and cannot redraw twice', () => {
  const sets = [CARD_POOL.slice(0, 3), CARD_POOL.slice(3, 6)]; let calls = 0;
  const flow = createDraftFlow({ deck: [], rng: () => 0, advance: () => {}, getOffers: () => sets[calls++] });
  const first = flow.state().offers;
  assert.equal(flow.redraw(), true); assert.deepEqual(flow.state().offers, sets[1]); assert.notDeepEqual(flow.state().offers, first);
  assert.equal(flow.state().redrawAvailable, false); assert.equal(flow.redraw(), false); assert.equal(calls, 2);
});

test('each new draft flow restores one redraw charge', () => {
  const options = { deck: [], rng: () => 0, advance: () => {}, getOffers: () => CARD_POOL.slice(0, 3) };
  const first = createDraftFlow(options); first.redraw();
  assert.equal(first.state().redrawAvailable, false);
  assert.equal(createDraftFlow(options).state().redrawAvailable, true);
});

test('draft flow keeps the existing single-action pick and advance behavior', () => {
  const deck = []; let advances = 0; const card = getCard('sellsword');
  const flow = createDraftFlow({ deck, rng: () => 0, advance: () => advances++ });
  assert.equal(flow.pick(card), true); assert.deepEqual(deck, [card]); assert.equal(advances, 1);
  assert.equal(flow.pick(getCard('colossus')), false); assert.equal(deck.length, 1); assert.equal(advances, 1);
});

test('player order still varies while enemy NEXT stays deterministic', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    let value = seed; const rng = () => ((value = value * 48271 % 2147483647) - 1) / 2147483646;
    const fight = startRunFight(createRun(rng)); orders.add(fight.player.deck.map(card => card.id).join(','));
    assert.equal(fight.enemy.deck[0].id, 'enemy_grunt');
  }
  assert.ok(orders.size > 1);
});

test('next enemy script is previewed once and reused by the following fight', () => {
  const run = createRun(() => 0), first = startRunFight(run);
  first.over = true; first.winner = 'player'; finishRunFight(run, first);
  const preview = run.enemyLine.map(card => card.id), second = startRunFight(run);
  assert.deepEqual(second.enemy.deck.map(card => card.id), preview);
  assert.equal(run.enemyLine, null); assert.equal(enemyDeckFor(2, () => 0).length, 6);
});

test('fight-2 boss pre-board and scripted trickle deck coexist', () => {
  const state = createFight({ fight: 2 });
  assert.equal(state.enemy.board.length, 1); assert.equal(state.enemy.board[0].name, 'Warherald'); assert.equal(state.enemy.board[0].boss, 'herald'); assert.equal(state.enemy.board[0].baseMaxHp, 5);
  assert.deepEqual(state.enemy.deck.map(card => card.id), ['enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt', 'enemy_brute', 'enemy_grunt']);
  assert.equal(state.enemy.deck.length, 6); runRound(state);
  assert.ok(state.enemy.board.some(unit => unit.boss === 'herald')); assert.equal(state.enemy.charger.card.id, 'enemy_grunt'); assert.equal(state.enemy.deck.length, 5);
});

test('fight-3 boss token appears only after attack damage and only with room', () => {
  const s = createFight({ fight: 3, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('sellsword'));
  assert.equal(s.enemy.board[0].name, 'Hivematron'); assert.equal(s.enemy.board[0].boss, 'hive');
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const attackAt = s.events.findIndex(e => e.type === 'attack' && e.unit === 'Hivematron'); const summonAt = s.events.findIndex((e, i) => i > attackAt && e.type === 'summon' && e.unit === '1/2 Token');
  assert.ok(attackAt >= 0 && summonAt > attackAt);
});

test('fight-2 entry buff applies to tokens, not the pre-boarded boss', () => {
  const s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] }); const boss = s.enemy.board[0], token = summon(s, 'enemy', tokenCard());
  assert.equal(boss.baseAtk, 1); assert.equal(token.baseAtk, 2); assert.equal(token.baseMaxHp, 3);
});

test('card pool exposes the three rarity tiers and locked representative stats', () => {
  const oathbound = getCard('oathbound'), dagger = getCard('dagger_imp'), hexblade = getCard('hexblade'), copycat = getCard('copycat');
  assert.deepEqual([oathbound.atk, oathbound.hp], [2, 6]);
  assert.deepEqual([dagger.atk, dagger.hp], [2, 2]);
  assert.deepEqual([hexblade.cost, hexblade.atk, hexblade.hp], [2, 2, 6]);
  assert.deepEqual([copycat.cost, copycat.atk, copycat.hp], [2, 3, 6]);
  assert.deepEqual(Object.fromEntries(['common', 'rare', 'mythic'].map(tier => [tier, CARD_POOL.filter(card => card.tier === tier).length])), { common: 6, rare: 28, mythic: 9 });
  assert.equal(HERO_HP, 40);
});

test('a later attacker treats an opposite corpse as an empty lane and hits the hero', () => {
  const s = empty();
  summon(s, 'player', { id: 'p0', name: 'P0', cost: 0, atk: 0, hp: 10 });
  const striker = summon(s, 'player', { id: 'p1', name: 'P1', cost: 0, atk: 3, hp: 10 });
  summon(s, 'enemy', { id: 'e0', name: 'E0', cost: 0, atk: 0, hp: 10 });
  const doomed = summon(s, 'enemy', { id: 'e1', name: 'E1', cost: 0, atk: 0, hp: 1 });
  exchange(s, 'player', makeUnit(getCard('colossus')), doomed);
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 });
  runRound(s);
  const attack = s.events.find(event => event.type === 'attack' && event.uid === striker.uid);
  assert.equal(attack.target, 'hero'); assert.equal(attack.targetUid, undefined); assert.equal(s.enemy.hp, HERO_HP - 3);
});

test('corpses provide no aura and are invalid opposite battlecry targets', () => {
  const s = empty(), ally = summon(s, 'player', getCard('sellsword')), overlord = summon(s, 'player', getCard('overlord'));
  assert.equal(effectiveStats(s, 'player', ally).atk, 3);
  exchange(s, 'enemy', makeUnit({ id: 'finisher', name: 'Finisher', cost: 0, atk: 10, hp: 10 }, 'enemy'), overlord);
  assert.equal(overlord.dead, true); assert.equal(effectiveStats(s, 'player', ally).atk, 2);
  summon(s, 'enemy', getCard('sellsword')); const hurler = summon(s, 'enemy', getCard('hex_hurler')); s.events = []; triggerBattlecry(s, 'enemy', hurler);
  assert.equal(s.events[0].targetUid, undefined); assert.equal(s.events.some(event => event.type === 'damage'), false);
});

test('cleanup emits one batch shift for an affected side', () => {
  const s = empty(), first = summon(s, 'player', getCard('dagger_imp')), second = summon(s, 'player', getCard('dagger_imp'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), first); exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), second);
  runRound(s);
  const shifts = s.events.filter(event => event.type === 'shift' && event.side === 'player');
  assert.equal(shifts.length, 1); assert.deepEqual(shifts[0].removedUids, [first.uid, second.uid]); assert.equal(shifts[0].phase, 'cleanup');
});

test('deathrattle fires immediately at lethal while its corpse stays in lane', () => {
  const s = empty(), wisp = summon(s, 'player', getCard('brood_wisp')), killer = summon(s, 'enemy', getCard('colossus'));
  s.events = []; exchange(s, 'enemy', killer, wisp);
  const deathAt = s.events.findIndex(event => event.type === 'death' && event.uid === wisp.uid);
  const summonAt = s.events.findIndex((event, index) => index > deathAt && event.type === 'summon' && event.unit === '1/2 Token');
  assert.ok(deathAt >= 0 && summonAt > deathAt); assert.ok(s.player.board.includes(wisp)); assert.equal(wisp.dead, true);
});

test('stalemate valve ignores corpses when comparing round progress', () => {
  const s = empty(), corpse = summon(s, 'player', getCard('dagger_imp'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), corpse); s.events = [];
  runRound(s);
  assert.equal(s.over, true); assert.equal(s.winner, 'player'); assert.equal(s.player.board.length, 0); assert.ok(s.events.some(event => event.type === 'stalemate'));
});

test('two corpses compact once at cleanup and preserve live left-to-right order', () => {
  const s = empty(), deadA = summon(s, 'player', getCard('dagger_imp')), liveA = summon(s, 'player', getCard('sellsword'));
  const deadB = summon(s, 'player', getCard('dagger_imp')), liveB = summon(s, 'player', getCard('road_ogre'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), deadA); exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), deadB);
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.deepEqual(s.player.board.map(unit => unit.uid), [liveA.uid, liveB.uid]);
  assert.equal(s.events.filter(event => event.type === 'shift' && event.side === 'player').length, 1);
});

test('round events carry post-event view snapshots for deploys and deaths', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [getCard('sellsword')] });
  runRound(s);
  s.over = false; s.winner = null;
  runRound(s);
  assert.ok(s.events.length > 0 && s.events.every(event => event.state));
  const deploy = s.events.find(event => event.type === 'deploy');
  assert.ok(deploy.state[deploy.side].board.some(unit => unit.uid === deploy.uid));
  const death = s.events.find(event => event.type === 'death');
  const corpse = death?.state[death.side].board.find(unit => unit.uid === death.uid);
  assert.ok(corpse?.dead);
  const shift = s.events.find(event => event.type === 'shift' && event.side === death.side && event.removedUids.includes(death.uid));
  assert.ok(shift && !shift.state[death.side].board.some(unit => unit.uid === death.uid));
  assert.deepEqual(Object.keys(death.state).sort(), ['enemy', 'phase', 'player', 'round']);
  assert.deepEqual(Object.keys(death.state.player).sort(), ['board', 'charger', 'hp']);
  assert.deepEqual(Object.keys(death.state.enemy).sort(), ['board', 'charger', 'deck', 'hp']);
});

test('each level starts at full HP and the run wins only after level 20', () => {
  const run = createRun(() => 0); assert.equal(run.deck.length, 8);
  for (let fight = 1; fight <= RUN_CONFIG.LEVELS; fight++) {
    const combat = startRunFight(run); assert.equal(combat.player.hp, HERO_HP); combat.player.hp = HERO_HP - fight; combat.over = true; combat.winner = 'player'; finishRunFight(run, combat);
    if (fight < RUN_CONFIG.LEVELS) assert.equal(run.won, false);
  }
  assert.equal(run.won, true); assert.equal(run.hp, HERO_HP - RUN_CONFIG.LEVELS);
});

test('run-end snapshot preserves the fresh starter deck order', () => {
  const snapshot = runEndSnapshot(createRun(() => 0));
  assert.equal(snapshot.cardIds.length, 8);
  assert.deepEqual(snapshot.cardIds, STARTERS[0].ids);
  assert.equal(snapshot.starterId, STARTERS[0].id);
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.cardIds));
});

test('run-end snapshot reflects draft-like mutations in current deck order', () => {
  const run = createRun(() => 0); run.deck.splice(2, 1); run.deck.push(getCard('colossus'));
  assert.deepEqual(runEndSnapshot(run).cardIds, [...STARTERS[0].ids.slice(0, 2), ...STARTERS[0].ids.slice(3), 'colossus']);
});

test('run-end snapshot records won and lost run flags', () => {
  const won = createRun(() => 0); won.fight = RUN_CONFIG.LEVELS;
  finishRunFight(won, { player: { hp: 7 }, winner: 'player' });
  assert.deepEqual([runEndSnapshot(won).won, runEndSnapshot(won).lost], [true, false]);
  const lost = createRun(() => 0);
  finishRunFight(lost, { player: { hp: 0 }, winner: 'enemy' });
  const snapshot = runEndSnapshot(lost);
  assert.deepEqual([snapshot.won, snapshot.lost], [false, true]);
});

assert.equal(CARD_POOL.length, 43);
console.log(`# ${passed} tests passed`);
