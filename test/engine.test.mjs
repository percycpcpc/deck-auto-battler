import assert from 'node:assert/strict';
import {
  CARD_POOL, HERO_HP, createFight, createRun, effectiveStats, exchange, finishRunFight,
  enemyDeckFor, getCard, makeUnit, runRound, startRunFight, summon, tokenCard, triggerBattlecry,
} from '../src/engine.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}
const empty = () => createFight({ playerDeck: [], enemyDeck: [] });

test('round ordering and cost-1 deploys on the following round', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [] });
  runRound(s); assert.equal(s.player.board.length, 0); assert.equal(s.player.charger.counter, 1);
  // Prevent the empty-deck valve from ending this focused fixture.
  s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); s.over = false; s.winner = null;
  runRound(s); assert.equal(s.player.board[0].name, 'Sellsword');
  assert.deepEqual([...new Set(s.events.map(e => e.phase))], ['reveal', 'tick', 'deploy', 'action', 'cleanup']);
});

test('mutual exchange: 2/2 versus 2/2 both die', () => {
  const s = empty(), a = summon(s, 'player', getCard('sellsword')), b = summon(s, 'enemy', getCard('sellsword'));
  exchange(s, 'player', a, b); assert.equal(s.player.board.length, 0); assert.equal(s.enemy.board.length, 0);
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
  assert.equal(headsman.baseAtk, 3); assert.equal(headsman.baseMaxHp, 3);
  target.damage = 3; exchange(s, 'player', headsman, target);
  assert.equal(headsman.baseAtk, 5); assert.equal(headsman.baseMaxHp, 5);
  const change = s.events.find(event => event.type === 'statChange' && event.reason === 'onKill');
  assert.equal(change.amount, 2); assert.ok(s.events.findIndex(event => event.type === 'damage' && event.uid === target.uid) < s.events.indexOf(change));
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

test('Bristleback gains +3 Attack per surviving damage instance but not when killed', () => {
  let s = empty(), bristle = summon(s, 'player', getCard('bristleback'));
  let attacker = summon(s, 'enemy', { id: 'pinger', name: 'Pinger', cost: 0, atk: 1, hp: 20 });
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 4);
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 7);
  assert.equal(s.events.filter(event => event.type === 'statChange' && event.reason === 'onDamaged').length, 2);
  s = empty(); bristle = summon(s, 'player', getCard('bristleback')); attacker = summon(s, 'enemy', getCard('colossus'));
  exchange(s, 'enemy', attacker, bristle); assert.equal(bristle.baseAtk, 1); assert.equal(s.player.board.includes(bristle), false);
});

test('Quillback Elder pings enemy and friendly arrivals, can kill entry, and ignores its own entry', () => {
  const s = empty(); const elder = summon(s, 'player', getCard('quillback_elder'));
  assert.equal(elder.damage, 0); assert.equal(s.events.some(event => event.type === 'summonPing'), false);
  const grunt = summon(s, 'enemy', getCard('sellsword')); assert.equal(grunt.damage, 1);
  const token = summon(s, 'player', tokenCard()); assert.equal(s.player.board.includes(token), false);
  const ping = s.events.find(event => event.type === 'summonPing' && event.targetUid === grunt.uid);
  assert.ok(ping); assert.ok(s.events.indexOf(ping) < s.events.findIndex(event => event.type === 'damage' && event.uid === grunt.uid));
});

test('Quillback Elder pings Hivematron boss-spawned tokens', () => {
  const s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('quillback_elder'));
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const tokenSummon = s.events.find(event => event.type === 'summon' && event.unit === '1/1 Token');
  assert.ok(tokenSummon); assert.ok(s.events.some(event => event.type === 'summonPing' && event.targetUid === tokenSummon.uid));
  assert.equal(s.enemy.board.some(unit => unit.uid === tokenSummon.uid), false);
});

test('an entrant killed by Quillback Elder does not fire its Battlecry', () => {
  const s = empty(); summon(s, 'player', getCard('quillback_elder'));
  s.enemy.charger = { card: { ...getCard('firebelcher'), hp: 1 }, counter: 0, justRevealed: false };
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.equal(s.events.some(event => event.type === 'battlecry' && event.kind === 'firebelch'), false);
});

test('Poisonous kills through HP, but not through a shielded hit', () => {
  let s = empty(), p = summon(s, 'player', getCard('venom_hound')), tank = summon(s, 'enemy', getCard('colossus'));
  exchange(s, 'player', p, tank); assert.equal(s.enemy.board.length, 0);
  s = empty(); p = summon(s, 'player', getCard('venom_hound')); tank = summon(s, 'enemy', getCard('aegis_knight'));
  exchange(s, 'player', p, tank); assert.ok(s.enemy.board.includes(tank));
});

