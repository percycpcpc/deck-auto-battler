import { CARD_POOL, createRun, draftOffers, effectiveStats, finishRunFight, runRound, snapshotView, startRunFight } from './engine.js';

// CONSTANTS
export const TIMING = Object.freeze({ reveal: 300, tick: 250, deploy: 400, attack: 350, damage: 200, death: 400, shift: 300, heroHit: 250, shield: 250, summon: 250, chargerDestroyed: 250, stalemate: 400, cleanup: 55, stagger: 40, scout: 1500, floater: 600 });
const SIDES = ['enemy', 'player'];
const HERO_MAX = 40;
const app = typeof document === 'undefined' ? null : document.querySelector('#app');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const portrait = id => `assets/portrait_${id}.png`;
const frameFor = cost => `assets/frame_cost${Math.max(1, Math.min(3, cost || 1))}.png`;
const iconFor = key => ({ shield: 'icon_ds.png', poisonous: 'icon_poison.png', windfury: 'icon_wf.png' }[key]);
const definitionFor = unit => CARD_POOL.find(card => card.id === unit?.cardId) || unit;
const unitPortrait = unit => unit?.boss ? portrait(`boss_${unit.boss === 'hive' ? 'hivematron' : 'warherald'}`) : unit?.token ? portrait('brood_wisp') : unit?.cardId === 'enemy_grunt' ? portrait('sellsword') : unit?.cardId === 'enemy_brute' ? portrait('road_ogre') : portrait(unit?.cardId || unit?.id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const img = (className, src, alt = '') => { const node = el('img', className); node.src = src; node.alt = alt; return node; };

let run, fight, stopped = false, els = null, slotWidth = 128, slotGap = 12, slotPitch = 140, lastSnapshot = null;
let deckQueues = { player: [], enemy: [] };

// MOUNT
function createCostDot(cost, withCount = false, count = 0) {
  const dot = el('span', `cost-dot cost-dot--t${Math.max(1, Math.min(3, cost || 1))}`, String(cost));
  if (withCount) dot.append(el('span', 'cost-dot__count', String(count)));
  return dot;
}

function createFace(card, classes = '') {
  const node = el('div', `card-face ${classes}`.trim());
  const def = definitionFor(card);
  node.append(img('card__art', unitPortrait(card), ''), img('card__frame', frameFor(def?.cost), ''), el('span', 'card__name', card?.name || def?.name || 'Unit'));
  return node;
}

function createBack(cost, classes = '') {
  const node = el('div', `card-back ${classes}`.trim());
  node.append(img('card-back__image', 'assets/card_back.png', 'Hidden card'), createCostDot(cost));
  return node;
}

function createDeckStack(side) {
  const stack = el('div', `deck-stack deck-stack--${side}`);
  for (let n = 1; n <= 3; n++) stack.append(el('div', `deck-stack__layer deck-stack__layer--${n}`));
  const top = el('div', 'deck-top'), count = el('span', 'deck-count', '0');
  stack.append(top, count); return { stack, top, count };
}

function createHeroPanel(side) {
  const panel = el('div', 'hero-panel');
  const enemyNames = ['raider', 'hivelord', 'dreadlord'];
  const heroId = side === 'player' ? 'player' : `enemy_${enemyNames[Math.max(0, (fight?.fight || 1) - 1)]}`;
  const portraitEl = img('hero-portrait', `assets/hero_${heroId}.png`, `${side} hero`);
  const hpbar = el('div', 'hero-hpbar'), fill = el('div', 'hero-hpbar__fill'), hpText = el('span', 'hero-hp__text');
  hpbar.append(fill); panel.append(portraitEl, hpbar, hpText); return { panel, portrait: portraitEl, fill, hpText };
}

function createSide(side) {
  const root = el('div', `side side--${side}`), info = el('div', 'side__info');
  const hero = createHeroPanel(side), deck = createDeckStack(side), charger = el('div', 'charger-slot is-empty');
  info.append(hero.panel, deck.stack, charger);
  const scroll = el('div', 'board-scroll'), lane = el('div', 'board-lane'), ghosts = el('div', 'slot-ghosts');
  for (let n = 0; n < 5; n++) ghosts.append(el('div', 'slot-ghost'));
  lane.append(ghosts); scroll.append(lane); root.append(info, scroll); return { root, hero, deck, charger, scroll, lane, ghosts };
}

function replaceDeckTop(side, card) {
  const refs = els?.[side]; if (!refs) return;
  const old = refs.deck.top;
  if (!card) { old?.remove(); refs.deck.top = null; refs.deck.stack.classList.add('is-empty'); refs.deck.count.textContent = '0'; return; }
  const top = el('div', 'deck-top');
  top.append(side === 'player' ? createFace(card, 'card--mini') : createBack(card.cost, 'card--mini'));
  if (old) old.replaceWith(top); else refs.deck.stack.insertBefore(top, refs.deck.count);
  refs.deck.top = top; refs.deck.stack.classList.remove('is-empty');
}

export function mountBattleScreen(initialState, root = app) {
  if (!root) throw new Error('mountBattleScreen requires a root element');
  unitEls.clear(); root.replaceChildren(); fight = initialState;
  deckQueues = { player: [...(initialState.player?.deck || [])], enemy: [...(initialState.enemy?.deck || [])] };
  const battle = el('section', 'battle'); battle.id = 'battle-screen';
  const header = el('header', 'battle-header'), phase = el('span', 'battle-phase', `ROUND ${initialState.round || 0}`);
  header.append(el('b', 'battle-fight', `FIGHT ${initialState.fight || 1} / 3`), phase);
  const enemy = createSide('enemy'), log = el('div', 'battle-log'), player = createSide('player'), flight = el('div', 'flight-layer');
  battle.append(header, enemy.root, log, player.root, flight); root.append(battle);
  els = { battle, phase, log, flight, enemy, player };
  const styles = getComputedStyle(battle);
  slotWidth = parseFloat(styles.getPropertyValue('--slot-w')) || 128; slotGap = parseFloat(styles.getPropertyValue('--slot-gap')) || 12; slotPitch = slotWidth + slotGap;
  for (const side of SIDES) { replaceDeckTop(side, deckQueues[side][0]); els[side].deck.count.textContent = String(deckQueues[side].length); }
  for (const side of SIDES) (initialState[side]?.board || []).forEach((unit, index) => createUnitEl(unit.uid, unit, side, index, initialState));
  reconcile(snapshotView(initialState)); return els;
}

// REGISTRY
export const unitEls = new Map();
export function createUnitEl(uid, unit, side, slotIndex, snapshot = lastSnapshot) {
  if (unitEls.has(uid)) return unitEls.get(uid).el;
  const card = el('article', `card${unit.boss ? ' boss' : ''}`); card.dataset.uid = uid; card.style.transform = `translate3d(${slotIndex * slotPitch}px, 0, 0)`;
  const stats = snapshot ? effectiveStats(snapshot, side, unit) : { atk: unit.baseAtk ?? unit.atk, hp: (unit.baseMaxHp ?? unit.hp) - (unit.damage || 0) };
  const atk = el('span', 'card__atk', String(stats.atk)), hp = el('span', 'card__hp', String(stats.hp)), badges = el('div', 'card__badges');
  for (const keyword of unit.keywords || []) { const icon = iconFor(keyword); if (icon) badges.append(img('card__badge', `assets/${icon}`, '')); }
  card.append(createFace(unit), atk, hp, badges); if (unit.boss) card.append(el('em', 'card__crown', '♛'));
  els[side].lane.append(card); unitEls.set(uid, { el: card, side, slotIndex, atk: stats.atk, hp: stats.hp, atkEl: atk, hpEl: hp, dying: false }); return card;
}
export function getUnitEl(uid) { return unitEls.get(uid)?.el || null; }
export function removeUnitEl(uid) { const entry = unitEls.get(uid); if (entry) { entry.el.remove(); unitEls.delete(uid); } }

// RECONCILE
function updateHero(side, state) {
  const refs = els[side].hero, hp = Math.max(0, state.hp), text = `${hp} / ${HERO_MAX}`, width = `${Math.max(0, Math.min(100, hp / HERO_MAX * 100))}%`;
  if (refs.hpText.textContent !== text) refs.hpText.textContent = text; if (refs.fill.style.width !== width) refs.fill.style.width = width;
}
export function reconcile(snapshot) {
  if (!els || !snapshot) return; lastSnapshot = snapshot;
  for (const side of SIDES) {
    updateHero(side, snapshot[side]);
    const count = els[side].charger.querySelector('.cost-dot__count'); if (count && snapshot[side].charger && count.textContent !== String(snapshot[side].charger.counter)) count.textContent = String(snapshot[side].charger.counter);
    snapshot[side].board.forEach(unit => { const entry = unitEls.get(unit.uid); if (!entry || entry.dying) return; const stats = effectiveStats(snapshot, side, unit); if (entry.atk !== stats.atk) { entry.atk = stats.atk; entry.atkEl.textContent = String(stats.atk); } if (entry.hp !== stats.hp) { entry.hp = stats.hp; entry.hpEl.textContent = String(stats.hp); entry.el.classList.toggle('is-damaged', stats.hp < stats.maxHp); } });
  }
}

// EVENT PLAYER
function populateCharger(side, charger) {
  const slot = els[side].charger; slot.replaceChildren(); slot.classList.remove('is-empty');
  if (!charger) { slot.classList.add('is-empty'); return; }
  const visual = side === 'player' ? createFace(charger.card, 'charger-card') : createBack(charger.card.cost, 'charger-card'); visual.append(createCostDot(charger.card.cost, true, charger.counter)); slot.append(visual);
}
function clearCharger(side) { populateCharger(side, null); }
function makeFlightVisual(card, includeFace, includeCost = true) { const ghost = el('div', 'card-ghost is-flying'), visual = includeFace ? createFace(card) : createBack(card.cost); if (includeFace && includeCost) visual.append(createCostDot(card.cost)); ghost.append(visual); return ghost; }

export async function flyCard(startEl, destRect, content, duration, keyframeOpts = {}) {
  const startRect = startEl.getBoundingClientRect(), dx = destRect.left - startRect.left, dy = destRect.top - startRect.top, scale = startRect.width ? destRect.width / startRect.width : 1;
  startEl.classList.add('is-vacant'); Object.assign(content.style, { left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, height: `${startRect.height}px` }); els.flight.append(content);
  const overshoot = keyframeOpts.overshoot ? (Math.sign(dx) || 1) * 10 : 0;
  const keyframes = keyframeOpts.overshoot ? [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .7, transform: `translate3d(${dx + overshoot}px,${dy}px,0) scale(${scale * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }] : [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .5, transform: `translate3d(${dx / 2}px,${dy / 2 - 12}px,0) scale(${(1 + scale) / 2 * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }];
  const animation = content.animate(keyframes, { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  try { await Promise.race([animation.finished, wait(duration)]); } catch { /* cancelled fight */ }
  content.remove(); startEl.classList.remove('is-vacant');
}

async function playReveal(event) {
  const side = event.side, source = els[side].deck.top, charger = event.state[side].charger;
  if (!source || !charger) { await wait(TIMING.reveal); return; }
  const destination = els[side].charger.getBoundingClientRect(), ghost = makeFlightVisual(charger.card, side === 'player');
  await flyCard(source, destination, ghost, TIMING.reveal); populateCharger(side, charger); deckQueues[side].shift(); replaceDeckTop(side, deckQueues[side][0]); els[side].deck.count.textContent = String(deckQueues[side].length);
}
function autoScrollFor(side, slotIndex) { const scroll = els[side].scroll, left = slotIndex * slotPitch, right = left + slotWidth; if (right > scroll.scrollLeft + scroll.clientWidth - 8 || left < scroll.scrollLeft + 8) scroll.scrollTo({ left: Math.max(0, left + slotWidth / 2 - scroll.clientWidth / 2), behavior: 'auto' }); }
function destinationRect(side, slotIndex) { const rect = els[side].lane.getBoundingClientRect(); return { left: rect.left + slotIndex * slotPitch - els[side].scroll.scrollLeft, top: rect.top, width: slotWidth, height: rect.height }; }
async function playDeploy(event) {
  const side = event.side, unit = event.state[side].board.find(item => item.uid === event.uid); if (!unit) { await wait(TIMING.deploy); return; }
  const slotIndex = event.state[side].board.findIndex(item => item.uid === event.uid); autoScrollFor(side, slotIndex); const dest = destinationRect(side, slotIndex), ghost = makeFlightVisual(unit, true, true);
  await flyCard(els[side].charger, dest, ghost, TIMING.deploy, { overshoot: true }); const card = createUnitEl(unit.uid, unit, side, slotIndex, event.state); pulse(card, 'fx-deploy-pop', 250); clearCharger(side); if (unit.cardId === 'scout') revealScout(side === 'player' ? 'enemy' : 'player', event.state); reconcile(event.state);
}
function revealScout(side, snapshot) { const charger = snapshot[side]?.charger; if (!charger || !els[side].charger.isConnected) return; const face = createFace(charger.card, 'is-scout-revealed'); els[side].charger.append(face); setTimeout(() => face.remove(), TIMING.scout); }
function pulse(node, className, duration) { if (node) { node.classList.add(className); setTimeout(() => node.classList.remove(className), duration); } }
async function playAttack(event) { const attacker = getUnitEl(event.uid), target = event.targetUid ? getUnitEl(event.targetUid) : els[event.side === 'player' ? 'enemy' : 'player'].hero.portrait; if (attacker && target) { const a = attacker.getBoundingClientRect(), b = target.getBoundingClientRect(); attacker.style.setProperty('--lunge-x', `${(b.left + b.width / 2 - a.left - a.width / 2) * .28}px`); attacker.style.setProperty('--lunge-y', `${(b.top + b.height / 2 - a.top - a.height / 2) * .28}px`); pulse(attacker, 'fx-lunge', TIMING.attack); } await wait(TIMING.attack); }
function damageFloater(target, amount) { if (!target) return; const rect = target.getBoundingClientRect(), floater = el('span', 'damage-floater', `-${amount}`); floater.style.left = `${rect.left + rect.width / 2}px`; floater.style.top = `${rect.top + rect.height / 2}px`; els.flight.append(floater); setTimeout(() => floater.remove(), TIMING.floater); }
function scheduleDeath(uid) { const entry = unitEls.get(uid); if (!entry || entry.dying) return; entry.dying = true; entry.el.classList.add('fx-death'); entry.el.style.pointerEvents = 'none'; let done = false; const finish = () => { if (done) return; done = true; entry.el.removeEventListener('animationend', onEnd); removeUnitEl(uid); }; const onEnd = event => { if (event.animationName === 'unit-death') finish(); }; entry.el.addEventListener('animationend', onEnd); setTimeout(() => { if (!done) { console.warn(`Death animation fallback fired for ${uid}`); finish(); } }, 500); }
async function playShift(event) { const shifting = []; for (const side of SIDES) event.state[side].board.forEach((unit, index) => { const entry = unitEls.get(unit.uid); if (entry && !entry.dying && entry.slotIndex !== index) shifting.push({ entry, index }); }); shifting.sort((a, b) => a.index - b.index).forEach(({ entry, index }, order) => { entry.slotIndex = index; entry.el.style.transitionDelay = `${order * TIMING.stagger}ms`; entry.el.style.transform = `translate3d(${index * slotPitch}px, 0, 0)`; setTimeout(() => { entry.el.style.transitionDelay = '0ms'; }, TIMING.shift + order * TIMING.stagger); }); reconcile(event.state); await wait(TIMING.shift + Math.max(0, shifting.length - 1) * TIMING.stagger); }

async function playEvent(event, deployUids) {
  els.phase.textContent = `${event.phase.toUpperCase()} · ROUND ${event.round}`;
  if (event.type === 'reveal') return playReveal(event); if (event.type === 'deploy') return playDeploy(event);
  if (event.type === 'summon') { if (!deployUids.has(event.uid)) { const unit = event.state[event.side].board.find(item => item.uid === event.uid), index = event.state[event.side].board.findIndex(item => item.uid === event.uid); if (unit) pulse(createUnitEl(unit.uid, unit, event.side, index, event.state), 'fx-deploy-pop', TIMING.summon); } reconcile(event.state); await wait(TIMING.summon); return; }
  if (event.type === 'tick') { reconcile(event.state); pulse(els[event.side].charger.querySelector('.cost-dot__count'), 'fx-tick', TIMING.tick); await wait(TIMING.tick); return; }
  if (event.type === 'attack') return playAttack(event);
  if (event.type === 'damage') { reconcile(event.state); const target = getUnitEl(event.uid); pulse(target, 'fx-hit', TIMING.damage); damageFloater(target, event.amount); await wait(TIMING.damage); return; }
  if (event.type === 'death') { scheduleDeath(event.uid); await wait(TIMING.death); return; } if (event.type === 'shift') return playShift(event);
  if (event.type === 'heroHit') { reconcile(event.state); pulse(els[event.side].hero.portrait, 'fx-hit', TIMING.heroHit); pulse(els[event.side].root, 'fx-hero-hit', TIMING.heroHit); await wait(TIMING.heroHit); return; }
  if (event.type === 'shield') { reconcile(event.state); pulse(getUnitEl(event.uid), 'fx-shield', TIMING.shield); await wait(TIMING.shield); return; }
  if (event.type === 'chargerDestroyed') { pulse(els[event.side].charger, 'fx-shatter', TIMING.chargerDestroyed); await wait(TIMING.chargerDestroyed); clearCharger(event.side); reconcile(event.state); return; }
  if (event.type === 'stalemate') { pulse(els.player.hero.panel, 'fx-stalemate', TIMING.stalemate); pulse(els.enemy.hero.panel, 'fx-stalemate', TIMING.stalemate); appendLog(`Stalemate: ${event.winner} wins`); await wait(TIMING.stalemate); return; }
  if (event.type === 'cleanup') { await wait(TIMING.cleanup); return; } reconcile(event.state); await wait(TIMING[event.type] || 55);
}
export async function playEvents(eventStream) { const deployUids = new Set(eventStream.filter(event => event.type === 'deploy').map(event => event.uid)); for (const event of eventStream) { appendEventLog(event); await playEvent(event, deployUids); } }

// LOG
function appendLog(message) { if (!els?.log || !message) return; els.log.append(el('p', 'battle-log__line', message)); while (els.log.childElementCount > 4) els.log.firstElementChild.remove(); }
function appendEventLog(event) { if (!['deploy', 'death', 'heroHit', 'shield', 'stalemate', 'chargerDestroyed'].includes(event.type)) return; appendLog(event.type === 'heroHit' ? `${event.side} hero takes ${event.amount}` : event.type === 'stalemate' ? `Stalemate: ${event.winner} wins` : `${event.unit || event.side || ''} ${event.type}`.trim()); }

function button(label, handler) { const node = el('button', 'primary', label); node.addEventListener('click', handler); return node; }
function showTitle() { stopped = true; const screen = el('section', 'screen title'); screen.append(el('div', 'title-mark', 'DECK AUTO BATTLER'), el('p', '', 'Build a warband. Watch the line break. Carry every wound.'), button('Start Run', startRun)); app.replaceChildren(screen); }
function startRun() { run = createRun(); stopped = false; beginFight(); }
async function beginFight() { fight = startRunFight(run); mountBattleScreen(fight); await wait(500); while (!fight.over && !stopped) { runRound(fight); await playEvents(fight.events); await wait(600); } if (stopped) return; finishRunFight(run, fight); if (run.lost) return showEnd(false); if (run.won) return showEnd(true); await wait(500); showDraft(0); }
function tooltip(card) { if (card.id === 'gravedigger') return 'Battlecry: summon a 1/1 for every death on either side, including tokens.'; return [...(card.keywords || []), card.battlecry && 'Battlecry', card.deathrattle && 'Deathrattle', card.aura && 'Aura'].filter(Boolean).join(' · ') || 'A dependable fighter.'; }
function draftCard(def, choose) { const node = el('button', 'draft-card'), visual = el('span', 'draft-visual'); visual.append(img('draft-art', portrait(def.id), ''), img('draft-frame', frameFor(def.cost), '')); node.append(visual, el('strong', '', def.name), el('span', '', `${def.cost} turn${def.cost > 1 ? 's' : ''}`), el('b', '', `${def.atk} / ${def.hp}`), el('small', '', tooltip(def))); node.addEventListener('click', () => choose(def)); return node; }
function showDraft(pick) { const screen = el('section', 'screen draft'); screen.append(img('banner', 'assets/banner_draft.png', ''), el('h1', '', 'CHOOSE ONE'), el('p', '', `Pick ${pick + 1} of 2 · Deck ${run.deck.length} cards`)); const offers = el('div'); offers.id = 'offers'; for (const def of draftOffers(run.rng)) offers.append(draftCard(def, chosen => { run.deck.push(chosen); pick === 0 ? showDraft(1) : beginFight(); })); screen.append(offers); app.replaceChildren(screen); }
function showEnd(won) { stopped = true; const screen = el('section', `screen end ${won ? 'won' : 'lost'}`); screen.append(img('banner', 'assets/banner_victory.png', ''), el('h1', '', won ? 'RUN VICTORY' : 'RUN DEFEAT'), el('p', '', won ? `The war-camp falls. ${run.hp} HP remains.` : 'The line broke. Build again.'), button('Restart', startRun)); app.replaceChildren(screen); }
if (app && !globalThis.__DECK_BATTLER_NO_BOOT__) showTitle();
