import { CARD_POOL, createRun, draftOffers, effectiveStats, finishRunFight, runRound, snapshotView, startRunFight } from './engine.js';

// CONSTANTS
export const TIMING = Object.freeze({ reveal: 300, tick: 250, deploy: 400, battlecry: 300, attack: 350, damage: 200, death: 400, shift: 300, heroHit: 200, shield: 250, summon: 250, chargerDestroyed: 250, stalemate: 400, cleanup: 55, stagger: 40, scout: 1500, floater: 600 });
const SIDES = ['enemy', 'player'];
const HERO_MAX = 40;
const app = typeof document === 'undefined' ? null : document.querySelector('#app');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const portrait = id => `assets/portrait_${id}.png`;
const frameFor = cost => `assets/frame_cost${Math.max(1, Math.min(3, cost || 1))}.png`;
const iconFor = key => ({ shield: 'icon_ds.png', poisonous: 'icon_poison.png', windfury: 'icon_wf.png', battlecry: 'icon_bc.png', deathrattle: 'icon_dr.png', aura: 'icon_aura.png' }[key]);
const definitionFor = unit => CARD_POOL.find(card => card.id === unit?.cardId) || unit;
const unitPortrait = unit => unit?.boss ? portrait(`boss_${unit.boss === 'hive' ? 'hivematron' : 'warherald'}`) : unit?.token ? portrait('brood_wisp') : unit?.cardId === 'enemy_grunt' ? portrait('sellsword') : unit?.cardId === 'enemy_brute' ? portrait('road_ogre') : portrait(unit?.cardId || unit?.id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const img = (className, src, alt = '') => { const node = el('img', className); node.src = src; node.alt = alt; return node; };

let run, fight, stopped = false, els = null, slotWidth = 128, slotGap = 12, slotPitch = 140, cardHeight = 192, lastSnapshot = null;
let deckQueues = { player: [], enemy: [] };
let deckKnown = { player: true, enemy: true };

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const toggleClass = (node, key, on) => { if (node.classList.contains(key) !== on) node.classList.toggle(key, on); };
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const keywordsFor = unit => ['shield', 'aura', 'poisonous', 'windfury', 'deathrattle', 'battlecry'].filter(key => key === 'shield' ? unit.shield : unit[key] || unit.keywords?.includes(key));
const BATTLECRY_TEXT = Object.freeze({
  hex_hurler: 'On deploy: deal 2 damage to the opposing unit.',
  tax: "On deploy: add 1 turn to the enemy's charging card.",
  chrono: 'On deploy: tick your charging card down 1 turn.',
  gate: 'On deploy: shove the opposing unit to the far right.',
  squire: 'On deploy: give adjacent allies +1/+1.',
  scout: "On deploy: reveal the enemy's charging card.",
  duelist: 'On deploy: gain +1/+1 for each adjacent ally.',
  hexblade: 'On deploy: set the opposing unit to 1/1.',
  gravedigger: 'On deploy: summon a 1/1 for every death this combat.',
  meddler: "On deploy: return the enemy's charging card to its deck.",
  inquisitor: "On deploy: deal 3 damage to the enemy's strongest unit.",
  doom: "On deploy: destroy the enemy's charging card.",
  copycat: "On deploy: copy the opposing unit's ATK and HP.",
  cultist: 'On deploy: devour your leftmost other unit and gain its stats.',
  cataclysm: 'On deploy: deal 2 damage to every unit.',
});
export const battlecryText = card => BATTLECRY_TEXT[card?.battlecry || card?.kind] || '';
const describeUnit = (unit, stats, keys) => `Inspect ${unit.boss ? 'boss ' : ''}${unit.name}, ATK ${stats.atk}, HP ${stats.hp}${keys.length ? ', ' + keys.join(', ') : ''}${unit.battlecry ? `. ${battlecryText(unit)}` : ''}`;
function inspect(node, describe) {
  node.tabIndex = 0; node.setAttribute('role', 'group');
  const show = () => { els.detail.textContent = describe(); els.detail.hidden = false; els.detail.owner = node; };
  node.addEventListener('focus', show);
  node.addEventListener('pointerdown', () => { node._inspectionWasOpen = els.detail.owner === node && !els.detail.hidden; });
  node.addEventListener('click', () => { if (node._inspectionWasOpen) { els.detail.hidden = true; els.detail.owner = null; } else show(); });
  node.addEventListener('blur', () => { if (els.detail.owner === node) { els.detail.hidden = true; els.detail.owner = null; } });
  node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
}
// MOUNT
function createCostDot(cost, withCount = false, count = 0) {
  const dot = el('span', `cost-dot cost-dot--t${Math.max(1, Math.min(3, cost || 1))}`, String(cost));
  if (withCount) dot.append(el('span', 'cost-dot__count', String(count)));
  return dot;
}

function createFace(card, classes = '') {
  const node = el('div', `card-face ${classes}`.trim());
  const def = definitionFor(card); node.style.setProperty('--card-trim', ['#b08d57', '#c0c6d4', '#e8b84b'][Math.max(1, Math.min(3, card?.boss ? 3 : def?.cost || 1)) - 1]);
  node.append(img('card__art', unitPortrait(card), ''), img('card__frame', frameFor(card?.boss ? 3 : def?.cost), ''), el('span', 'card__name', card?.name || def?.name || 'Unit'));
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
  stack.append(top, el('span', 'deck-label', 'NEXT'), count); return { stack, top, count };
}

function createHeroPanel(side) {
  const panel = el('div', 'hero-panel');
  const enemyNames = ['raider', 'hivelord', 'dreadlord'];
  const heroId = side === 'player' ? 'player' : `enemy_${enemyNames[Math.max(0, (fight?.fight || 1) - 1)]}`;
  const portraitEl = img('hero-portrait', `assets/hero_${heroId}.png`, `${side} hero`);
  const hpbar = el('div', 'hero-hpbar'), fill = el('div', 'hero-hpbar__fill'), hpText = el('span', 'hero-hp__text');
  const label = el('span', 'hero-label'); hpbar.setAttribute('role', 'meter'); hpbar.setAttribute('aria-label', `${side === 'player' ? 'Your' : 'Enemy'} hero health`); hpbar.setAttribute('aria-valuemin', '0'); hpbar.setAttribute('aria-valuemax', String(HERO_MAX)); hpbar.append(fill); panel.append(portraitEl, label, hpbar, hpText); return { panel, portrait: portraitEl, fill, hpText, hpbar, label };
}

function createSide(side) {
  const root = el('div', `side side--${side}`), info = el('div', 'side__info');
  const hero = createHeroPanel(side), deck = createDeckStack(side), charger = el('div', 'charger-slot is-empty');
  const chargerLabel = el('span', 'charger-label', 'EMPTY'), plaque = el('div', 'deck-plaque'); plaque.id = `deck-detail-${side}`; deck.stack.setAttribute('aria-describedby', plaque.id); charger.append(chargerLabel); info.append(hero.panel, deck.stack, charger, plaque); if (side === 'player') inspect(deck.stack, () => plaque.textContent); deck.stack.setAttribute('aria-label', side === 'player' ? 'Inspect your next card' : 'Enemy next card hidden');
  const scroll = el('div', 'board-scroll'), lane = el('div', 'board-lane'), ghosts = el('div', 'slot-ghosts');
  for (let n = 0; n < 5; n++) ghosts.append(el('div', 'slot-ghost'));
  const empty = el('span', 'board-empty', 'NO UNITS IN LINE');
  lane.append(ghosts, empty); scroll.append(lane); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', side === 'player' ? 'Your line' : 'Enemy line');
  const prev = el('button', 'lane-arrow lane-arrow--prev', '‹'), next = el('button', 'lane-arrow lane-arrow--next', '›');
  prev.setAttribute('aria-label', 'Scroll previous slot'); next.setAttribute('aria-label', 'Scroll next slot');
  const updateArrows = () => { prev.disabled = scroll.scrollLeft <= 0; next.disabled = scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 1; };
  prev.addEventListener('click', () => scroll.scrollBy({ left: -slotPitch, behavior: 'auto' })); next.addEventListener('click', () => scroll.scrollBy({ left: slotPitch, behavior: 'auto' }));
  scroll.addEventListener('scroll', updateArrows); scroll.addEventListener('keydown', event => { if (event.target === scroll && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); scroll.scrollBy({ left: event.key === 'ArrowLeft' ? -slotPitch : slotPitch }); } });
  prev.disabled = true; root.append(info, scroll, prev, next); return { root, hero, deck, charger, chargerLabel, plaque, scroll, lane, ghosts, empty };
}