test('player Deathrattle resolves first and its summon waits until next round', () => {
  const s = empty(); const p = summon(s, 'player', getCard('brood_wisp')); const e = summon(s, 'enemy', getCard('spiteful_imp'));
  p.baseMaxHp = 1; exchange(s, 'player', p, e);
  assert.equal(s.events.filter(x => x.type === 'death')[0].side, 'player');
  assert.equal(s.player.board[0].token, true); assert.equal(s.player.board[0].summonedThisAction, true);
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

  s = empty(); unit = summon(s, 'player', getCard('gate_crasher')); const moved = summon(s, 'enemy', getCard('sellsword')); summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.targetUid, moved.uid); assert.equal(event.fromIndex, 0); assert.equal(event.toIndex, 1);

  s = empty(); s.enemy.charger = { card: getCard('colossus'), counter: 2, justRevealed: false }; unit = summon(s, 'player', getCard('doomcaller')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.destroyed, true); assert.equal(s.events[1].type, 'chargerDestroyed');
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

test('enemy line starts fully pre-boarded with an empty deck', () => {
  const first = createFight({ fight: 1, rng: () => 0 });
  assert.equal(first.enemy.board.length, 8); assert.equal(first.enemy.deck.length, 0); assert.equal(first.enemy.board.some(unit => unit.boss), false);
  for (const fight of [2, 3]) {
    const state = createFight({ fight, rng: () => 0 });
    assert.equal(state.enemy.board.length, 8); assert.ok(state.enemy.board[0].boss); assert.equal(state.enemy.deck.length, 0);
  }
});

test('pre-boarded enemy emits no reveal and keeps its charger empty', () => {
  const s = createFight({ fight: 1, playerDeck: [getCard('sellsword')], rng: () => 0 });
  runRound(s);
  assert.equal(s.events.some(event => event.type === 'reveal' && event.side === 'enemy'), false);
  assert.equal(s.enemy.charger, null);
});

test('normal pre-boarded opening does not trip the stalemate valve on round 1', () => {
  const s = createFight({ fight: 1, rng: () => 0 });
  runRound(s);
  assert.equal(s.round, 1); assert.equal(s.over, false); assert.ok(s.player.charger);
  assert.equal(s.events.some(event => event.type === 'stalemate'), false);
});

test('next enemy line is previewed once and reused by the following fight', () => {
  const run = createRun(() => 0), first = startRunFight(run);
  first.over = true; first.winner = 'player'; finishRunFight(run, first);
  const preview = run.enemyLine.map(card => card.id), second = startRunFight(run);
  assert.deepEqual(second.enemy.board.slice(1).map(unit => unit.cardId), preview);
  assert.equal(run.enemyLine, null); assert.equal(enemyDeckFor(2, () => 0).length, 7);
});

test('fight-2 boss token appears only after attack damage and only with room', () => {
  const s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('sellsword'));
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const attackAt = s.events.findIndex(e => e.type === 'attack' && e.unit === 'Hivematron'); const summonAt = s.events.findIndex((e, i) => i > attackAt && e.type === 'summon' && e.unit === '1/1 Token');
  assert.ok(attackAt >= 0 && summonAt > attackAt);
});

test('fight-3 entry buff applies to tokens, not the pre-boarded boss', () => {
  const s = createFight({ fight: 3, playerDeck: [], enemyDeck: [] }); const boss = s.enemy.board[0], token = summon(s, 'enemy', tokenCard());
  assert.equal(boss.baseAtk, 1); assert.equal(token.baseAtk, 2); assert.equal(token.baseMaxHp, 2);
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
  assert.ok(death && !death.state[death.side].board.some(unit => unit.uid === death.uid));
  assert.deepEqual(Object.keys(death.state).sort(), ['enemy', 'phase', 'player', 'round']);
  assert.deepEqual(Object.keys(death.state.player).sort(), ['board', 'charger', 'hp']);
  assert.deepEqual(Object.keys(death.state.enemy).sort(), ['board', 'charger', 'hp']);
});

test('full three-fight run victory carries HP and grows deck 8 to 12', () => {
  const run = createRun(() => 0); assert.equal(run.deck.length, 8);
  for (let fight = 1; fight <= 3; fight++) {
    const combat = startRunFight(run); combat.player.hp = HERO_HP - fight; combat.over = true; combat.winner = 'player'; finishRunFight(run, combat);
    if (fight < 3) { run.deck.push(getCard('colossus'), getCard('colossus')); assert.equal(run.hp, HERO_HP - fight); }
  }
  assert.equal(run.deck.length, 12); assert.equal(run.won, true); assert.equal(run.hp, HERO_HP - 3);
});

assert.equal(CARD_POOL.length, 36);
console.log(`# ${passed} tests passed`);
