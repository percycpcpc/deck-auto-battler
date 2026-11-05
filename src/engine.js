export const HERO_HP = 40; // First tuning dial; K3 recommends 30.
export const BOARD_CAP = 20;
export const RUN_CONFIG = Object.freeze({ LEVELS: 20, PICKS_PER_DRAFT: 1, EVENT_EVERY: 3 });
import { ACTIVE_STARTERS as STARTERS, STARTER_IDS, activePool, currentSeason, unionPool } from './seasons.js';
export { ACTIVE_STARTERS as STARTERS, STARTER_IDS, unionPool } from './seasons.js';
const card = (id, name, cost, atk, hp, extra = {}) => ({ id, name, cost, atk, hp, ...extra });
export const CARD_POOL = unionPool();
const byId = new Map(CARD_POOL.map(c => [c.id, c]));
export const getCard = id => ({ ...byId.get(id), keywords: [...(byId.get(id)?.keywords || [])] });
export const starterDeck = () => STARTER_IDS.map(getCard);
export const tokenCard = (atk = 1, hp = 2) => card(`token_${atk}_${hp}`, `${atk}/${hp} Token`, 0, atk, hp, { token: true });

export function makeUnit(def, side = 'player', extras = {}, rng = Math.random) {
  return {
    uid: extras.uid || `${side}-${def.id}-${rng().toString(36).slice(2)}`,
    cardId: def.id, name: def.name, side, baseAtk: def.atk, baseMaxHp: def.hp,
    damage: 0, shield: (def.keywords || []).includes('shield'), poisoned: false,
    keywords: [...(def.keywords || [])], battlecry: def.battlecry, deathrattle: def.deathrattle,
    portraitId: def.portraitId,
    aura: def.aura, onKill: def.onKill, onDamaged: def.onDamaged, onSummonPing: def.onSummonPing,
    token: !!def.token, boss: extras.boss || null,
    summonedThisAction: false, ...extras,
  };
}

export function effectiveStats(state, side, unit) {
  let atk = unit.baseAtk, hpBonus = 0;
  const board = state[side].board;
  const index = board.indexOf(unit);
  for (let i = 0; i < board.length; i++) {
    if (board[i].dead) continue;
    const aura = board[i].aura;
    if (aura === 'adjacentAtk' && Math.abs(i - index) === 1) atk += 1;
    if (aura === 'all' && board[i] !== unit) { atk += 1; hpBonus += 1; }
  }
  return { atk, maxHp: unit.baseMaxHp + hpBonus, hp: unit.baseMaxHp + hpBonus - unit.damage };
}

export const liveUnits = board => board.filter(unit => !unit.dead);

export const fightBoss = (fight, rng = Math.random, milestonesOnly = false) => ((!milestonesOnly && fight === 2) || [5, 15].includes(fight))
  ? makeUnit(card('boss_warherald', 'Warherald', 0, 1, fight === 15 ? 3 : 5), 'enemy', { boss: 'herald', text: 'Friendly units enter play with +1/+1.' }, rng)
  : ((!milestonesOnly && fight === 3) || fight === 10)
    ? makeUnit(card('boss_hivematron', 'Hivematron', 0, 0, 4), 'enemy', { boss: 'hive', text: 'After this attacks, summon a 1/2 token.' }, rng)
    : fight === 20
      ? makeUnit(card('boss_broodmother', 'Broodmother', 0, 0, 5, { tier: 'mythic', aura: 'all' }), 'enemy', { boss: 'broodmother', text: 'Aura: all friendly units have +1/+1.' }, rng)
      : null;