function replaceDeckTop(side, card) {
  const refs = els?.[side]; if (!refs) return;
  const old = refs.deck.top;
  // A reveal can prove our queue stale, but snapshots cannot supply the new deck.
  // Never fabricate the next face/count from that stale mirror (Meddler contract gap).
  if (!deckKnown[side]) { old?.remove(); refs.deck.top = null; setText(refs.deck.count, '?'); setText(refs.plaque, 'NEXT CARD HIDDEN'); if (side === 'player') setText(els.headerCount, 'YOUR DECK ?'); return; }
  setText(refs.plaque, card ? side === 'player' ? `${card.name} · ATK ${card.atk} · HP ${card.hp}${card.battlecry ? ` · ${battlecryText(card)}` : ''}` : 'NEXT CARD HIDDEN' : 'DECK EMPTY · No more arrivals');
  const count = String(deckQueues[side].length); setText(refs.deck.count, count); if (side === 'player') setText(els.headerCount, `YOUR DECK ${count}`);
  if (!card) { old?.remove(); refs.deck.top = null; refs.deck.stack.classList.add('is-empty'); refs.deck.count.textContent = '0'; return; }
  const top = el('div', 'deck-top');
  top.append(side === 'player' ? createFace(card, 'card--mini') : createBack(card.cost, 'card--mini'));
  if (old) old.replaceWith(top); else refs.deck.stack.insertBefore(top, refs.deck.count);
  refs.deck.top = top; refs.deck.stack.classList.remove('is-empty');
}

