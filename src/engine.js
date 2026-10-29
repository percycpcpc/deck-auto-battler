export const HERO_HP = 40; // First tuning dial; K3 recommends 30.
export const BOARD_CAP = 20;

const card = (id, name, cost, atk, hp, extra = {}) => ({ id, name, cost, atk, hp, ...extra });

export const CARD_POOL = [
  card('dagger_imp', 'Dagger Imp', 1, 2, 1), card('sellsword', 'Sellsword', 1, 2, 2),
  card('twinfang', 'Twinfang', 1, 1, 1, { keywords: ['windfury'] }),
  card('brood_wisp', 'Brood Wisp', 1, 1, 2, { deathrattle: 'summon1' }),
  card('hex_hurler', 'Hex Hurler', 1, 1, 1, { battlecry: 'hex_hurler' }),
  card('tax_collector', 'Tax Collector', 1, 1, 2, { battlecry: 'tax' }),
  card('chrono_imp', 'Chrono Imp', 1, 1, 1, { battlecry: 'chrono' }),
  card('gate_crasher', 'Gate Crasher', 1, 2, 1, { battlecry: 'gate' }),
  card('leeching_tick', 'Leeching Tick', 1, 1, 2, { onKill: 'grow' }),
  card('squire', 'Squire', 1, 1, 1, { battlecry: 'squire' }),
  card('spiteful_imp', 'Spiteful Imp', 1, 1, 1, { deathrattle: 'spite' }),
  card('scout', 'Scout', 1, 2, 1, { battlecry: 'scout' }),
  card('road_ogre', 'Road Ogre', 2, 3, 4),
  card('aegis_knight', 'Aegis Knight', 2, 2, 4, { keywords: ['shield'] }),
  card('venom_hound', 'Venom Hound', 2, 3, 2, { keywords: ['poisonous'] }),
  card('plague_bearer', 'Plague Bearer', 2, 2, 3, { deathrattle: 'plague' }),
  card('warlord', 'Warlord', 2, 2, 3, { aura: 'adjacentAtk' }),
  card('bulwark', 'Bulwark', 2, 1, 5, { deathrattle: 'oppositeAtkDown' }),
  card('duelist', 'Duelist', 2, 3, 2, { battlecry: 'duelist' }),
  card('hexblade', 'Hexblade', 2, 2, 1, { battlecry: 'hexblade' }),
  card('gravedigger', 'Gravedigger', 2, 2, 2, { battlecry: 'gravedigger' }),
  card('meddler', 'Meddler', 2, 2, 2, { battlecry: 'meddler' }),
  card('colossus', 'Colossus', 3, 6, 6),
  card('inquisitor', 'Inquisitor', 3, 4, 5, { battlecry: 'inquisitor' }),
  card('brood_queen', 'Brood Queen', 3, 3, 6, { deathrattle: 'summon2x2' }),
  card('doomcaller', 'Doomcaller', 3, 4, 4, { battlecry: 'doom' }),
  card('copycat', 'Copycat', 3, 3, 3, { battlecry: 'copycat' }),
  card('overlord', 'Overlord', 3, 2, 4, { aura: 'all' }),
  card('cultist', 'Cultist', 3, 3, 2, { battlecry: 'cultist' }),
  card('cataclysm', 'Cataclysm', 3, 1, 1, { battlecry: 'cataclysm' }),
];

export const STARTER_IDS = ['dagger_imp', 'sellsword', 'sellsword', 'brood_wisp', 'twinfang', 'hex_hurler', 'squire', 'road_ogre'];
const byId = new Map(CARD_POOL.map(c => [c.id, c]));
export const getCard = id => ({ ...byId.get(id), keywords: [...(byId.get(id)?.keywords || [])] });
export const starterDeck = () => STARTER_IDS.map(getCard);
export const tokenCard = (atk = 1, hp = 1) => card(`token_${atk}_${hp}`, `${atk}/${hp} Token`, 0, atk, hp, { token: true });

