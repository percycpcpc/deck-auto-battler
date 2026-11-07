import assert from 'node:assert/strict';
import {
  CARD_POOL, HERO_HP, MAX_COMBAT_TURNS, RUN_CONFIG, STARTERS, STARTER_IDS, createFight, createRun, effectiveStats, encounterGuideFor, exchange, finishRunFight,
  draftOffers, enemyDeckFor, gapKind, getCard, makeUnit, resolveDeaths, runEndSnapshot, runRound, startRunFight, summon, tokenCard, triggerBattlecry,
} from '../src/engine.js';
import { battlecryText, createDeckEventFlow, createDraftFlow } from '../src/ui.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}
const empty = () => createFight({ playerDeck: [], enemyDeck: [] });

test('owner-locked Sellsword and Inquisitor tuning is card-data driven', () => {
  const sellsword = getCard('sellsword'), inquisitor = getCard('inquisitor');
  assert.deepEqual([sellsword.atk, sellsword.hp], [3, 3]);
  assert.equal(inquisitor.battlecryAmount, 5);
  assert.equal(battlecryText(inquisitor), "On deploy: deal 5 damage to the enemy's strongest unit.");
});

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

test('fight seeds reproduce event logs and vary the player deployment order', () => {
  const playerDeck = CARD_POOL.slice(0, 8), enemyDeck = enemyDeckFor(1);
  const play = seed => {
    const fight = createFight({ playerDeck, enemyDeck, seed });
    const events = [];
    while (!fight.over) { runRound(fight); events.push(...fight.events); }
    return events;
  };
  const first = play(1), replay = play(1), different = play(2);
  assert.deepEqual(replay, first);
  const firstDeploy = events => events.find(event => event.type === 'deploy' && event.side === 'player').state.player.board[0].cardId;
  assert.notEqual(firstDeploy(different), firstDeploy(first));
});

test('turn ordering and cost-1 deploys during active-side upkeep', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [] });
  runRound(s); assert.equal(s.player.board[0].name, 'Sellsword'); assert.equal(s.player.mana, 0);
  assert.deepEqual([...new Set(s.events.map(e => e.phase))], ['upkeep', 'deploy']);
  assert.deepEqual(s.events.slice(0, 2).map(e => e.type), ['turn', 'mana']);
});

test('mutual exchange: 2/3 versus 2/3 survive once and die on the second trade', () => {
  const fighter = { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 };
  const s = empty(), a = summon(s, 'player', fighter), b = summon(s, 'enemy', fighter);
  exchange(s, 'player', a, b); assert.equal(!!a.dead, false); assert.equal(!!b.dead, false);
  exchange(s, 'player', a, b); assert.equal(s.player.board.length, 1); assert.equal(s.enemy.board.length, 1); assert.equal(a.dead, true); assert.equal(b.dead, true);
});

test('Windfury performs two full exchanges', () => {
  const s = empty(); summon(s, 'player', getCard('twinfang')); summon(s, 'enemy', { id: 'dummy', name: 'Dummy', cost: 0, atk: 0, hp: 10 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 });
  runRound(s); const attacks = s.events.filter(e => e.type === 'attack' && e.unit === 'Twinfang'); assert.equal(attacks.length, 2);
});

test('strict alternation gives player a complete sweep before the enemy turn', () => {
  const s = empty();
  for (let i = 0; i < 2; i++) { summon(s, 'player', { id: `p${i}`, name: `P${i}`, cost: 0, atk: 0, hp: 10 }); summon(s, 'enemy', { id: `e${i}`, name: `E${i}`, cost: 0, atk: 0, hp: 10 }); }
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.ok(s.events.filter(e => e.type === 'attack').every(e => e.side === 'player'));
  runRound(s); assert.ok(s.events.filter(e => e.type === 'attack').every(e => e.side === 'enemy'));
});

test('enemy killed during the player sweep emits no attack', () => {
  const s = empty(); const doomed = summon(s, 'enemy', { id: 'doomed', name: 'Doomed', cost: 0, atk: 0, hp: 1 });
  summon(s, 'player', getCard('sellsword')); s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.equal(s.events.some(event => event.type === 'attack' && event.uid === doomed.uid), false);
});