export function mountBattleScreen(initialState, root = app) {
  if (!root) throw new Error('mountBattleScreen requires a root element');
  unitEls.clear(); root.replaceChildren(); fight = initialState;
  deckKnown = { player: true, enemy: true };
  deckQueues = { player: [...(initialState.player?.deck || [])], enemy: [...(initialState.enemy?.deck || [])] };
  const battle = el('section', 'battle'); battle.id = 'battle-screen'; battle.setAttribute('aria-live', 'off');
  const header = el('header', 'battle-header'), phase = el('span', 'battle-phase', `READY \u00b7 ROUND ${initialState.round || 0}`);
  header.append(el('b', 'battle-fight', `FIGHT ${initialState.fight || 1} / 3`), phase);
  const headerCount = el('span', 'header-count'); header.append(headerCount);
  const enemy = createSide('enemy'), log = el('div', 'battle-log'), player = createSide('player'), flight = el('div', 'flight-layer');
  battle.append(header, enemy.root, log, player.root, flight); root.append(battle);
  const history = el('div', 'battle-log__history'), detail = el('div', 'battle-detail'), live = el('span', 'sr-only'), toggle = el('button', 'log-toggle', 'Log');
  detail.hidden = true; live.setAttribute('aria-live', 'polite'); toggle.setAttribute('aria-expanded', 'false'); history.id = 'battle-history'; toggle.setAttribute('aria-controls', history.id);
  for (let i = 0; i < 4; i++) history.append(el('p', 'battle-log__line', i === 3 ? 'Combat proceeds automatically' : ''));
  log.append(history, detail, live, toggle);
  toggle.addEventListener('click', () => { const open = log.classList.toggle('is-expanded'); toggle.setAttribute('aria-expanded', String(open)); });
  battle.addEventListener('keydown', event => { if (event.key === 'Escape') { detail.hidden = true; log.classList.remove('is-expanded'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
  els = { battle, phase, headerCount, log, history, detail, live, flight, enemy, player };
  const styles = getComputedStyle(battle);
  slotWidth = parseFloat(styles.getPropertyValue('--slot-w')) || 128; slotGap = parseFloat(styles.getPropertyValue('--slot-gap')) || 12; slotPitch = slotWidth + slotGap; cardHeight = parseFloat(styles.getPropertyValue('--card-h'));
  for (const key of ['--slot-w', '--slot-gap', '--card-h', '--name-size', '--name-line', '--pip-size', '--stat-size', '--badge-size', '--name-bottom']) battle.style.setProperty(key, styles.getPropertyValue(key));
  battle.dataset.cardTier = slotWidth === 112 ? 'mobile' : slotWidth === 216 ? 'large' : 'medium';
  for (const side of SIDES) { replaceDeckTop(side, deckQueues[side][0]); els[side].deck.count.textContent = String(deckQueues[side].length); }
  for (const side of SIDES) if (initialState[side]?.charger) populateCharger(side, initialState[side].charger);
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
  const badgeEls = new Map();
  for (const key of ['shield', 'aura', 'poisonous', 'windfury', 'deathrattle', 'battlecry']) { const badge = img('card__badge', `assets/${iconFor(key)}`, key); badge.title = key === 'battlecry' ? battlecryText(unit) : key; badges.append(badge); badgeEls.set(key, badge); }
  const more = el('span', 'card__badge card__badge--more'); badges.append(more);
  card.append(createFace(unit), atk, hp, badges); if (unit.boss) card.append(el('em', 'card__crown', '♛'));
  inspect(card, () => card.getAttribute('aria-label'));

  els[side].lane.append(card); unitEls.set(uid, { el: card, side, slotIndex, atk: stats.atk, hp: stats.hp, atkEl: atk, hpEl: hp, badgeEls, more, dying: false }); return card;
}
export function getUnitEl(uid) { return unitEls.get(uid)?.el || null; }
export function removeUnitEl(uid) { const entry = unitEls.get(uid); if (entry) { if (els.detail.owner === entry.el) { els.detail.hidden = true; els.detail.textContent = ''; els.detail.owner = null; } entry.el.remove(); unitEls.delete(uid); } }

// RECONCILE
function updateHero(side, state) {
  const refs = els[side].hero, max = state.maxHp || HERO_MAX, hp = Math.max(0, state.hp), pct = Math.max(0, Math.min(100, hp / max * 100));
  if (refs.hp === hp && refs.max === max) return;
  const previous = refs.hp === undefined ? pct : refs.hp / (refs.max || max) * 100;
  refs.hpbar.style.setProperty('--loss-from', `${previous}%`); refs.hpbar.style.setProperty('--health', `${pct}%`);
  if (hp < refs.hp) { refs.hpbar.getAnimations().forEach(animation => animation.cancel()); refs.hpbar.animate([{ width: `${previous}%` }, { width: `${pct}%` }], { duration: 250, easing: 'ease-in', pseudoElement: '::before' }); }
  refs.hpbar.setAttribute('aria-valuenow', String(hp)); refs.hpbar.setAttribute('aria-valuemax', String(max));
  setText(refs.hpText, `${hp} / ${max}`); refs.fill.style.width = `${pct}%`;
  refs.panel.classList.toggle('is-low', hp <= max * .25); refs.panel.classList.toggle('is-healing', hp > refs.hp);
  setText(refs.label, `${side === 'player' ? 'YOU' : 'ENEMY'}${hp <= max * .25 ? ' · LOW HP' : side === 'player' ? ' · CARRIED HP' : ' HERO'}`);
  refs.label.dataset.compact = `${side === 'player' ? 'YOU' : 'ENEMY'}${hp <= max * .25 ? ' \u00b7 LOW HP' : ''}`; refs.hp = hp; refs.max = max;
}
export function reconcile(snapshot) {
  if (!els || !snapshot) return; lastSnapshot = snapshot;
  for (const side of SIDES) {
    updateHero(side, snapshot[side]);
    const boardEmptyHidden = snapshot[side].board.length > 0; if (els[side].empty.hidden !== boardEmptyHidden) els[side].empty.hidden = boardEmptyHidden;
    const charge = snapshot[side].charger;
    setText(els[side].chargerLabel, charge ? els[side].charger.querySelector('.is-scout-revealed') ? 'SCOUTED' : charge.counter === 0 ? snapshot[side].board.length >= 20 ? 'WAITING' : 'READY' : 'CHARGING' : deckQueues[side].length ? 'EMPTY' : 'NO ARRIVAL');
    const chargeLabel = charge ? `${side === 'player' ? 'Your' : 'Enemy'} charger, cost ${charge.card.cost}, remaining ${charge.counter}` : `${side === 'player' ? 'Your' : 'Enemy'} charger, ${els[side].chargerLabel.textContent}`;
    if (els[side].charger.getAttribute('aria-label') !== chargeLabel) els[side].charger.setAttribute('aria-label', chargeLabel);
    const progress = charge ? String(Math.max(0, charge.counter) / Math.max(1, charge.card.cost)) : '0'; if (els[side].charger.style.getPropertyValue('--charge-progress') !== progress) els[side].charger.style.setProperty('--charge-progress', progress);
    const count = els[side].charger.querySelector('.cost-dot__count'); if (count && snapshot[side].charger && count.textContent !== String(snapshot[side].charger.counter)) count.textContent = String(snapshot[side].charger.counter);
    snapshot[side].board.forEach(unit => { const entry = unitEls.get(unit.uid); if (!entry || entry.dying) return; const stats = effectiveStats(snapshot, side, unit); if (entry.atk !== stats.atk) { entry.atk = stats.atk; entry.atkEl.textContent = String(stats.atk); } if (entry.hp !== stats.hp) { entry.hp = stats.hp; entry.hpEl.textContent = String(stats.hp); }
      toggleClass(entry.el, 'is-damaged', stats.hp < stats.maxHp); toggleClass(entry.el, 'has-shield', !!unit.shield); toggleClass(entry.el, 'has-aura', stats.atk > unit.baseAtk || stats.maxHp > unit.baseMaxHp);
      toggleClass(entry.atkEl, 'is-buffed', stats.atk > unit.baseAtk); toggleClass(entry.hpEl, 'is-buffed', stats.maxHp > unit.baseMaxHp);
      const keys = keywordsFor(unit), visible = keys.length > 2 ? keys.slice(0, 1) : keys;
      entry.badgeEls.forEach((badge, key) => { const hidden = !visible.includes(key); if (badge.hidden !== hidden) badge.hidden = hidden; });
      if (entry.more.hidden !== (keys.length <= 2)) entry.more.hidden = keys.length <= 2; setText(entry.more, keys.length > 2 ? `+${keys.length - 1}` : '');
      const label = describeUnit(unit, stats, keys);
      if (entry.el.getAttribute('aria-label') !== label) entry.el.setAttribute('aria-label', label);
      if (els.detail.owner === entry.el) setText(els.detail, label); });
  }
}

// EVENT PLAYER
function populateCharger(side, charger) {
  const slot = els[side].charger;
  for (const child of [...slot.children]) if (child !== els[side].chargerLabel) child.remove();
  slot.classList.toggle('is-empty', !charger);
  if (!charger) { setText(els[side].chargerLabel, deckQueues[side].length ? 'EMPTY' : 'NO ARRIVAL'); return; }
  const visual = side === 'player' ? createFace(charger.card, 'charger-card') : createBack(charger.card.cost, 'charger-card');
  if (side === 'player') visual.append(createCostDot(charger.card.cost));
  slot.append(visual, el('span', 'cost-dot__count', String(charger.counter))); setText(els[side].chargerLabel, charger.counter === 0 ? 'READY' : 'CHARGING');
}
function clearCharger(side) { populateCharger(side, null); }
function makeFlightVisual(card, includeFace, includeCost = true) { const ghost = el('div', 'card-ghost is-flying'), visual = includeFace ? createFace(card) : createBack(card.cost); if (includeFace && includeCost) visual.append(createCostDot(card.cost)); ghost.append(visual); return ghost; }

export async function flyCard(startEl, destRect, content, duration, keyframeOpts = {}) {
  const startRect = startEl.getBoundingClientRect(), dx = destRect.left - startRect.left, dy = destRect.top - startRect.top, scale = startRect.width ? destRect.width / startRect.width : 1;
  startEl.classList.add('is-vacant'); Object.assign(content.style, { left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, height: `${startRect.height}px` }); els.flight.append(content);
  const overshoot = keyframeOpts.overshoot && Math.abs(dx) > 1 ? Math.sign(dx) * 10 : 0, overshootY = keyframeOpts.overshoot && Math.abs(dx) <= 1 ? (Math.sign(dy) || 1) * 10 : 0;
  const keyframes = keyframeOpts.overshoot ? [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .7, transform: `translate3d(${dx + overshoot}px,${dy + overshootY}px,0) scale(${scale * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }] : [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .5, transform: `translate3d(${dx / 2}px,${dy / 2 - 12}px,0) scale(${(1 + scale) / 2 * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }];
  const animation = content.animate(reducedMotion() ? [{ opacity: .7 }, { opacity: .7 }] : keyframes, { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  try { await Promise.race([animation.finished, wait(duration)]); } catch { /* cancelled fight */ }
  content.remove(); startEl.classList.remove('is-vacant');
}

async function playReveal(event) {
  const side = event.side, source = els[side].deck.top || els[side].deck.stack, charger = event.state[side].charger;
  if (!source || !charger) { await wait(TIMING.reveal); return; }
  const destination = els[side].charger.getBoundingClientRect(), ghost = makeFlightVisual(charger.card, side === 'player');
  await flyCard(source, destination, ghost, TIMING.reveal); populateCharger(side, charger); if (deckQueues[side][0]?.id !== charger.card.id) deckKnown[side] = false; if (deckKnown[side]) deckQueues[side].shift(); replaceDeckTop(side, deckQueues[side][0]);
}
function autoScrollFor(side, slotIndex) { const scroll = els[side].scroll, left = slotIndex * slotPitch, right = left + slotWidth; if (right > scroll.scrollLeft + scroll.clientWidth - 8 || left < scroll.scrollLeft + 8) scroll.scrollTo({ left: Math.max(0, left + slotWidth / 2 - scroll.clientWidth / 2), behavior: 'auto' }); }
function destinationRect(side, slotIndex) { const rect = els[side].lane.getBoundingClientRect(); return { left: rect.left + slotIndex * slotPitch, top: rect.top, width: slotWidth, height: cardHeight }; }
async function playDeploy(event) {
  const side = event.side, unit = event.state[side].board.find(item => item.uid === event.uid); if (!unit) { await wait(TIMING.deploy); return; }
  const slotIndex = event.state[side].board.findIndex(item => item.uid === event.uid); autoScrollFor(side, slotIndex); const dest = destinationRect(side, slotIndex), ghost = makeFlightVisual(unit, true, true);
  await flyCard(els[side].charger, dest, ghost, TIMING.deploy, { overshoot: true }); const card = createUnitEl(unit.uid, unit, side, slotIndex, event.state); pulse(card, 'fx-deploy-pop', 250); clearCharger(side); reconcile(event.state);
}
function revealScout(side, snapshot) { const charger = snapshot[side]?.charger; if (!charger || !els[side].charger.isConnected) return; const refs = els[side], face = createFace(charger.card, 'is-scout-revealed'); refs.charger.append(face); setText(refs.chargerLabel, 'SCOUTED'); setTimeout(() => { face.remove(); if (refs === els?.[side]) setText(refs.chargerLabel, refs.charger.querySelector('.charger-card') ? Number(refs.charger.querySelector('.cost-dot__count')?.textContent) === 0 ? 'READY' : 'CHARGING' : deckQueues[side].length ? 'EMPTY' : 'NO ARRIVAL'); }, TIMING.scout); }
function pulse(node, className, duration) { if (node) { node.classList.add(className); setTimeout(() => node.classList.remove(className), duration); } }
function battlecryCaption(event) {
  const target = event.target || event.targets?.join(' and ');
  if (event.kind === 'hex_hurler') return target ? `Battlecry: 2 damage → ${target}` : 'Battlecry: no opposing unit';
  if (event.kind === 'inquisitor') return target ? 'Battlecry: 3 damage → strongest enemy' : 'Battlecry: no enemy units';
  if (event.kind === 'hexblade') return target ? `Battlecry: ${target} becomes 1/1` : 'Battlecry: no opposing unit';
  if (event.kind === 'copycat') return target ? `Battlecry: copy ${target}'s stats` : 'Battlecry: no opposing unit';
  if (event.kind === 'cultist') return target ? `Battlecry: devour ${target}` : 'Battlecry: no ally to devour';
  if (event.kind === 'gate') return event.moved ? `Battlecry: shove ${target} right` : 'Battlecry: no unit to shove';
  if (event.kind === 'cataclysm') return 'Battlecry: 2 damage to all units';
  if (event.kind === 'squire') return event.neighborIndices?.length ? 'Battlecry: adjacent allies gain +1/+1' : 'Battlecry: no adjacent allies';
  if (event.kind === 'gravedigger') return event.count ? `Battlecry: summon ${event.count} token${event.count === 1 ? '' : 's'}` : 'Battlecry: no fallen units';
  if (event.kind === 'duelist') return event.adjacent ? `Battlecry: gain +${event.adjacent}/+${event.adjacent}` : 'Battlecry: no adjacent allies';
  if (event.kind === 'tax') return event.counterDelta ? 'Battlecry: enemy charge +1 turn' : 'Battlecry: no enemy charging';
  if (event.kind === 'chrono') return event.counterDelta ? `Battlecry: own charge -1 turn${event.deployed ? ' and deploy' : ''}` : 'Battlecry: no friendly charge';
  if (event.kind === 'scout') return event.scouted ? 'Battlecry: reveal enemy charge' : 'Battlecry: no enemy charging';
  if (event.kind === 'doom') return event.destroyed ? 'Battlecry: destroy enemy charge' : 'Battlecry: no enemy charging';
  if (event.kind === 'meddler') return event.returned ? 'Battlecry: return enemy charge' : 'Battlecry: no enemy charging';
  return `Battlecry: ${battlecryText(event).replace(/^On deploy:\s*/i, '') || 'no effect'}`;
}
async function playBattlecry(event) {
  const source = getUnitEl(event.uid);
  const targets = event.all ? [...unitEls.values()].map(entry => entry.el) : [event.targetUid, ...(event.targetUids || [])].filter(Boolean).map(getUnitEl).filter(Boolean);
  pulse(source, 'fx-battlecry-source', TIMING.battlecry);
  for (const target of new Set(targets.filter(node => node !== source))) pulse(target, 'fx-battlecry-target', TIMING.battlecry);
  const isReduced = reducedMotion(), caption = el('span', `battlecry-caption${isReduced ? ' is-reduced' : ''}`, battlecryCaption(event));
  if (source && !isReduced) { const rect = source.getBoundingClientRect(); caption.style.left = `${rect.left + rect.width / 2}px`; caption.style.top = `${Math.max(8, rect.top - 8)}px`; }
  els.flight.append(caption);
  setTimeout(() => caption.classList.add('is-fading'), TIMING.battlecry);
  setTimeout(() => caption.remove(), TIMING.battlecry * 2);
  if (event.kind === 'scout' && event.scouted) revealScout(event.side === 'player' ? 'enemy' : 'player', event.state);
  await wait(TIMING.battlecry);
}
async function playAttack(event) { const attacker = getUnitEl(event.uid), target = event.targetUid ? getUnitEl(event.targetUid) : els[event.side === 'player' ? 'enemy' : 'player'].hero.portrait; if (attacker && target) { const a = attacker.getBoundingClientRect(), b = target.getBoundingClientRect(); els.battle.querySelectorAll('.is-attacker:not(.fx-death), .is-target:not(.fx-death)').forEach(node => node.classList.remove('is-attacker', 'is-target')); const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2, factor = reducedMotion() ? 0 : Math.min(.28, 60 / (Math.hypot(dx, dy) || 1)); attacker.style.setProperty('--lunge-x', `${dx * factor}px`); attacker.style.setProperty('--lunge-y', `${dy * factor}px`); attacker.classList.add('is-attacker'); target.classList.add('is-target'); pulse(attacker, 'fx-lunge', TIMING.attack); } await wait(TIMING.attack); }
function damageFloater(target, amount, rect = target?.getBoundingClientRect()) { if (!target) return; const offset = target._floatAlternate ? 16 : -16; target._floatAlternate = !target._floatAlternate; const floater = el('span', 'damage-floater', typeof amount === 'number' ? `-${amount}` : amount); floater.style.left = `${rect.left + rect.width / 2 + offset}px`; floater.style.top = `${rect.top + rect.height * .35}px`; els.flight.append(floater); setTimeout(() => floater.remove(), TIMING.floater); }
function scheduleDeath(uid) { const entry = unitEls.get(uid); if (!entry || entry.dying) return; entry.dying = true; entry.el.classList.add('fx-death'); entry.el.style.pointerEvents = 'none'; let done = false; const finish = () => { if (done) return; done = true; entry.el.removeEventListener('animationend', onEnd); removeUnitEl(uid); }; const onEnd = event => { if (event.animationName === 'unit-death') finish(); }; entry.el.addEventListener('animationend', onEnd); setTimeout(() => { if (!done) { console.warn(`Death animation fallback fired for ${uid}`); finish(); } }, 500); }
async function playShift(event) { const shifting = []; for (const side of SIDES) event.state[side].board.forEach((unit, index) => { const entry = unitEls.get(unit.uid); if (entry && !entry.dying && entry.slotIndex !== index) shifting.push({ entry, index }); }); shifting.sort((a, b) => a.index - b.index).forEach(({ entry, index }, order) => { entry.slotIndex = index; entry.el.style.transitionDelay = `${order * TIMING.stagger}ms`; entry.el.style.transform = `translate3d(${index * slotPitch}px, 0, 0)`; setTimeout(() => { entry.el.style.transitionDelay = '0ms'; }, TIMING.shift + order * TIMING.stagger); }); reconcile(event.state); await wait(TIMING.shift + Math.max(0, shifting.length - 1) * TIMING.stagger); }

async function playEvent(event, deployUids) {
  els.phase.textContent = `${event.phase.toUpperCase()} · ROUND ${event.round}`;
  if (event.type === 'reveal') return playReveal(event); if (event.type === 'deploy') return playDeploy(event);
  if (event.type === 'battlecry') return playBattlecry(event);
  if (event.type === 'summon') { if (!deployUids.has(event.uid)) { const unit = event.state[event.side].board.find(item => item.uid === event.uid), index = event.state[event.side].board.findIndex(item => item.uid === event.uid); if (unit) pulse(createUnitEl(unit.uid, unit, event.side, index, event.state), 'fx-deploy-pop', TIMING.summon); } reconcile(event.state); await wait(TIMING.summon); return; }
  if (event.type === 'tick') { reconcile(event.state); pulse(els[event.side].charger.querySelector('.cost-dot__count'), 'fx-tick', TIMING.tick); await wait(TIMING.tick); return; }
  if (event.type === 'attack') return playAttack(event);
  if (event.type === 'damage') { const target = getUnitEl(event.uid), rect = target?.getBoundingClientRect(); reconcile(event.state); pulse(target, 'fx-hit', TIMING.damage); damageFloater(target, event.amount, rect); await wait(TIMING.damage); return; }
  if (event.type === 'death') { scheduleDeath(event.uid); await wait(TIMING.death); return; } if (event.type === 'shift') return playShift(event);
  if (event.type === 'heroHit') { reconcile(event.state); pulse(els[event.side].hero.portrait, 'fx-hit', TIMING.heroHit); pulse(els[event.side].root, 'fx-hero-hit', TIMING.heroHit); await wait(TIMING.heroHit); return; }
  if (event.type === 'shield') { const target = getUnitEl(event.uid), rect = target?.getBoundingClientRect(); reconcile(event.state); damageFloater(target, 'BLOCKED', rect); pulse(getUnitEl(event.uid), 'fx-shield', TIMING.shield); await wait(TIMING.shield); return; }
  if (event.type === 'chargerDestroyed') { pulse(els[event.side].charger, 'fx-shatter', TIMING.chargerDestroyed); await wait(TIMING.chargerDestroyed); clearCharger(event.side); reconcile(event.state); return; }
  if (event.type === 'stalemate') { pulse(els.player.hero.panel, 'fx-stalemate', TIMING.stalemate); pulse(els.enemy.hero.panel, 'fx-stalemate', TIMING.stalemate); appendLog(`Stalemate: ${event.winner} wins`); await wait(TIMING.stalemate); return; }
  if (event.type === 'cleanup') { await wait(TIMING.cleanup); return; } reconcile(event.state); await wait(TIMING[event.type] || 55);
}
export async function playEvents(eventStream) {
  const deployUids = new Set(eventStream.filter(event => event.type === 'deploy').map(event => event.uid)); let lastAttack = null;
  for (const event of eventStream) {
    if (event.type === 'attack') { if (lastAttack === event.uid && event.state[event.side].board.find(unit => unit.uid === event.uid)?.keywords.includes('windfury')) await wait(150); lastAttack = event.uid; }
    await playEvent(event, deployUids); if (!['attack', 'damage', 'shield', 'heroHit'].includes(event.type)) els.battle.querySelectorAll('.is-attacker:not(.fx-death), .is-target:not(.fx-death)').forEach(node => node.classList.remove('is-attacker', 'is-target')); setText(els.phase, `${event.phase.toUpperCase()} ? ROUND ${event.round}`); appendEventLog(event);
  }
}

// LOG
function appendLog(message) { if (!els?.history || !message) return; const line = els.history.firstElementChild; line.textContent = message; els.history.appendChild(line); setText(els.live, message); }
function appendEventLog(event) {
  const side = event.side || unitEls.get(event.uid)?.side, who = side === 'player' ? 'Your' : 'Enemy';
  if (event.type === 'heroHit') appendLog(`${who} hero takes ${event.amount}`);
  if (event.type === 'deploy') appendLog(`${who} ${event.unit || 'unit'} enters`);
  if (event.type === 'death') appendLog(`${who} ${event.unit || 'unit'} falls`);
  if (event.type === 'shield') appendLog(`${who} shield blocks damage`);
  if (event.type === 'chargerDestroyed') appendLog(`${who} charger is destroyed`);
  if (event.type === 'battlecry') appendLog(`${event.unit} — ${battlecryCaption(event)}.`);
}

function button(label, handler) { const node = el('button', 'primary', label); node.addEventListener('click', handler); return node; }
function showTitle() { stopped = true; const screen = el('section', 'screen title'); screen.append(el('div', 'title-mark', 'DECK AUTO BATTLER'), el('p', '', 'Build a warband. Watch the line break. Carry every wound.'), button('Start Run', startRun)); app.replaceChildren(screen); }
function startRun() { run = createRun(); stopped = false; beginFight(); }
async function beginFight() { fight = startRunFight(run); mountBattleScreen(fight); await wait(500); while (!fight.over && !stopped) { runRound(fight); await playEvents(fight.events); await wait(600); } if (stopped) return; finishRunFight(run, fight); if (run.lost) return showEnd(false); if (run.won) return showEnd(true); await wait(500); showDraft(0); }
function tooltip(card) { return battlecryText(card) || [...(card.keywords || []), card.deathrattle && 'Deathrattle', card.aura && 'Aura'].filter(Boolean).join(' · ') || 'No deploy effect.'; }
export function draftCard(def, choose = () => {}) { const node = el('button', 'draft-card'), visual = el('span', 'draft-visual'); visual.append(img('draft-art', portrait(def.id), ''), img('draft-frame', frameFor(def.cost), '')); node.append(visual, el('strong', '', def.name), el('span', '', `${def.cost} turn${def.cost > 1 ? 's' : ''}`), el('b', '', `${def.atk} / ${def.hp}`), el('small', 'draft-effect', tooltip(def)), el('span', 'draft-confirm', 'Choose card')); node.addEventListener('click', () => choose(def)); return node; }
function showDraft(pick) { const screen = el('section', 'screen draft'); screen.append(img('banner', 'assets/banner_draft.png', ''), el('h1', '', 'CHOOSE ONE'), el('p', '', `Pick ${pick + 1} of 2 · Deck ${run.deck.length} cards`)); const offers = el('div'); offers.id = 'offers'; for (const def of draftOffers(run.rng)) offers.append(draftCard(def, chosen => { run.deck.push(chosen); pick === 0 ? showDraft(1) : beginFight(); })); screen.append(offers); app.replaceChildren(screen); }
function showEnd(won) { stopped = true; const screen = el('section', `screen end ${won ? 'won' : 'lost'}`); screen.append(img('banner', 'assets/banner_victory.png', ''), el('h1', '', won ? 'RUN VICTORY' : 'RUN DEFEAT'), el('p', '', won ? `The war-camp falls. ${run.hp} HP remains.` : 'The line broke. Build again.'), button('Restart', startRun)); app.replaceChildren(screen); }
if (app && !globalThis.__DECK_BATTLER_NO_BOOT__) showTitle();