export function makeRng(seed) {
  const rng = () => {
    let value = rng.state = (rng.state + 0x6D2B79F5) >>> 0;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  rng.state = seed >>> 0;
  return rng;
}

export function createFight({ playerDeck = starterDeck(), enemyDeck = null, fight = 1, playerHp = HERO_HP, rng = Math.random, seed, milestonesOnly = false } = {}) {
  const seeded = seed !== undefined;
  if (seeded) rng = makeRng(seed);
  const enemyLine = enemyDeck || enemyDeckFor(fight);
  const state = {
    fight, round: 0, phase: 'ready', rng, deaths: 0, events: [], over: false, winner: null,
    player: { hp: playerHp, deck: seeded ? shuffle(playerDeck, rng) : [...playerDeck], charger: null, board: [], scouted: false },
    enemy: { hp: HERO_HP, deck: [...enemyLine], charger: null, board: [], scouted: false },
  };
  if (seeded) state.uidRng = rng;
  const boss = fightBoss(fight, state.uidRng || Math.random, milestonesOnly);
  if (boss) state.enemy.board.push(boss);
  return state;
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const LEVEL_ONE_SCRIPT = Object.freeze(['grunt', 'grunt', 'brute', 'grunt', 'grunt', 'grunt', 'brute', 'grunt']);
const EARLY_SCRIPT_PATTERN = Object.freeze(['grunt', 'grunt', 'brute', 'grunt', 'brute']);
const SCRIPT_PATTERN = Object.freeze(['grunt', 'grunt', 'brute', 'grunt', 'grunt']);
function levelDeckSize(level) {
  if (level === 1) return 8;
  if (level <= 6 || level === 20) return 6;
  if ((level >= 10 && level <= 12) || (level >= 15 && level <= 19)) return 7;
  if (level === 7 || (level >= 13 && level <= 14)) return 8;
  return 10;
}
function enemyScriptFor(level) {
  if (level === 1) return LEVEL_ONE_SCRIPT;
  const size = levelDeckSize(level);
  const SCRIPT = level <= 4 ? EARLY_SCRIPT_PATTERN : SCRIPT_PATTERN;
  return Array.from({ length: size }, (_, index) => SCRIPT[index % SCRIPT.length]);
}
const enemyCard = (kind, level) => {
  if (level === 1) return kind === 'brute'
    ? card('enemy_brute', 'Camp Brute', 2, 2, 6, { tier: 'common' })
    : card('enemy_grunt', 'Ash Grunt', 1, 2, 3, { tier: 'common' });
  const band = level <= 6 ? 1 : level <= 12 ? 2 : level <= 19 ? 3 : 4;
  return kind === 'brute'
    ? card('enemy_brute', 'Camp Brute', 2, 2 + Math.floor(band / 2), 5 + band, { tier: 'common' })
    : card('enemy_grunt', 'Ash Grunt', 1, 2, 2 + band, { tier: 'common' });
};
export function enemyDeckFor(level) {
  const safeLevel = Math.min(RUN_CONFIG.LEVELS, Math.max(1, Number(level) || 1));
  const keyword = currentSeason().enemyKeyword;
  return enemyScriptFor(safeLevel).map(kind => ({ ...enemyCard(kind, safeLevel), ...(keyword ? { keywords: [keyword] } : {}) }));
}

export function gapKind(level) {
  if (level % RUN_CONFIG.EVENT_EVERY !== 0) return 'draft';
  return level / RUN_CONFIG.EVENT_EVERY % 2 === 1 ? 'remove' : 'transform';
}

const other = side => side === 'player' ? 'enemy' : 'player';
export function snapshotView(state) {
  return structuredClone({
    round: state.round,
    phase: state.phase,
    player: { hp: state.player.hp, board: state.player.board, charger: state.player.charger },
    enemy: { hp: state.enemy.hp, deck: state.enemy.deck, board: state.enemy.board, charger: state.enemy.charger },
  });
}

const emit = (s, type, data = {}) => s.events.push({ round: s.round, phase: s.phase, type, ...data, state: snapshotView(s) });

export function summon(state, side, def, extras = {}) {
  if (state[side].board.length >= BOARD_CAP) return null;
  const unit = makeUnit(def, side, extras, state.uidRng || Math.random);
  if (side === 'enemy' && liveUnits(state.enemy.board).some(u => u.boss === 'herald') && unit.boss !== 'herald') {
    unit.baseAtk += 1; unit.baseMaxHp += 1;
  }
  state[side].board.push(unit); emit(state, 'summon', { side, unit: unit.name, uid: unit.uid });
  const pingers = [...liveUnits(state.player.board), ...liveUnits(state.enemy.board)].filter(source => source !== unit && source.onSummonPing);
  for (const source of pingers) {
    emit(state, 'summonPing', { side: source.side, uid: source.uid, unit: source.name, targetSide: side, targetUid: unit.uid, target: unit.name, amount: source.onSummonPing });
    dealDamage(state, source, unit, source.onSummonPing);
  }
  if (pingers.length) resolveDeaths(state);
  return unit;
}

function dealDamage(state, source, target, amount) {
  if (!target || target.dead || amount <= 0) return false;
  if (target.shield) { target.shield = false; emit(state, 'shield', { unit: target.name, uid: target.uid }); return false; }
  target.damage += amount;
  if (source?.keywords?.includes('poisonous')) target.poisoned = true;
  emit(state, 'damage', { unit: target.name, uid: target.uid, amount });
  if (target.onDamaged && !target.poisoned && effectiveStats(state, target.side, target).hp > 0) {
    target.baseAtk += target.onDamaged;
    const stats = effectiveStats(state, target.side, target);
    emit(state, 'statChange', { side: target.side, uid: target.uid, unit: target.name, atk: stats.atk, hp: stats.hp, amount: target.onDamaged, reason: 'onDamaged' });
  }
  return true;
}

export function isDead(state, side, unit) { return !!unit?.dead || !!unit?.poisoned || effectiveStats(state, side, unit).hp <= 0; }

export function resolveDeaths(state) {
  const dead = { player: state.player.board.filter(u => !u.dead && isDead(state, 'player', u)), enemy: state.enemy.board.filter(u => !u.dead && isDead(state, 'enemy', u)) };
  if (!dead.player.length && !dead.enemy.length) return;
  const positions = new Map();
  for (const side of ['player', 'enemy']) state[side].board.forEach((unit, index) => positions.set(unit, index));
  for (const side of ['player', 'enemy']) for (const unit of dead[side]) {
    unit.dead = true;
    state.deaths++;
    emit(state, 'death', { side, unit: unit.name, uid: unit.uid });
  }
  // Binding order: player DRs, then enemy DRs; corpses keep their lanes until cleanup.
  for (const side of ['player', 'enemy']) for (const unit of dead[side]) triggerDeathrattle(state, side, unit, positions.get(unit));
  // DR damage may cascade.
  if (state.player.board.some(u => !u.dead && isDead(state, 'player', u)) || state.enemy.board.some(u => !u.dead && isDead(state, 'enemy', u))) resolveDeaths(state);
}

function cleanupCorpses(state) {
  for (const side of ['player', 'enemy']) {
    const removedUids = state[side].board.filter(unit => unit.dead).map(unit => unit.uid);
    if (!removedUids.length) continue;
    state[side].board = liveUnits(state[side].board);
    emit(state, 'shift', { side, removedUids });
  }
}

function triggerDeathrattle(state, side, unit, oldIndex) {
  const foe = other(side);
  if (unit.deathrattle === 'summon1') summon(state, side, tokenCard(), { summonedThisAction: true });
  if (unit.deathrattle === 'summon2x2') { summon(state, side, tokenCard(2, 3), { summonedThisAction: true }); summon(state, side, tokenCard(2, 3), { summonedThisAction: true }); }
  if (unit.deathrattle === 'spite') dealDamage(state, unit, liveAt(state[foe].board, oldIndex), 1);
  if (unit.deathrattle === 'plague') for (const target of liveUnits(state[foe].board)) dealDamage(state, unit, target, 1);
  if (unit.deathrattle === 'oppositeAtkDown') { const t = liveAt(state[foe].board, oldIndex); if (t) t.baseAtk = Math.max(0, t.baseAtk - 1); }
}

const liveAt = (board, index) => board[index]?.dead ? undefined : board[index];

function deployCharger(state, side) {
  const own = state[side];
  if (!own.charger || own.charger.counter > 0 || own.board.length >= BOARD_CAP) return false;
  const def = own.charger.card; own.charger = null; own.scouted = false;
  const unit = summon(state, side, def); emit(state, 'deploy', { side, unit: unit.name, uid: unit.uid });
  if (own.board.includes(unit) && !unit.dead) triggerBattlecry(state, side, unit);
  resolveDeaths(state); return true;
}

export function triggerBattlecry(state, side, unit) {
  const foeSide = other(side), own = state[side], foe = state[foeSide], index = own.board.indexOf(unit), opposite = liveAt(foe.board, index);
  const event = { side, uid: unit.uid, unit: unit.name, kind: unit.battlecry };
  switch (unit.battlecry) {
    case 'hex_hurler':
      emit(state, 'battlecry', { ...event, targetUid: opposite?.uid, target: opposite?.name, targetIndex: opposite ? index : undefined, amount: 2 });
      dealDamage(state, unit, opposite, 2); break;
    case 'tax':
      emit(state, 'battlecry', { ...event, targetSide: foeSide, counterDelta: foe.charger ? 1 : 0, charger: foe.charger?.card.name });
      if (foe.charger) foe.charger.counter += 1; break;
    case 'chrono': {
      const counterDelta = own.charger && own.charger.counter > 0 ? -1 : 0, deployed = !!own.charger && own.charger.counter === 1;
      emit(state, 'battlecry', { ...event, targetSide: side, counterDelta, charger: own.charger?.card.name, deployed });
      if (own.charger) { own.charger.counter = Math.max(0, own.charger.counter - 1); if (!own.charger.counter) deployCharger(state, side); } break;
    }
    case 'gate': {
      const moved = !!opposite && foe.board.length < BOARD_CAP, toIndex = moved ? foe.board.length - 1 : undefined;
      emit(state, 'battlecry', { ...event, targetUid: opposite?.uid, target: opposite?.name, fromIndex: moved ? index : undefined, toIndex, moved });
      if (moved) { foe.board.splice(index, 1); foe.board.push(opposite); } break;
    }
    case 'squire': {
      const neighbors = [index - 1, index + 1].filter(i => own.board[i] && !own.board[i].dead);
      emit(state, 'battlecry', { ...event, neighborIndices: neighbors, targetUids: neighbors.map(i => own.board[i].uid), targets: neighbors.map(i => own.board[i].name), amount: 1 });
      for (const i of neighbors) { own.board[i].baseAtk++; own.board[i].baseMaxHp++; } break;
    }
    case 'scout':
      emit(state, 'battlecry', { ...event, targetSide: foeSide, scouted: false, alreadyKnown: true }); break;
    case 'duelist': {
      const neighbors = [index - 1, index + 1].filter(i => own.board[i] && !own.board[i].dead), applied = neighbors.length === 0;
      emit(state, 'battlecry', { ...event, targetUid: unit.uid, target: unit.name, adjacent: neighbors.length, neighborIndices: neighbors, targetUids: neighbors.map(i => own.board[i].uid), targets: neighbors.map(i => own.board[i].name), amount: applied ? 2 : 0, applied, fizzle: !applied });
      if (applied) { unit.baseAtk += 2; unit.baseMaxHp += 2; } break;
    }
    case 'hexblade':
      emit(state, 'battlecry', { ...event, targetUid: opposite?.uid, target: opposite?.name, targetIndex: opposite ? index : undefined });
      if (opposite) { opposite.baseAtk = 1; opposite.baseMaxHp = 1; opposite.damage = 0; } break;
    case 'gravedigger': {
      const count = Math.min(state.deaths, BOARD_CAP - own.board.length);
      emit(state, 'battlecry', { ...event, count });
      for (let i = 0; i < state.deaths; i++) summon(state, side, tokenCard()); break;
    }
    case 'meddler':
      emit(state, 'battlecry', { ...event, targetSide: foeSide, charger: foe.charger?.card.name, returned: !!foe.charger });
      if (foe.charger) { foe.deck.unshift(foe.charger.card); foe.charger = null; foe.scouted = false; } break;
    case 'inquisitor': {
      const targets = liveUnits(foe.board), highest = targets.length ? Math.max(...targets.map(t => effectiveStats(state, foeSide, t).atk)) : null;
      const target = highest === null ? null : targets.find(t => effectiveStats(state, foeSide, t).atk === highest);
      emit(state, 'battlecry', { ...event, targetUid: target?.uid, target: target?.name, targetIndex: target ? targets.indexOf(target) : undefined, amount: 3 });
      dealDamage(state, unit, target, 3); break;
    }
    case 'doom':
      emit(state, 'battlecry', { ...event, targetSide: foeSide, charger: foe.charger?.card.name, destroyed: !!foe.charger });
      if (foe.charger) { emit(state, 'chargerDestroyed', { side: foeSide }); foe.charger = null; foe.scouted = false; } break;
    case 'copycat':
      emit(state, 'battlecry', { ...event, targetUid: opposite?.uid, target: opposite?.name, targetIndex: opposite ? index : undefined });
      if (opposite) { const e = effectiveStats(state, foeSide, opposite); unit.baseAtk = e.atk; unit.baseMaxHp = e.hp; unit.damage = 0; } break;
    case 'cultist': {
      const victim = own.board.find(x => x !== unit && !x.dead);
      emit(state, 'battlecry', { ...event, targetUid: victim?.uid, target: victim?.name, targetIndex: victim ? own.board.indexOf(victim) : undefined });
      if (victim) { const e = effectiveStats(state, side, victim); unit.baseAtk += e.atk; unit.baseMaxHp += e.hp; victim.damage = 999; } break;
    }
    case 'cataclysm': {
      const targets = [...liveUnits(state.player.board), ...liveUnits(state.enemy.board)];
      emit(state, 'battlecry', { ...event, all: true, targetUids: targets.map(target => target.uid), amount: 2 });
      for (const target of targets) dealDamage(state, unit, target, 2); break;
    }
    case 'firebelch': {
      const targets = liveUnits(foe.board);
      emit(state, 'battlecry', { ...event, all: true, targetSide: foeSide, targetUids: targets.map(target => target.uid), amount: 1 });
      for (const target of targets) dealDamage(state, unit, target, 1); break;
    }
  }
}

export function exchange(state, side, attacker, defender) {
  const foe = other(side), aAtk = effectiveStats(state, side, attacker).atk, dAtk = effectiveStats(state, foe, defender).atk;
  dealDamage(state, attacker, defender, aAtk); dealDamage(state, defender, attacker, dAtk);
  const defenderDied = isDead(state, foe, defender);
  const growth = attacker.onKill === 'grow' ? 1 : Number(attacker.onKill) || 0;
  if (defenderDied && growth) {
    attacker.baseAtk += growth; attacker.baseMaxHp += growth;
    const stats = effectiveStats(state, side, attacker);
    emit(state, 'statChange', { side, uid: attacker.uid, unit: attacker.name, atk: stats.atk, hp: stats.hp, amount: growth, reason: 'onKill' });
  }
  resolveDeaths(state);
}

function actionFor(state, side, index, acted) {
  const unit = state[side].board[index];
  if (!unit || unit.dead || acted.has(unit.uid) || unit.summonedThisAction) return;
  acted.add(unit.uid);
  const count = unit.keywords.includes('windfury') ? 2 : 1;
  for (let hit = 0; hit < count; hit++) {
    if (!state[side].board.includes(unit) || unit.dead) break;
    const current = state[side].board.indexOf(unit), foe = other(side), target = liveAt(state[foe].board, current);
    emit(state, 'attack', { side, unit: unit.name, uid: unit.uid, target: target?.name || 'hero', targetUid: target?.uid });
    if (target) exchange(state, side, unit, target);
    else { state[foe].hp -= effectiveStats(state, side, unit).atk; emit(state, 'heroHit', { side: foe, amount: effectiveStats(state, side, unit).atk }); }
    if (unit.boss === 'hive') summon(state, side, tokenCard(), { summonedThisAction: true });
    checkHeroEnd(state); if (state.over) break;
  }
}

export function runRound(state) {
  if (state.over) return state;
  state.round++; state.events = []; const beforeUnits = liveUnits(state.player.board).length + liveUnits(state.enemy.board).length;
  state.phase = 'reveal';
  for (const side of ['player', 'enemy']) if (!state[side].charger && state[side].deck.length) {
    const next = state[side].deck.shift(); state[side].charger = { card: next, counter: next.cost, justRevealed: true }; emit(state, 'reveal', { side, cost: next.cost });
  }
  state.phase = 'tick';
  for (const side of ['player', 'enemy']) if (state[side].charger) {
    if (!state[side].charger.justRevealed) state[side].charger.counter = Math.max(0, state[side].charger.counter - 1);
    state[side].charger.justRevealed = false; emit(state, 'tick', { side, counter: state[side].charger.counter });
  }
  state.phase = 'deploy'; deployCharger(state, 'player'); deployCharger(state, 'enemy');
  state.phase = 'action'; const acted = new Set();
  for (const s of ['player', 'enemy']) for (const u of state[s].board) u.summonedThisAction = false;
  for (const side of ['player', 'enemy']) {
    if (state.over) break;
    emit(state, 'turnStart', { side });
    let i = 0;
    while (!state.over && i < state[side].board.length) {
      const unit = state[side].board[i];
      actionFor(state, side, i, acted);
      if (state[side].board[i] === unit) i++;
    }
  }
  state.phase = 'cleanup'; emit(state, 'cleanup'); resolveDeaths(state); cleanupCorpses(state); checkHeroEnd(state);
  const afterUnits = liveUnits(state.player.board).length + liveUnits(state.enemy.board).length;
  if (!state.over && !state.player.deck.length && !state.enemy.deck.length && !state.player.charger && !state.enemy.charger && beforeUnits === afterUnits) {
    state.over = true; state.winner = state.player.hp >= state.enemy.hp ? 'player' : 'enemy'; emit(state, 'stalemate', { winner: state.winner });
  }
  return state;
}

function checkHeroEnd(state) {
  if (state.player.hp <= 0 || state.enemy.hp <= 0) { state.over = true; state.winner = state.player.hp > 0 ? 'player' : state.enemy.hp > 0 ? 'enemy' : 'player'; }
}

export function draftOffers(rng = Math.random) {
  const tiers = [['common', 0.5], ['rare', 0.85], ['mythic', 1]];
  const offered = [];
  const draw = () => {
    const roll = rng(), tier = tiers.find(([, ceiling]) => roll < ceiling)?.[0] || 'mythic';
    const pool = activePool(), cards = pool.filter(card => card.tier === tier);
    return getCard(cards[Math.min(cards.length - 1, Math.floor(rng() * cards.length))].id);
  };
  while (offered.length < 3) {
    let card;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = draw();
      if (!offered.some(existing => existing.id === candidate.id)) { card = candidate; break; }
    }
    if (!card) {
      const remaining = activePool().filter(candidate => !offered.some(existing => existing.id === candidate.id));
      card = getCard(remaining[Math.min(remaining.length - 1, Math.floor(rng() * remaining.length))].id);
    }
    offered.push(card);
  }
  return offered;
}

export function createRun(rng = Math.random, starterId = STARTERS[0].id) {
  const starter = STARTERS.find(candidate => candidate.id === starterId) || STARTERS[0];
  return { fight: 1, hp: HERO_HP, deck: starter.ids.map(getCard), rng, enemyLine: null, won: false, lost: false, starterId: starter.id };
}
export function startRunFight(run) {
  const enemyLine = run.enemyLine || enemyDeckFor(run.fight);
  run.enemyLine = null;
  return createFight({ fight: run.fight, playerDeck: shuffle(run.deck, run.rng), enemyDeck: enemyLine, rng: run.rng, milestonesOnly: true });
}
export function finishRunFight(run, fightState) {
  run.hp = Math.max(0, fightState.player.hp);
  if (fightState.winner !== 'player') run.lost = true;
  else if (run.fight === RUN_CONFIG.LEVELS) run.won = true;
  else { run.fight++; run.enemyLine = enemyDeckFor(run.fight); }
  return run;
}

export function runEndSnapshot(run) {
  return Object.freeze({
    starterId: run.starterId || STARTERS[0].id,
    cardIds: Object.freeze(run.deck.map(card => card.id)),
    won: run.won,
    lost: run.lost,
    levelReached: run.fight,
    hpLeft: run.hp,
    takenAt: new Date().toISOString(),
  });
}