test('turn and mana events precede each active-side combat sweep', () => {
  const s = empty(); summon(s, 'player', { id: 'p', name: 'P', cost: 0, atk: 0, hp: 10 }); summon(s, 'enemy', { id: 'e', name: 'E', cost: 0, atk: 0, hp: 10 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const playerTurn = s.events.findIndex(event => event.type === 'turn' && event.side === 'player');
  const playerAttack = s.events.findIndex(event => event.type === 'attack' && event.side === 'player');
  assert.ok(playerTurn < playerAttack); assert.equal(s.events[1].type, 'mana');
  runRound(s); const enemyTurn = s.events.findIndex(event => event.type === 'turn' && event.side === 'enemy');
  const enemyAttack = s.events.findIndex(event => event.type === 'attack' && event.side === 'enemy'); assert.ok(enemyTurn < enemyAttack);
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

test('summoning sickness defers a deployed unit until its controller next turn', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [] });
  runRound(s); const unit = s.player.board[0]; assert.equal(unit.enteredTurn, 1); assert.equal(s.events.some(event => event.type === 'attack' && event.uid === unit.uid), false);
  runRound(s); runRound(s); assert.equal(s.events.some(event => event.type === 'attack' && event.uid === unit.uid), true);
});

test('Rush acts during the combat sweep of its entry turn', () => {
  const s = createFight({ playerDeck: [getCard('twinfang')], enemyDeck: [] });
  runRound(s); const unit = s.player.board[0]; assert.equal(unit.rush, true); assert.equal(s.events.some(event => event.type === 'attack' && event.uid === unit.uid), true);
});

test('pre-boarded boss acts on the enemy first combat sweep', () => {
  const s = createFight({ playerDeck: [], enemyDeck: [], fight: 2 });
  const boss = s.enemy.board[0]; assert.equal(boss.enteredTurn, 0); runRound(s); runRound(s);
  assert.equal(s.events.some(event => event.type === 'attack' && event.uid === boss.uid), true);
});

test('a token summoned during combat has summoning sickness', () => {
  const s = empty(), wisp = summon(s, 'player', getCard('brood_wisp'));
  summon(s, 'enemy', { id: 'token_killer', name: 'Token Killer', cost: 0, atk: 4, hp: 10 });
  runRound(s); const token = s.player.board.find(unit => unit.token);
  assert.ok(token); assert.equal(token.enteredTurn, s.turnNumber); assert.equal(s.events.some(event => event.type === 'attack' && event.uid === token.uid), false); assert.equal(wisp.dead, true);
});

test('healing is capped at original printed HP and heals both sides', () => {
  const s = empty(), healer = summon(s, 'player', { id: 'battlecry_healer', name: 'Battlecry Healer', cost: 0, atk: 1, hp: 4, heal: 2, healOn: 'battlecry' });
  const ally = summon(s, 'player', getCard('sellsword'));
  const enemy = summon(s, 'enemy', getCard('sellsword'));
  ally.baseMaxHp += 3; ally.damage = 4; enemy.damage = 2; healer.damage = 1; s.events = [];
  triggerBattlecry(s, 'player', healer);
  assert.equal(effectiveStats(s, 'player', ally).hp, ally.originalMaxHp);
  assert.equal(effectiveStats(s, 'enemy', enemy).hp, enemy.originalMaxHp);
  assert.deepEqual(s.events.filter(event => event.type === 'heal').map(event => event.uid), [healer.uid, ally.uid, enemy.uid]);
});

test('on-action healing resolves after the acting unit attacks', () => {
  const s = empty(), healer = summon(s, 'player', getCard('ember_scout'));
  const ally = summon(s, 'player', getCard('sellsword')); ally.damage = 1;
  summon(s, 'enemy', { id: 'dummy', name: 'Dummy', cost: 0, atk: 0, hp: 20 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  const attackAt = s.events.findIndex(event => event.type === 'attack' && event.uid === healer.uid);
  const healAt = s.events.findIndex(event => event.type === 'heal' && event.sourceUid === healer.uid);
  assert.ok(attackAt >= 0 && healAt > attackAt); assert.equal(ally.damage, 0);
});

test('on-damaged healing fires only when the healer survives', () => {
  let s = empty(), healer = summon(s, 'player', getCard('coalheart'));
  const ally = summon(s, 'player', getCard('road_ogre')); ally.damage = 2;
  exchange(s, 'enemy', summon(s, 'enemy', { id: 'ping', name: 'Ping', cost: 0, atk: 1, hp: 20 }), healer);
  assert.equal(ally.damage, 1); assert.ok(s.events.some(event => event.type === 'heal' && event.sourceUid === healer.uid));
  s = empty(); healer = summon(s, 'player', getCard('coalheart'));
  exchange(s, 'enemy', summon(s, 'enemy', { id: 'lethal', name: 'Lethal', cost: 0, atk: 8, hp: 20 }), healer);
  assert.equal(s.events.some(event => event.type === 'heal' && event.sourceUid === healer.uid), false);
});

test('battlecry healing is a no-op with no heal event at full HP', () => {
  const s = empty(), healer = summon(s, 'player', { id: 'battlecry_healer', name: 'Battlecry Healer', cost: 0, atk: 1, hp: 4, heal: 2, healOn: 'battlecry' });
  summon(s, 'enemy', getCard('sellsword')); s.events = []; triggerBattlecry(s, 'player', healer);
  assert.equal(s.events.some(event => event.type === 'heal'), false);
});

test('Scout permanently reduces only the opposing unit ATK by 2 for the combat', () => {
  const s = empty(), scout = summon(s, 'player', getCard('scout'));
  const target = summon(s, 'enemy', getCard('road_ogre'));
  const originalHp = effectiveStats(s, 'enemy', target).hp;
  s.events = []; triggerBattlecry(s, 'player', scout);
  assert.equal(effectiveStats(s, 'enemy', target).atk, 1);
  assert.equal(effectiveStats(s, 'enemy', target).hp, originalHp);
  assert.equal(target.baseAtk, 1);
  assert.deepEqual(
    (({ type, side, uid, unit, kind, targetUid, target, targetIndex, amount }) => ({ type, side, uid, unit, kind, targetUid, target, targetIndex, amount }))(s.events[0]),
    { type: 'battlecry', side: 'player', uid: scout.uid, unit: 'Scout', kind: 'oppositeAtkDown2', targetUid: target.uid, target: 'Road Ogre', targetIndex: 0, amount: -2 },
  );
  exchange(s, 'player', scout, target);
  assert.equal(effectiveStats(s, 'enemy', target).atk, 1);
});

test('Scout battlecry safely fizzles with no opposing unit', () => {
  const s = empty(), scout = summon(s, 'player', getCard('scout'));
  s.events = []; triggerBattlecry(s, 'player', scout);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].type, 'battlecry');
  assert.equal(s.events[0].targetUid, undefined);
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

test('Ashguard protects its formation aura with Divine Shield', () => {
  const fighter = { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 };
  const s = empty(), attacker = summon(s, 'player', fighter);
  const ashguard = summon(s, 'enemy', getCard('ashguard')), ally = summon(s, 'enemy', fighter);
  assert.equal(effectiveStats(s, 'enemy', ally).atk, 3);
  exchange(s, 'player', attacker, ashguard); assert.equal(ashguard.shield, false); assert.equal(ashguard.damage, 0);
  assert.equal(effectiveStats(s, 'enemy', ally).atk, 3);
});

test('Pit Tender is a common sacrifice bridge using the existing Cultist event contract', () => {
  const s = empty(), token = summon(s, 'player', { id: 'token', name: 'Token', cost: 0, atk: 1, hp: 1, token: true });
  const tender = summon(s, 'player', getCard('shield_saint')); s.events = [];
  triggerBattlecry(s, 'player', tender);
  assert.equal(token.damage, 999); assert.equal(tender.baseAtk, 2); assert.equal(tender.baseMaxHp, 5);
  assert.deepEqual(
    (({ type, kind, targetUid, targetIndex }) => ({ type, kind, targetUid, targetIndex }))(s.events[0]),
    { type: 'battlecry', kind: 'cultist', targetUid: token.uid, targetIndex: 0 },
  );
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
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s); runRound(s);
  const tokenSummon = s.events.find(event => event.type === 'summon' && event.unit === '1/2 Token');
  assert.ok(tokenSummon); assert.ok(s.events.some(event => event.type === 'summonPing' && event.targetUid === tokenSummon.uid));
  assert.equal(s.enemy.board.find(unit => unit.uid === tokenSummon.uid)?.damage, 1);
});

test('an entrant killed by Quillback Elder does not fire its Battlecry', () => {
  const s = empty(); summon(s, 'player', getCard('quillback_elder'));
  s.enemy.deck.push({ ...getCard('firebelcher'), cost: 1, hp: 1 });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s); runRound(s);
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
  const fighter = { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 };
  const s = empty(); const left = summon(s, 'player', fighter); const war = summon(s, 'player', getCard('warlord')); const right = summon(s, 'player', fighter);
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

test('Hexblade changes base stats without removing keywords or status', () => {
  const s = empty(); const hex = summon(s, 'player', getCard('hexblade')); const target = summon(s, 'enemy', getCard('aegis_knight'));
  target.poisoned = true; target.damage = 3; s.events = []; triggerBattlecry(s, 'player', hex);
  assert.equal(target.baseAtk, 1); assert.equal(target.baseMaxHp, 1); assert.equal(target.damage, 0);
  assert.equal(target.shield, true); assert.equal(target.poisoned, true);
});

test('Copycat copies effective ATK and remaining HP but no keywords', () => {
  const s = empty(); const copycat = summon(s, 'player', getCard('copycat')); const target = summon(s, 'enemy', getCard('aegis_knight'));
  target.baseAtk += 3; target.damage = 2; s.events = []; triggerBattlecry(s, 'player', copycat);
  assert.equal(copycat.baseAtk, 5); assert.equal(copycat.baseMaxHp, 5); assert.equal(copycat.damage, 0);
  assert.equal(copycat.shield, false); assert.deepEqual(copycat.keywords, []);
});

test('Cataclysm damages every living unit including itself', () => {
  const s = empty(); const ally = summon(s, 'player', getCard('sellsword')); const cataclysm = summon(s, 'player', getCard('cataclysm')); const enemy = summon(s, 'enemy', getCard('road_ogre'));
  s.events = []; triggerBattlecry(s, 'player', cataclysm);
  assert.equal(ally.damage, 2); assert.equal(cataclysm.damage, 2); assert.equal(enemy.damage, 2);
  assert.deepEqual(s.events[0].targetUids, [ally.uid, cataclysm.uid, enemy.uid]);
});

test('Bulwark Deathrattle reduces leftmost highest-ATK enemy by 2 even when its opposite is dead', () => {
  const s = empty(); const bulwark = summon(s, 'player', getCard('bulwark')); const deadOpposite = summon(s, 'enemy', getCard('sellsword'));
  const firstStrongest = summon(s, 'enemy', getCard('colossus')); const tiedStrongest = summon(s, 'enemy', getCard('colossus'));
  deadOpposite.dead = true; bulwark.damage = 99; s.events = []; resolveDeaths(s);
  assert.equal(firstStrongest.baseAtk, 4); assert.equal(tiedStrongest.baseAtk, 6);
  assert.deepEqual(
    (({ type, side, uid, unit, sourceUid, source, amount, reason }) => ({ type, side, uid, unit, sourceUid, source, amount, reason }))(s.events.find(event => event.type === 'statChange')),
    { type: 'statChange', side: 'enemy', uid: firstStrongest.uid, unit: 'Colossus', sourceUid: bulwark.uid, source: 'Bulwark', amount: -2, reason: 'deathrattle' },
  );
});

test('the five corrected cards publish the binding rules text', () => {
  assert.equal(getCard('bulwark').text, 'Deathrattle: the highest-ATK enemy loses 2 ATK.');
  assert.equal(getCard('gate_crasher').text, 'Battlecry: move the opposing unit to the end of its line.');
  assert.equal(getCard('copycat').text, "Battlecry: copy the opposing unit's current ATK and remaining HP.");
  assert.equal(getCard('cataclysm').text, 'Battlecry: deal 2 damage to every unit, including this one.');
  assert.equal(getCard('hexblade').text, "Battlecry: set the opposing unit's base ATK and HP to 1.");
});

test('Gravedigger summons at most three times for friendly non-token deaths without consuming the log', () => {
  const s = empty();
  assert.equal(getCard('gravedigger').text, 'Summon a 1/2 for each friendly non-token unit that died this combat, maximum 3.');
  for (let i = 0; i < 5; i++) { const unit = summon(s, 'player', getCard('sellsword')); unit.damage = 99; }
  resolveDeaths(s);

  const first = summon(s, 'player', getCard('gravedigger')); s.events = []; triggerBattlecry(s, 'player', first);
  assert.equal(s.player.board.filter(unit => unit.token && !unit.dead).length, 3);
  let summons = s.events.filter(event => event.type === 'summon');
  assert.equal(summons.length, 3);
  assert.ok(summons.every(event => event.side === 'player' && event.uid && event.unit === '1/2 Token'));

  const second = summon(s, 'player', getCard('gravedigger')); s.events = []; triggerBattlecry(s, 'player', second);
  assert.equal(s.player.board.filter(unit => unit.token && !unit.dead).length, 6);
  assert.equal(s.events.find(event => event.type === 'battlecry').count, 3);
  assert.equal(s.events.filter(event => event.type === 'summon').length, 3);
});

test('Gravedigger ignores friendly token deaths and all enemy deaths', () => {
  const s = empty();
  const friendlyToken = summon(s, 'player', tokenCard());
  const enemyUnit = summon(s, 'enemy', getCard('sellsword'));
  const enemyToken = summon(s, 'enemy', tokenCard());
  friendlyToken.damage = enemyUnit.damage = enemyToken.damage = 99;
  resolveDeaths(s);

  const gravedigger = summon(s, 'player', getCard('gravedigger')); s.events = []; triggerBattlecry(s, 'player', gravedigger);
  assert.equal(s.events.find(event => event.type === 'battlecry').count, 0);
  assert.equal(s.events.filter(event => event.type === 'summon').length, 0);
});

test('battlecries emit ordered source, target, change, and fizzle details', () => {
  let s = empty(), unit = summon(s, 'player', getCard('hex_hurler')); const opposite = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  let event = s.events[0]; assert.equal(event.type, 'battlecry'); assert.equal(event.uid, unit.uid); assert.equal(event.kind, 'hex_hurler');
  event = s.events[0]; assert.equal(event.targetUid, opposite.uid); assert.equal(event.amount, 2); assert.equal(s.events[1].type, 'damage');

  s = empty(); unit = summon(s, 'player', getCard('inquisitor')); summon(s, 'enemy', getCard('sellsword')); const strongest = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.battlecryAmount, 5); assert.equal(event.targetUid, strongest.uid); assert.equal(event.targetIndex, 1); assert.equal(event.amount, 5); assert.equal(strongest.damage, 5); assert.equal(s.events[1].type, 'damage');

  s = empty();
  const firstAlly = summon(s, 'player', { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 });
  const squireCorpse = summon(s, 'player', getCard('road_ogre')); squireCorpse.dead = true;
  const distantAlly = summon(s, 'player', getCard('oathbound'));
  unit = summon(s, 'player', getCard('squire')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0];
  assert.deepEqual(event.targetIndices, [0, 2]);
  assert.deepEqual(event.targetUids, [firstAlly.uid, distantAlly.uid]);
  assert.equal(event.fizzle, false);
  assert.equal(event.state.player.board[0].baseAtk, 2);
  assert.equal(event.state.player.board[2].baseAtk, 2);
  assert.equal(firstAlly.baseAtk, 3); assert.equal(firstAlly.baseMaxHp, 4);
  assert.equal(distantAlly.baseAtk, 3); assert.equal(distantAlly.baseMaxHp, 7);
  assert.equal(squireCorpse.baseAtk, 3); assert.equal(squireCorpse.baseMaxHp, 6);
  assert.equal(unit.baseAtk, 1); assert.equal(unit.baseMaxHp, 4);

  s = empty(); unit = summon(s, 'player', getCard('squire')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.deepEqual(event.targetUids, []); assert.equal(event.fizzle, true);

  s = empty(); unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 5); assert.equal(unit.baseMaxHp, 7); assert.equal(effectiveStats(s, 'player', unit).hp, 7); assert.equal(event.targetUid, unit.uid); assert.equal(event.amount, 2); assert.equal(event.applied, true); assert.equal(event.fizzle, false);

  s = empty(); summon(s, 'player', getCard('sellsword')); unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 3); assert.equal(unit.baseMaxHp, 5); assert.equal(event.amount, 0); assert.equal(event.applied, false); assert.equal(event.fizzle, true); assert.deepEqual(event.neighborIndices, [0]);

  s = empty(); const corpse = summon(s, 'player', getCard('sellsword')); corpse.dead = true; unit = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(unit.baseAtk, 5); assert.equal(unit.baseMaxHp, 7); assert.equal(event.applied, true); assert.deepEqual(event.neighborIndices, []);

  s = empty(); unit = summon(s, 'player', getCard('gate_crasher')); const moved = summon(s, 'enemy', getCard('sellsword')); summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
  event = s.events[0]; assert.equal(event.targetUid, moved.uid); assert.equal(event.fromIndex, 0); assert.equal(event.toIndex, 1);

});

test('positional effects resolve deterministic fallbacks and ignore corpse lanes', () => {
  let s = empty();
  const livingLeft = summon(s, 'player', { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 });
  const corpse = summon(s, 'player', getCard('road_ogre')); corpse.dead = true;
  const squire = summon(s, 'player', getCard('squire')); s.events = []; triggerBattlecry(s, 'player', squire);
  assert.equal(s.events[0].fizzle, false); assert.deepEqual(s.events[0].targetUids, [livingLeft.uid]);
  assert.equal(livingLeft.baseAtk, 3); assert.equal(livingLeft.baseMaxHp, 4);
  assert.equal(corpse.baseAtk, 3); assert.equal(corpse.baseMaxHp, 6);
  assert.equal(squire.baseAtk, 1); assert.equal(squire.baseMaxHp, 4);

  s = empty();
  const hurler = summon(s, 'player', getCard('hex_hurler'));
  const deadOpposite = summon(s, 'enemy', getCard('sellsword')); deadOpposite.dead = true;
  const rightmost = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', hurler);
  let event = s.events[0]; assert.equal(event.targetUid, rightmost.uid); assert.equal(event.targetIndex, 1); assert.equal(event.fallback, true); assert.equal(event.fizzle, false); assert.equal(rightmost.damage, 2);

  s = empty(); const loneHurler = summon(s, 'player', getCard('hex_hurler')); s.events = []; triggerBattlecry(s, 'player', loneHurler);
  event = s.events[0]; assert.equal(event.targetUid, undefined); assert.equal(event.fallback, false); assert.equal(event.fizzle, true);
});

test('Spiteful Imp deathrattle hits lowest effective HP with a leftmost tie break', () => {
  const s = empty();
  const imp = summon(s, 'player', getCard('spiteful_imp'));
  const tiedLeft = summon(s, 'enemy', getCard('sellsword')); tiedLeft.damage = 1;
  const tiedRight = summon(s, 'enemy', getCard('road_ogre')); tiedRight.damage = 4;
  const corpse = summon(s, 'enemy', { ...getCard('oathbound'), hp: 1 }); corpse.dead = true;
  imp.damage = 99; s.events = []; resolveDeaths(s);
  const damage = s.events.find(item => item.type === 'damage');
  assert.equal(damage.uid, tiedLeft.uid); assert.equal(damage.sourceUid, imp.uid); assert.equal(damage.source, 'Spiteful Imp');
  assert.equal(tiedLeft.damage, 2); assert.equal(tiedRight.damage, 4); assert.equal(corpse.damage, 0);
});

test('Duelist recovery bonus requires it to be the only living allied unit', () => {
  const s = empty();
  const living = summon(s, 'player', getCard('sellsword'));
  const corpse = summon(s, 'player', getCard('road_ogre')); corpse.dead = true;
  const duelist = summon(s, 'player', getCard('duelist')); s.events = []; triggerBattlecry(s, 'player', duelist);
  assert.equal(duelist.baseAtk, 3); assert.equal(duelist.baseMaxHp, 5); assert.equal(s.events[0].applied, false); assert.deepEqual(s.events[0].targetUids, [living.uid]);
});

test('Hexblade and Copycat remain exact-opposite without fallback', () => {
  for (const id of ['hexblade', 'copycat']) {
    const s = empty(), unit = summon(s, 'player', getCard(id));
    const corpse = summon(s, 'enemy', getCard('sellsword')); corpse.dead = true;
    const fallbackCandidate = summon(s, 'enemy', getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', unit);
    assert.equal(s.events[0].targetUid, undefined, id); assert.equal(fallbackCandidate.baseAtk, 6, id); assert.equal(fallbackCandidate.baseMaxHp, 9, id);
  }
});

test('positional card copy matches the targeting rules contract', () => {
  assert.equal(battlecryText(getCard('squire')), 'On deploy: give the ally immediately to the left +1/+1.');
  assert.equal(battlecryText(getCard('hex_hurler')), 'On deploy: deal 2 damage to the opposing unit, otherwise the rightmost enemy.');
});

test('Tax Collector gains mana before mutation and enables another immediate deploy', () => {
  const s = createFight({ playerDeck: [getCard('tax_collector'), getCard('sellsword')], enemyDeck: [], rng: () => 0.999 });
  runRound(s);
  assert.deepEqual(s.player.board.map(unit => unit.cardId), ['tax_collector', 'sellsword']);
  const change = s.events.find(event => event.type === 'manaChange');
  assert.equal(change.amount, 1); assert.equal(change.newPool, 1); assert.equal(change.state.player.mana, 0);
  assert.equal(s.player.mana, 0);
});

test('Chrono Imp drains enemy mana with a zero floor and emits the resolved delta before mutation', () => {
  const s = empty(), chrono = summon(s, 'player', getCard('chrono_imp'));
  s.enemy.mana = 2; s.events = []; triggerBattlecry(s, 'player', chrono);
  let change = s.events[0]; assert.equal(change.type, 'manaChange'); assert.equal(change.side, 'enemy');
  assert.equal(change.amount, -1); assert.equal(change.newPool, 1); assert.equal(change.state.enemy.mana, 2); assert.equal(s.enemy.mana, 1);
  s.enemy.mana = 0; s.events = []; triggerBattlecry(s, 'player', chrono);
  change = s.events[0]; assert.equal(change.amount, 0); assert.equal(change.newPool, 0); assert.equal(s.enemy.mana, 0);
});

test('Meddler top-bounces an opposite unit as a stripped fresh card', () => {
  const s = empty(), meddler = summon(s, 'player', getCard('meddler'));
  const target = summon(s, 'enemy', getCard('aegis_knight'));
  target.baseAtk += 5; target.baseMaxHp += 4; target.damage = 3; target.poisoned = true; target.shield = false;
  s.enemy.deck.push(getCard('colossus')); s.events = []; triggerBattlecry(s, 'player', meddler);
  const bounce = s.events[0]; assert.equal(bounce.type, 'bounce'); assert.equal(bounce.targetUid, target.uid);
  assert.equal(bounce.destination, 'top'); assert.equal(bounce.fizzle, false); assert.equal(bounce.state.enemy.board[0].uid, target.uid);
  assert.equal(s.enemy.board.length, 0); assert.deepEqual(s.enemy.deck.map(card => card.id), ['aegis_knight', 'colossus']);
  assert.deepEqual(s.events[1].removedUids, [target.uid]); assert.equal(s.events[1].reason, 'bounce');
  assert.equal(s.enemy.deck[0].atk, 2); assert.equal(s.enemy.deck[0].hp, 7); assert.ok(s.enemy.deck[0].keywords.includes('shield'));
  assert.equal('damage' in s.enemy.deck[0], false); assert.equal('poisoned' in s.enemy.deck[0], false);
});

test('Doomcaller bottom-bounces, fizzles without a target, and cannot bounce bosses', () => {
  let s = empty(), doom = summon(s, 'player', getCard('doomcaller'));
  const target = summon(s, 'enemy', getCard('sellsword')); s.enemy.deck.push(getCard('road_ogre'));
  s.events = []; triggerBattlecry(s, 'player', doom);
  assert.deepEqual(s.enemy.deck.map(card => card.id), ['road_ogre', 'sellsword']); assert.equal(s.events[0].destination, 'bottom');

  s = empty(); doom = summon(s, 'player', getCard('doomcaller')); s.events = []; triggerBattlecry(s, 'player', doom);
  assert.equal(s.events[0].fizzle, true); assert.equal(s.events[0].targetUid, undefined);

  s = empty(); doom = summon(s, 'player', getCard('doomcaller'));
  const boss = summon(s, 'enemy', { id: 'boss_test', name: 'Boss', cost: 0, atk: 1, hp: 8 }, { boss: 'herald' });
  s.events = []; triggerBattlecry(s, 'player', doom);
  assert.equal(s.events[0].fizzle, true); assert.equal(s.enemy.board[0], boss); assert.equal(s.enemy.deck.length, 0);
});

test('deck-out does nothing and stalemate valve draws on equal HP', () => {
  const s = empty(); runRound(s); assert.equal(s.over, false); runRound(s); assert.equal(s.over, true); assert.equal(s.winner, 'draw'); assert.equal(s.player.hp, HERO_HP);
});

test('regular enemies deploy from the top of their deterministic deck on enemy turns', () => {
  const first = createFight({ fight: 1 });
  assert.equal(first.enemy.board.length, 0); assert.equal(first.enemy.deck.length, 8);
  runRound(first); runRound(first);
  assert.equal(first.enemy.deck.length, 7); assert.equal(first.enemy.board[0].cardId, 'enemy_grunt');
  assert.ok(first.events.some(event => event.type === 'deploy' && event.side === 'enemy'));
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

test('Dagger Imp summons a 1/1 that waits through deploy round and acts next round', () => {
  const dagger = getCard('dagger_imp');
  assert.deepEqual([dagger.cost, dagger.atk, dagger.hp, dagger.battlecry], [1, 1, 2, 'summon11']);
  assert.equal(battlecryText(dagger), 'Battlecry: summon a 1/1 token.');
  const s = createFight({ playerDeck: [dagger], enemyDeck: [{ ...getCard('colossus'), cost: 99 }] });
  summon(s, 'enemy', { id: 'dummy', name: 'Dummy', cost: 0, atk: 0, hp: 100 });
  runRound(s);
  const token = s.player.board.find(unit => unit.token);
  assert.ok(token); assert.deepEqual([token.baseAtk, token.baseMaxHp], [1, 1]);
  assert.ok(s.events.some(event => event.type === 'battlecry' && event.kind === 'summon11'));
  assert.equal(s.events.some(event => event.type === 'attack' && event.uid === token.uid), false);
  runRound(s); runRound(s);
  assert.equal(s.events.some(event => event.type === 'attack' && event.uid === token.uid), true);
});

test('every scripted enemy card is common tier with per-fight stats', () => {
  for (const fight of [1, 2, 3]) assert.ok(enemyDeckFor(fight).every(card => card.tier === 'common'));
  const grunt = enemyDeckFor(1).find(card => card.id === 'enemy_grunt');
  assert.deepEqual([grunt.cost, grunt.atk, grunt.hp], [1, 2, 3]);
  const brute = enemyDeckFor(1).find(card => card.id === 'enemy_brute');
  assert.deepEqual([brute.cost, brute.atk, brute.hp], [2, 2, 6]);
  for (const fight of [2, 3]) {
    const support = enemyDeckFor(fight);
    assert.ok(support.filter(card => card.id === 'enemy_grunt').every(card => card.cost === 1 && card.atk === 2 && card.hp === 2 && card.tier === 'common'));
    assert.ok(support.filter(card => card.id === 'enemy_brute').every(card => card.cost === 2 && card.atk === 2 && card.hp === 5 && card.tier === 'common'));
  }
});

test('level-1 enemy script remains byte-identical to the pre-pass snapshot', () => {
  assert.equal(JSON.stringify(enemyDeckFor(1)), '[{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_brute","name":"Camp Brute","cost":2,"atk":2,"hp":6,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"},{"id":"enemy_brute","name":"Camp Brute","cost":2,"atk":2,"hp":6,"tier":"common"},{"id":"enemy_grunt","name":"Ash Grunt","cost":1,"atk":2,"hp":3,"tier":"common"}]');
  for (const level of [1, 2, 3, 5]) assert.ok(enemyDeckFor(level).every(card => card.tier === 'common'));
  for (let level = 6; level <= 10; level++) {
    const tiers = enemyDeckFor(level).map(card => card.tier);
    assert.ok(tiers.includes('common')); assert.ok(tiers.includes('rare')); assert.ok(!tiers.includes('mythic'));
  }
  for (let level = 11; level <= 15; level++) {
    const tiers = enemyDeckFor(level).map(card => card.tier);
    assert.ok(tiers.includes('common')); assert.ok(tiers.includes('rare')); assert.ok(tiers.includes('mythic'));
  }
  for (let level = 16; level <= RUN_CONFIG.LEVELS; level++) {
    assert.ok(enemyDeckFor(level).length > STARTERS[0].ids.length, `level ${level} deck should be thicker than the default player deck`);
  }
});

test('pre-milestone encounter scripts teach shield, death, poison, and formation mechanics', () => {
  const shield = enemyDeckFor(4).filter(card => card.id === 'enemy_shieldbearer');
  const death = enemyDeckFor(9).filter(card => card.id === 'enemy_cinder_wisp');
  const poison = enemyDeckFor(14).filter(card => card.id === 'enemy_venomguard');
  const formation = enemyDeckFor(19).filter(card => card.id === 'enemy_banner_captain');
  assert.equal(shield.length, 2); assert.ok(shield.every(card => card.keywords.includes('shield')));
  assert.equal(death.length, 2); assert.ok(death.every(card => card.deathrattle === 'summon11'));
  assert.equal(poison.length, 2); assert.ok(poison.every(card => card.keywords.includes('poisonous') && card.keywords.includes('shield')));
  assert.equal(formation.length, 2); assert.ok(formation.every(card => card.aura === 'adjacentAtk'));
  assert.match(encounterGuideFor(5).text, /permanently/);
  assert.match(encounterGuideFor(20).text, /removes the aura/);
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

test('starter-keystone Oathbound is never offered by ordinary drafts', () => {
  let value = 2026; const rng = () => ((value = value * 48271 % 2147483647) - 1) / 2147483646;
  const offered = Array.from({ length: 500 }, () => draftOffers(rng)).flat();
  assert.equal(offered.some(card => card.id === 'oathbound'), false);
  assert.deepEqual([getCard('sellsword').atk, getCard('sellsword').hp], [3, 3]);
  assert.deepEqual([getCard('quillback_elder').atk, getCard('quillback_elder').hp], [3, 10]);
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
  assert.equal(state.enemy.board.length, 1); assert.equal(state.enemy.board[0].name, 'Warherald'); assert.equal(state.enemy.board[0].boss, 'herald'); assert.equal(state.enemy.board[0].baseMaxHp, 8);
  assert.deepEqual(state.enemy.deck.map(card => card.id), ['enemy_grunt', 'enemy_grunt', 'enemy_brute', 'enemy_grunt', 'enemy_brute', 'enemy_grunt']);
  assert.equal(state.enemy.deck.length, 6); runRound(state); runRound(state);
  assert.ok(state.enemy.board.some(unit => unit.boss === 'herald')); assert.ok(state.enemy.board.some(unit => unit.cardId === 'enemy_grunt')); assert.equal(state.enemy.deck.length, 5);
});

test('fight-3 boss token appears only after attack damage and only with room', () => {
  const s = createFight({ fight: 3, playerDeck: [], enemyDeck: [] }); summon(s, 'player', getCard('sellsword'));
  assert.equal(s.enemy.board[0].name, 'Hivematron'); assert.equal(s.enemy.board[0].boss, 'hive');
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s); runRound(s);
  const attackAt = s.events.findIndex(e => e.type === 'attack' && e.unit === 'Hivematron'); const summonAt = s.events.findIndex((e, i) => i > attackAt && e.type === 'summon' && e.unit === '1/2 Token');
  assert.ok(attackAt >= 0 && summonAt > attackAt);
});

test('Hivematron has its documented body and caps living Hive tokens at three', () => {
  const s = createFight({ fight: 3, playerDeck: [], enemyDeck: [] });
  const boss = s.enemy.board[0];
  assert.deepEqual([boss.baseAtk, boss.baseMaxHp], [1, 8]);
  for (let i = 0; i < 3; i++) summon(s, 'enemy', tokenCard(), { hiveToken: true });
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 });
  runRound(s); runRound(s);
  assert.equal(s.enemy.board.filter(unit => !unit.dead && unit.hiveToken).length, 3);
});

test('fight-2 entry buff applies to tokens, not the pre-boarded boss', () => {
  const s = createFight({ fight: 2, playerDeck: [], enemyDeck: [] }); const boss = s.enemy.board[0], token = summon(s, 'enemy', tokenCard());
  assert.deepEqual([boss.baseAtk, boss.baseMaxHp], [1, 8]); assert.equal(token.baseAtk, 2); assert.equal(token.baseMaxHp, 3);
  boss.damage = 99; resolveDeaths(s);
  assert.deepEqual([token.baseAtk, token.baseMaxHp], [2, 3]);
});

test('card pool exposes the three rarity tiers and locked representative stats', () => {
  const oathbound = getCard('oathbound'), dagger = getCard('dagger_imp'), hexblade = getCard('hexblade'), copycat = getCard('copycat');
  assert.deepEqual([oathbound.atk, oathbound.hp], [2, 6]);
  assert.deepEqual([dagger.atk, dagger.hp], [1, 2]);
  assert.deepEqual([hexblade.cost, hexblade.atk, hexblade.hp], [2, 2, 6]);
  assert.deepEqual([copycat.cost, copycat.atk, copycat.hp], [2, 3, 6]);
  assert.deepEqual(Object.fromEntries(['common', 'rare', 'mythic'].map(tier => [tier, CARD_POOL.filter(card => card.tier === tier).length])), { common: 8, rare: 26, mythic: 9 });
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

test('corpses provide no aura and Hex Hurler falls back from a corpse lane', () => {
  const s = empty(), ally = summon(s, 'player', { id: 'fighter', name: 'Fighter', cost: 1, atk: 2, hp: 3 }), overlord = summon(s, 'player', getCard('overlord'));
  assert.equal(effectiveStats(s, 'player', ally).atk, 3);
  exchange(s, 'enemy', makeUnit({ id: 'finisher', name: 'Finisher', cost: 0, atk: 10, hp: 10 }, 'enemy'), overlord);
  assert.equal(overlord.dead, true); assert.equal(effectiveStats(s, 'player', ally).atk, 2);
  summon(s, 'enemy', getCard('sellsword')); const hurler = summon(s, 'enemy', getCard('hex_hurler')); s.events = []; triggerBattlecry(s, 'enemy', hurler);
  assert.equal(s.events[0].targetUid, ally.uid); assert.equal(s.events[0].fallback, true); assert.equal(s.events.find(event => event.type === 'damage').uid, ally.uid);
});

test('cleanup emits one batch shift for an affected side', () => {
  const s = empty(), first = summon(s, 'player', getCard('dagger_imp')), second = summon(s, 'player', getCard('dagger_imp'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), first); exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), second);
  runRound(s);
  const shifts = s.events.filter(event => event.type === 'shift' && event.side === 'player');
  assert.equal(shifts.length, 1); assert.deepEqual(shifts[0].removedUids, [first.uid, second.uid]); assert.equal(shifts[0].phase, 'cleanup');
});

test('end-of-turn cleanup clears both sides and emits one shift per affected side', () => {
  const s = empty(), playerCorpse = summon(s, 'player', getCard('sellsword')), enemyCorpse = summon(s, 'enemy', getCard('sellsword'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), playerCorpse); exchange(s, 'player', makeUnit(getCard('colossus')), enemyCorpse); s.events = [];
  runRound(s); const shifts = s.events.filter(event => event.type === 'shift');
  assert.deepEqual(shifts.map(event => event.side), ['player', 'enemy']); assert.deepEqual(shifts.map(event => event.removedUids), [[playerCorpse.uid], [enemyCorpse.uid]]);
  assert.equal(s.player.board.includes(playerCorpse), false); assert.equal(s.enemy.board.includes(enemyCorpse), false); assert.ok(shifts.every(event => event.phase === 'cleanup'));
});

test('deathrattle fires immediately at lethal while its corpse stays in lane', () => {
  const s = empty(), wisp = summon(s, 'player', getCard('brood_wisp')), killer = summon(s, 'enemy', getCard('colossus'));
  s.events = []; exchange(s, 'enemy', killer, wisp);
  const deathAt = s.events.findIndex(event => event.type === 'death' && event.uid === wisp.uid);
  const summonAt = s.events.findIndex((event, index) => index > deathAt && event.type === 'summon' && event.unit === '1/2 Token');
  assert.ok(deathAt >= 0 && summonAt > deathAt); assert.ok(s.player.board.includes(wisp)); assert.equal(wisp.dead, true);
});

test('stalemate valve ignores corpses when comparing round progress and resolves equal HP as a draw', () => {
  const s = empty(), corpse = summon(s, 'player', getCard('dagger_imp'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), corpse); s.events = [];
  runRound(s); runRound(s);
  assert.equal(s.over, true); assert.equal(s.winner, 'draw'); assert.equal(s.player.board.length, 0);
  assert.ok(s.events.some(event => event.type === 'stalemate' && event.reason === 'noProgress'));
});

test('ongoing face damage is progress even when live-unit count is unchanged', () => {
  const s = empty(); summon(s, 'player', { id: 'clock', name: 'Clock', cost: 0, atk: 1, hp: 99 });
  runRound(s); runRound(s);
  assert.equal(s.enemy.hp, HERO_HP - 1); assert.equal(s.over, false);
  assert.equal(s.events.some(event => event.type === 'stalemate'), false);
});

test('a frozen board with no state change draws symmetrically', () => {
  const play = swapped => {
    const s = empty();
    summon(s, swapped ? 'enemy' : 'player', { id: 'wall-a', name: 'Wall A', cost: 0, atk: 0, hp: 9 });
    summon(s, swapped ? 'player' : 'enemy', { id: 'wall-b', name: 'Wall B', cost: 0, atk: 0, hp: 9 });
    runRound(s); runRound(s); return s;
  };
  for (const s of [play(false), play(true)]) {
    assert.equal(s.over, true); assert.equal(s.winner, 'draw');
    assert.ok(s.events.some(event => event.type === 'stalemate' && event.reason === 'noProgress'));
  }
});

test('maximum-turn valve terminates progressing combat with the same symmetric result rule', () => {
  const s = empty(); summon(s, 'player', { id: 'clock', name: 'Clock', cost: 0, atk: 1, hp: 99 });
  s.turnNumber = MAX_COMBAT_TURNS - 1; s.activeSide = 'player'; runRound(s);
  assert.equal(s.over, true); assert.equal(s.winner, 'player');
  assert.ok(s.events.some(event => event.type === 'stalemate' && event.reason === 'turnLimit'));
});

test('two corpses compact once at cleanup and preserve live left-to-right order', () => {
  const s = empty(), deadA = summon(s, 'player', getCard('dagger_imp')), liveA = summon(s, 'player', getCard('sellsword'));
  const deadB = summon(s, 'player', getCard('dagger_imp')), liveB = summon(s, 'player', getCard('road_ogre'));
  exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), deadA); exchange(s, 'enemy', makeUnit(getCard('colossus'), 'enemy'), deadB);
  s.player.deck.push({ ...getCard('colossus'), cost: 99 }); s.enemy.deck.push({ ...getCard('colossus'), cost: 99 }); runRound(s);
  assert.deepEqual(s.player.board.map(unit => unit.uid), [liveA.uid, liveB.uid]);
  assert.equal(s.events.filter(event => event.type === 'shift' && event.side === 'player').length, 1);
});

test('turn events carry post-event view snapshots for deploys and deaths', () => {
  const s = createFight({ playerDeck: [getCard('sellsword')], enemyDeck: [getCard('sellsword')] });
  const events = [];
  while (!events.some(event => event.type === 'death')) { runRound(s); events.push(...s.events); }
  assert.ok(events.length > 0 && events.every(event => event.state));
  const deploy = events.find(event => event.type === 'deploy');
  assert.ok(deploy.state[deploy.side].board.some(unit => unit.uid === deploy.uid));
  const death = events.find(event => event.type === 'death');
  const corpse = death?.state[death.side].board.find(unit => unit.uid === death.uid);
  assert.ok(corpse?.dead);
  while (!events.some(event => event.type === 'shift' && event.side === death.side && event.removedUids.includes(death.uid))) { runRound(s); events.push(...s.events); }
  const shift = events.find(event => event.type === 'shift' && event.side === death.side && event.removedUids.includes(death.uid));
  assert.ok(shift && !shift.state[death.side].board.some(unit => unit.uid === death.uid));
  assert.deepEqual(Object.keys(death.state).sort(), ['activeSide', 'enemy', 'phase', 'player', 'round', 'turnNumber']);
  assert.deepEqual(Object.keys(death.state.player).sort(), ['board', 'deck', 'hp', 'mana']);
  assert.deepEqual(Object.keys(death.state.enemy).sort(), ['board', 'deck', 'hp', 'mana']);
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