export function makeUnit(def, side = 'player', extras = {}) {
  return {
    uid: extras.uid || `${side}-${def.id}-${Math.random().toString(36).slice(2)}`,
    cardId: def.id, name: def.name, side, baseAtk: def.atk, baseMaxHp: def.hp,
    damage: 0, shield: (def.keywords || []).includes('shield'), poisoned: false,
    keywords: [...(def.keywords || [])], battlecry: def.battlecry, deathrattle: def.deathrattle,
    aura: def.aura, onKill: def.onKill, token: !!def.token, boss: extras.boss || null,
    summonedThisAction: false, ...extras,
  };
}

export function effectiveStats(state, side, unit) {
  let atk = unit.baseAtk, hpBonus = 0;
  const board = state[side].board;
  const index = board.indexOf(unit);
  for (let i = 0; i < board.length; i++) {
    const aura = board[i].aura;
    if (aura === 'adjacentAtk' && Math.abs(i - index) === 1) atk += 1;
    if (aura === 'all' && board[i] !== unit) { atk += 1; hpBonus += 1; }
  }
  return { atk, maxHp: unit.baseMaxHp + hpBonus, hp: unit.baseMaxHp + hpBonus - unit.damage };
}

export function createFight({ playerDeck = starterDeck(), enemyDeck = enemyDeckFor(1), fight = 1, playerHp = HERO_HP, rng = Math.random } = {}) {
  const state = {
    fight, round: 0, phase: 'ready', rng, deaths: 0, events: [], over: false, winner: null,
    player: { hp: playerHp, deck: [...playerDeck], charger: null, board: [], scouted: false },
    enemy: { hp: HERO_HP, deck: [...enemyDeck], charger: null, board: [], scouted: false },
  };
  if (fight === 2) state.enemy.board.push(makeUnit(card('boss_hivematron', 'Hivematron', 0, 1, 10), 'enemy', { boss: 'hive' }));
  if (fight === 3) state.enemy.board.push(makeUnit(card('boss_warherald', 'Warherald', 0, 1, 10), 'enemy', { boss: 'herald' }));
  return state;
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function enemyDeckFor(fight, rng = Math.random) {
  let shell = [...Array(6)].map(() => card('enemy_grunt', 'Ash Grunt', 1, 2, 1))
    .concat([...Array(2)].map(() => card('enemy_brute', 'Camp Brute', 2, 2, 3)));
  if (fight > 1) shell.splice(Math.floor(rng() * shell.length), 1);
  return shuffle(shell, rng);
}

const other = side => side === 'player' ? 'enemy' : 'player';
const emit = (s, type, data = {}) => s.events.push({ round: s.round, phase: s.phase, type, ...data });

export function summon(state, side, def, extras = {}) {
  if (state[side].board.length >= BOARD_CAP) return null;
  const unit = makeUnit(def, side, extras);
  if (side === 'enemy' && state.fight === 3 && state.enemy.board.some(u => u.boss === 'herald') && unit.boss !== 'herald') {
    unit.baseAtk += 1; unit.baseMaxHp += 1;
  }
  state[side].board.push(unit); emit(state, 'summon', { side, unit: unit.name });
  return unit;
}

function dealDamage(state, source, target, amount) {
  if (!target || amount <= 0) return false;
  if (target.shield) { target.shield = false; emit(state, 'shield', { unit: target.name }); return false; }
  target.damage += amount;
  if (source?.keywords?.includes('poisonous')) target.poisoned = true;
  emit(state, 'damage', { unit: target.name, amount }); return true;
}

function isDead(state, side, unit) { return unit.poisoned || effectiveStats(state, side, unit).hp <= 0; }

export function resolveDeaths(state) {
  const dead = { player: state.player.board.filter(u => isDead(state, 'player', u)), enemy: state.enemy.board.filter(u => isDead(state, 'enemy', u)) };
  if (!dead.player.length && !dead.enemy.length) return;
  const positions = new Map([...state.player.board, ...state.enemy.board].map((u, i) => [u, i]));
  state.player.board = state.player.board.filter(u => !dead.player.includes(u));
  state.enemy.board = state.enemy.board.filter(u => !dead.enemy.includes(u));
  for (const side of ['player', 'enemy']) for (const unit of dead[side]) { state.deaths++; emit(state, 'death', { side, unit: unit.name }); }
  // Binding order: player DRs, then enemy DRs; boards have already shifted.
  for (const side of ['player', 'enemy']) for (const unit of dead[side]) triggerDeathrattle(state, side, unit, positions.get(unit));
  emit(state, 'shift');
  // DR damage may cascade.
  if (state.player.board.some(u => isDead(state, 'player', u)) || state.enemy.board.some(u => isDead(state, 'enemy', u))) resolveDeaths(state);
}

function triggerDeathrattle(state, side, unit, oldIndex) {
  const foe = other(side);
  if (unit.deathrattle === 'summon1') summon(state, side, tokenCard(), { summonedThisAction: true });
  if (unit.deathrattle === 'summon2x2') { summon(state, side, tokenCard(2, 2), { summonedThisAction: true }); summon(state, side, tokenCard(2, 2), { summonedThisAction: true }); }
  if (unit.deathrattle === 'spite') dealDamage(state, unit, state[foe].board[oldIndex], 1);
  if (unit.deathrattle === 'plague') for (const target of [...state[foe].board]) dealDamage(state, unit, target, 1);
  if (unit.deathrattle === 'oppositeAtkDown') { const t = state[foe].board[oldIndex]; if (t) t.baseAtk = Math.max(0, t.baseAtk - 1); }
}

function deployCharger(state, side) {
  const own = state[side];
  if (!own.charger || own.charger.counter > 0 || own.board.length >= BOARD_CAP) return false;
  const def = own.charger.card; own.charger = null; own.scouted = false;
  const unit = summon(state, side, def); emit(state, 'deploy', { side, unit: unit.name });
  triggerBattlecry(state, side, unit); resolveDeaths(state); return true;
}

export function triggerBattlecry(state, side, unit) {
  const own = state[side], foe = state[other(side)], index = own.board.indexOf(unit), opposite = foe.board[index];
  switch (unit.battlecry) {
    case 'hex_hurler': dealDamage(state, unit, opposite, 2); break;
    case 'tax': if (foe.charger) foe.charger.counter += 1; break;
    case 'chrono': if (own.charger) { own.charger.counter = Math.max(0, own.charger.counter - 1); if (!own.charger.counter) deployCharger(state, side); } break;
    case 'gate': if (opposite && foe.board.length < BOARD_CAP) { foe.board.splice(index, 1); foe.board.push(opposite); } break;
    case 'squire': for (const i of [index - 1, index + 1]) if (own.board[i]) { own.board[i].baseAtk++; own.board[i].baseMaxHp++; } break;
    case 'scout': if (foe.charger) foe.scouted = true; break;
    case 'duelist': { const n = Number(!!own.board[index - 1]) + Number(!!own.board[index + 1]); unit.baseAtk += n; unit.baseMaxHp += n; break; }
    case 'hexblade': if (opposite) { opposite.baseAtk = 1; opposite.baseMaxHp = 1; opposite.damage = 0; } break;
    case 'gravedigger': for (let i = 0; i < state.deaths; i++) summon(state, side, tokenCard()); break;
    case 'meddler': if (foe.charger) { foe.deck.unshift(foe.charger.card); foe.charger = null; foe.scouted = false; } break;
    case 'inquisitor': { const targets = foe.board; if (targets.length) { const highest = Math.max(...targets.map(t => effectiveStats(state, other(side), t).atk)); dealDamage(state, unit, targets.find(t => effectiveStats(state, other(side), t).atk === highest), 3); } break; }
    case 'doom': if (foe.charger) { emit(state, 'chargerDestroyed', { side: other(side) }); foe.charger = null; foe.scouted = false; } break;
    case 'copycat': if (opposite) { const e = effectiveStats(state, other(side), opposite); unit.baseAtk = e.atk; unit.baseMaxHp = e.hp; unit.damage = 0; } break;
    case 'cultist': { const victim = own.board.find(x => x !== unit); if (victim) { const e = effectiveStats(state, side, victim); unit.baseAtk += e.atk; unit.baseMaxHp += e.hp; victim.damage = 999; } break; }
    case 'cataclysm': for (const s of ['player', 'enemy']) for (const target of [...state[s].board]) dealDamage(state, unit, target, 2); break;
  }
}

export function exchange(state, side, attacker, defender) {
  const foe = other(side), aAtk = effectiveStats(state, side, attacker).atk, dAtk = effectiveStats(state, foe, defender).atk;
  dealDamage(state, attacker, defender, aAtk); dealDamage(state, defender, attacker, dAtk);
  const defenderDied = isDead(state, foe, defender);
  if (defenderDied && attacker.onKill === 'grow') { attacker.baseAtk++; attacker.baseMaxHp++; }
  resolveDeaths(state);
}

function actionFor(state, side, index, acted) {
  const unit = state[side].board[index];
  if (!unit || acted.has(unit.uid) || unit.summonedThisAction) return;
  acted.add(unit.uid);
  const count = unit.keywords.includes('windfury') ? 2 : 1;
  for (let hit = 0; hit < count; hit++) {
    if (!state[side].board.includes(unit)) break;
    const current = state[side].board.indexOf(unit), foe = other(side), target = state[foe].board[current];
    emit(state, 'attack', { side, unit: unit.name, target: target?.name || 'hero' });
    if (target) exchange(state, side, unit, target);
    else { state[foe].hp -= effectiveStats(state, side, unit).atk; emit(state, 'heroHit', { side: foe, amount: effectiveStats(state, side, unit).atk }); }
    if (unit.boss === 'hive') summon(state, side, tokenCard(), { summonedThisAction: true });
    checkHeroEnd(state); if (state.over) break;
  }
}

export function runRound(state) {
  if (state.over) return state;
  state.round++; state.events = []; const beforeUnits = state.player.board.length + state.enemy.board.length;
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
  let i = 0;
  while (!state.over && i < Math.max(state.player.board.length, state.enemy.board.length)) { actionFor(state, 'player', i, acted); if (!state.over) actionFor(state, 'enemy', i, acted); i++; }
  state.phase = 'cleanup'; emit(state, 'cleanup'); resolveDeaths(state); checkHeroEnd(state);
  const afterUnits = state.player.board.length + state.enemy.board.length;
  if (!state.over && !state.player.deck.length && !state.enemy.deck.length && !state.player.charger && !state.enemy.charger && beforeUnits === afterUnits) {
    state.over = true; state.winner = state.player.hp >= state.enemy.hp ? 'player' : 'enemy'; emit(state, 'stalemate', { winner: state.winner });
  }
  return state;
}

function checkHeroEnd(state) {
  if (state.player.hp <= 0 || state.enemy.hp <= 0) { state.over = true; state.winner = state.player.hp > 0 ? 'player' : state.enemy.hp > 0 ? 'enemy' : 'player'; }
}

export function draftOffers(rng = Math.random) { return Array.from({ length: 3 }, () => getCard(CARD_POOL[Math.floor(rng() * CARD_POOL.length)].id)); }

export function createRun(rng = Math.random) { return { fight: 1, hp: HERO_HP, deck: starterDeck(), rng, won: false, lost: false }; }
export function startRunFight(run) { return createFight({ fight: run.fight, playerHp: run.hp, playerDeck: shuffle(run.deck, run.rng), enemyDeck: enemyDeckFor(run.fight, run.rng), rng: run.rng }); }
export function finishRunFight(run, fightState) {
  run.hp = Math.max(0, fightState.player.hp);
  if (fightState.winner !== 'player') run.lost = true;
  else if (run.fight === 3) run.won = true;
  else run.fight++;
  return run;
}
