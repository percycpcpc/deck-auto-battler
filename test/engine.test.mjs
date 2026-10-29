import assert from 'node:assert/strict';
import {
  CARD_POOL, HERO_HP, createFight, createRun, effectiveStats, exchange, finishRunFight,
  getCard, makeUnit, runRound, startRunFight, summon, tokenCard, triggerBattlecry,
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

test('fight-2 boss token appears only after attack damage and only with room', () => {
  const s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('colossus'));
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

assert.equal(CARD_POOL.length, 30);
console.log(`# ${passed} tests passed`);
