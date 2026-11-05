import { CARD_POOL, RUN_CONFIG, STARTERS, createRun, draftOffers, effectiveStats, fightBoss, finishRunFight, gapKind, getCard, runEndSnapshot, runRound, snapshotView, startRunFight } from './engine.js';
import { initAudio, isMuted, playSfx, setMuted } from './audio.js';

// CONSTANTS
export const TIMING = Object.freeze({ reveal: 300, tick: 250, deploy: 400, battlecry: 300, summonPing: 250, statChange: 250, captionFade: 300, turnStart: 150, attack: 350, impactDelay: 140, hitStop: 75, idle: 2400, emberMin: 9000, emberStep: 420, damage: 200, death: 400, deathFallback: 500, shift: 300, heroHit: 200, shield: 250, summon: 250, chargerDestroyed: 250, stalemate: 400, cleanup: 55, stagger: 40, floater: 600, pop: 250, hp: 250, hover: 200, bannerIn: 250, bannerHold: 500, bannerOut: 250, betweenRounds: 600, windfuryGap: 150 });
export const SPEEDS = Object.freeze([1, 2, 3, 5, 10]);
export const API_BASE = (() => { try { return localStorage.getItem('dab_api_base') || 'https://deck-auto-battler-api.workers.dev'; } catch { return 'https://deck-auto-battler-api.workers.dev'; } })();
const readSpeed = () => { try { const value = Number(localStorage.getItem('dab_speed')); return SPEEDS.includes(value) ? value : 2; } catch { return 2; } };
let playbackSpeed = typeof window === 'undefined' ? 2 : readSpeed();
export const dur = ms => Math.round(ms * 2 / playbackSpeed);
const SIDES = ['enemy', 'player'];
const HERO_MAX = 40;
const app = typeof document === 'undefined' ? null : document.querySelector('#app');
const wait = ms => new Promise(resolve => setTimeout(resolve, dur(ms)));
const portrait = id => `assets/portrait_${id}.png`;
const frameFor = tier => `assets/frame_${['common', 'rare', 'mythic'].includes(tier) ? tier : 'common'}.png`;
const iconFor = key => ({ shield: 'icon_ds.png', poisonous: 'icon_poison.png', windfury: 'icon_wf.png', battlecry: 'icon_bc.png', deathrattle: 'icon_dr.png', aura: 'icon_aura.png' }[key]);
const definitionFor = unit => CARD_POOL.find(card => card.id === unit?.cardId) || unit;
const unitPortrait = unit => unit?.boss ? portrait(`boss_${unit.boss === 'hive' ? 'hivematron' : 'warherald'}`) : unit?.token ? portrait('brood_wisp') : (unit?.cardId || unit?.id) === 'enemy_grunt' ? portrait('sellsword') : (unit?.cardId || unit?.id) === 'enemy_brute' ? portrait('road_ogre') : portrait(unit?.portraitId || unit?.cardId || unit?.id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const img = (className, src, alt = '') => { const node = el('img', className); node.src = src; node.alt = alt; return node; };

let run, fight, stopped = false, els = null, slotWidth = 128, slotGap = 12, slotPitch = 140, cardHeight = 192, lastSnapshot = null, lastRenderedRound = 0;
let deckQueues = { player: [], enemy: [] };
let deckKnown = { player: true, enemy: true };
let authUser = null;
let premiumEntitled = false;

const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* offline/private storage remains playable */ } };
try { authUser = JSON.parse(stored('dab_user') || 'null'); } catch { authUser = null; }
function ensureGuestToken() {
  let token = stored('dab_guest_token');
  if (!token) { token = crypto.randomUUID(); store('dab_guest_token', token); }
  return token;
}
export function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers);
  const token = stored('dab_session');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
async function requestAuth(path, body, headers = {}) {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`auth request failed (${response.status})`);
  const result = await response.json();
  store('dab_session', result.token);
  store('dab_user', JSON.stringify(result.user));
  authUser = result.user;
  return result;
}
async function syncGuest() {
  try {
    if (sessionStorage.getItem('dab_guest_synced')) return;
    sessionStorage.setItem('dab_guest_synced', '1');
  } catch { /* storage-disabled browsers may retry on a later mount */ }
  await requestAuth('/api/auth/guest', { guestToken: ensureGuestToken() });
}
async function refreshEntitlement() {
  premiumEntitled = false;
  try {
    const response = await apiFetch('/api/entitlement');
    if (response.ok) premiumEntitled = Boolean((await response.json()).premium);
  } catch { /* entitlement display is optional when offline */ }
}
async function bootstrapAuth() {
  ensureGuestToken();
  const session = stored('dab_session');
  if (session) {
    try {
      const response = await apiFetch('/api/auth/session');
      if (response.ok) {
        const result = await response.json(); authUser = result.user; store('dab_user', JSON.stringify(result.user));
        await refreshEntitlement(); showTitle(); return;
      }
    } catch { return; }
  }
  try { await syncGuest(); await refreshEntitlement(); showTitle(); } catch { /* auth durability never blocks local PvE */ }
}

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
  scout: 'On deploy: already scouted — enemy order is known.',
  duelist: 'On deploy: gain +2/+2 if no adjacent ally.',
  hexblade: 'On deploy: set the opposing unit to 1/1.',
  gravedigger: 'On deploy: summon a 1/2 for every death this combat.',
  meddler: "On deploy: return the enemy's charging card to its deck.",
  inquisitor: "On deploy: deal 3 damage to the enemy's strongest unit.",
  doom: "On deploy: destroy the enemy's charging card.",
  copycat: "On deploy: copy the opposing unit's ATK and HP.",
  cultist: 'On deploy: devour your leftmost other unit and gain its stats.',
  cataclysm: 'On deploy: deal 2 damage to every unit.',
  firebelch: 'On deploy: deal 1 damage to ALL enemy units.',
});
const DEATHRATTLE_TEXT = Object.freeze({
  summon1: 'Deathrattle: summon a 1/2.',
  summon2x2: 'Deathrattle: summon two 2/3s.',
  spite: 'Deathrattle: deal 1 damage to the opposing unit.',
  plague: 'Deathrattle: deal 1 damage to every enemy unit.',
  oppositeAtkDown: 'Deathrattle: the opposing unit loses 1 ATK.',
});
const AURA_TEXT = Object.freeze({ adjacentAtk: 'Aura: adjacent allies have +1 ATK.', all: 'Aura: your other units have +1/+1.' });
const bossText = card => card?.text || '';
const triggerText = card => card?.onKill ? `After this kills a unit, gain +${card.onKill === 'grow' ? 1 : card.onKill}/+${card.onKill === 'grow' ? 1 : card.onKill}.` : card?.onDamaged ? `When this takes damage and survives, gain +${card.onDamaged} Attack.` : card?.onSummonPing ? 'When any other unit enters a battlefield, deal 1 damage to it.' : '';
const KEYWORD_NAMES = Object.freeze({ shield: 'Divine Shield', poisonous: 'Poisonous', windfury: 'Windfury', battlecry: 'Battlecry', deathrattle: 'Deathrattle', aura: 'Aura' });
const printedKeywordsFor = card => ['shield', 'aura', 'poisonous', 'windfury', 'deathrattle', 'battlecry'].filter(key => key === 'shield' ? card.keywords?.includes('shield') || definitionFor(card)?.keywords?.includes('shield') : card[key] || card.keywords?.includes(key));
export const battlecryText = card => BATTLECRY_TEXT[card?.battlecry || card?.kind] || '';
const descriptorText = card => [bossText(card), battlecryText(card), DEATHRATTLE_TEXT[card?.deathrattle], AURA_TEXT[card?.aura], triggerText(card)].filter(Boolean).join(' ');
const describeUnit = (unit, stats, keys) => `Inspect ${unit.boss ? 'boss ' : ''}${unit.name}, ATK ${stats.atk}, HP ${stats.hp}${keys.length ? ', ' + keys.join(', ') : ''}${descriptorText(unit) ? `. ${descriptorText(unit)}` : ''}`;
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
  const dot = el('span', 'cost-dot', String(cost));
  if (withCount) dot.append(el('span', 'cost-dot__count', String(count)));
  return dot;
}

function createFace(card, classes = '') {
  const node = el('div', `card-face ${classes}`.trim());
  const def = definitionFor(card), tier = card?.boss ? 'mythic' : def?.tier || 'common'; node.style.setProperty('--card-trim', { common: '#b08d57', rare: '#c0c6d4', mythic: '#e8b84b' }[tier]);
  node.append(img('card__art', unitPortrait(card), ''), img('card__frame', frameFor(tier), ''), el('span', 'card__name', card?.name || def?.name || 'Unit'));
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
  const enemyNames = ['raider', 'dreadlord', 'hivelord'];
  const heroId = side === 'player' ? 'player' : `enemy_${enemyNames[Math.max(0, (fight?.fight || 1) - 1)]}`;
  const portraitEl = img('hero-portrait', `assets/hero_${heroId}.png`, `${side} hero`);
  const hpbar = el('div', 'hero-hpbar'), fill = el('div', 'hero-hpbar__fill'), hpText = el('span', 'hero-hp__text');
  const label = el('span', 'hero-label'); hpbar.setAttribute('role', 'meter'); hpbar.setAttribute('aria-label', `${side === 'player' ? 'Your' : 'Enemy'} hero health`); hpbar.setAttribute('aria-valuemin', '0'); hpbar.setAttribute('aria-valuemax', String(HERO_MAX)); hpbar.append(fill); panel.append(portraitEl, label, hpbar, hpText); return { panel, portrait: portraitEl, fill, hpText, hpbar, label };
}

function createSide(side) {
  const root = el('div', `side side--${side}`), info = el('div', 'side__info');
  const hero = createHeroPanel(side), deck = createDeckStack(side), charger = el('div', 'charger-slot is-empty');
  const chargerLabel = el('span', 'charger-label', 'EMPTY'), plaque = el('div', 'deck-plaque'); plaque.id = `deck-detail-${side}`; deck.stack.setAttribute('aria-describedby', plaque.id); charger.append(chargerLabel); info.append(hero.panel, deck.stack, charger, plaque);
  if (side === 'player') { inspect(deck.stack, () => plaque.textContent); bindMouseHover(deck.stack, () => deckQueues.player[0] ? cardTipData(deckQueues.player[0]) : null); bindMouseHover(charger, () => lastSnapshot?.player?.charger ? cardTipData(lastSnapshot.player.charger.card) : null); }
  else { bindMouseHover(deck.stack, () => deckQueues.enemy[0] ? cardTipData(deckQueues.enemy[0]) : null); bindMouseHover(charger, () => lastSnapshot?.enemy?.charger ? cardTipData(lastSnapshot.enemy.charger.card) : null); }
  deck.stack.setAttribute('aria-label', side === 'player' ? 'Inspect your next card' : 'Inspect the public enemy draw order');
  const scroll = el('div', 'board-scroll'), lane = el('div', 'board-lane'), ghosts = el('div', 'slot-ghosts');
  for (let n = 0; n < 5; n++) ghosts.append(el('div', 'slot-ghost'));
  const empty = el('span', 'board-empty', 'NO UNITS IN LINE');
  lane.append(ghosts, empty); scroll.append(lane); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', side === 'player' ? 'Your line' : 'Enemy line');
  const prev = el('button', 'lane-arrow lane-arrow--prev', '‹'), next = el('button', 'lane-arrow lane-arrow--next', '›');
  prev.setAttribute('aria-label', 'Scroll previous slot'); next.setAttribute('aria-label', 'Scroll next slot');
  const updateArrows = left => { const position = left ?? scroll.scrollLeft; prev.disabled = position <= 0; next.disabled = position >= scroll.scrollWidth - scroll.clientWidth - 1; };
  prev.addEventListener('click', () => scrollBattleLanesBy(-slotPitch, scroll)); next.addEventListener('click', () => scrollBattleLanesBy(slotPitch, scroll));
  scroll.addEventListener('scroll', () => updateArrows()); scroll.addEventListener('keydown', event => { if (event.target === scroll && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); scrollBattleLanesBy(event.key === 'ArrowLeft' ? -slotPitch : slotPitch, scroll); } });
  prev.disabled = true; root.append(info, scroll, prev, next); return { root, hero, deck, charger, chargerLabel, plaque, scroll, lane, ghosts, empty, updateArrows };
}

let synchronizingBattleLanes = false;
function setBattleScrollLeft(left) {
  if (!els?.enemy || !els?.player) return;
  const max = Math.min(...SIDES.map(side => Math.max(0, els[side].scroll.scrollWidth - els[side].scroll.clientWidth)));
  const position = Math.max(0, Math.min(left, max)); synchronizingBattleLanes = true;
  for (const side of SIDES) { els[side].scroll.scrollLeft = position; els[side].updateArrows(position); }
  synchronizingBattleLanes = false;
}
function scrollBattleLanesBy(delta, source) { setBattleScrollLeft((source?.scrollLeft ?? els?.player?.scroll.scrollLeft ?? 0) + delta); }
function bindSynchronizedBattleLanes() {
  for (const side of SIDES) els[side].scroll.addEventListener('scroll', () => { if (!synchronizingBattleLanes) setBattleScrollLeft(els[side].scroll.scrollLeft); });
  setBattleScrollLeft(0);
}

function replaceDeckTop(side, card) {
  const refs = els?.[side]; if (!refs) return;
  const old = refs.deck.top;
  // A reveal can prove our queue stale, but snapshots cannot supply the new deck.
  // Never fabricate the next face/count from that stale mirror (Meddler contract gap).
  if (!deckKnown[side]) { old?.remove(); refs.deck.top = null; setText(refs.deck.count, '?'); setText(refs.plaque, 'NEXT CARD HIDDEN'); if (side === 'player') setText(els.headerCount, 'YOUR DECK ?'); return; }
  setText(refs.plaque, card ? `${card.name} · COST ${card.cost} · ATK ${card.atk} · HP ${card.hp}${card.battlecry ? ` · ${battlecryText(card)}` : ''}` : 'DECK EMPTY · No more arrivals');
  const count = String(deckQueues[side].length); setText(refs.deck.count, side === 'enemy' ? `${count} left` : count); if (side === 'player') setText(els.headerCount, `YOUR DECK ${count}`);
  if (!card) { old?.remove(); refs.deck.top = null; refs.deck.stack.classList.add('is-empty'); refs.deck.count.textContent = side === 'enemy' ? '0 left' : '0'; return; }
  const top = el('div', 'deck-top');
  top.append(createFace(card, 'card--mini'));
  if (old) old.replaceWith(top); else refs.deck.stack.insertBefore(top, refs.deck.count);
  refs.deck.top = top; refs.deck.stack.classList.remove('is-empty');
}

export function mountBattleScreen(initialState, root = app) {
  if (!root) throw new Error('mountBattleScreen requires a root element');
  unitEls.clear(); hideHoverTip(); root.replaceChildren(); fight = initialState; lastRenderedRound = 0;
  deckKnown = { player: true, enemy: true };
  deckQueues = { player: [...(initialState.player?.deck || [])], enemy: [...(initialState.enemy?.deck || [])] };
  const battle = el('section', 'battle'); battle.id = 'battle-screen'; battle.setAttribute('aria-live', 'off');
  const header = el('header', 'battle-header'), phase = el('span', 'battle-phase', `READY · ROUND ${initialState.round || 0}`), speedControl = el('div', 'speed-control'), speedLabel = el('span', 'sr-only', 'Playback speed');
  speedControl.setAttribute('role', 'group'); speedControl.setAttribute('aria-label', 'Playback speed');
  for (const value of SPEEDS) { const speedButton = el('button', 'speed-control__button', `${value}x`); speedButton.type = 'button'; speedButton.dataset.speed = String(value); speedButton.setAttribute('aria-pressed', String(value === playbackSpeed)); speedButton.addEventListener('click', () => setPlaybackSpeed(value)); speedControl.append(speedButton); }
  const muteButton = el('button', 'speed-control__button mute-toggle', isMuted() ? 'Sound off' : 'Sound on'); muteButton.type = 'button'; muteButton.setAttribute('aria-pressed', String(isMuted())); muteButton.addEventListener('click', () => { const muted = setMuted(!isMuted()); muteButton.textContent = muted ? 'Sound off' : 'Sound on'; muteButton.setAttribute('aria-pressed', String(muted)); }); speedControl.append(muteButton);
  header.append(el('b', 'battle-fight', `FIGHT ${initialState.fight || 1} / ${RUN_CONFIG.LEVELS}`), phase);
  const headerMeta = el('div', 'battle-header__meta'), headerCount = el('span', 'header-count'); headerMeta.append(headerCount, speedLabel, speedControl); header.append(headerMeta);
  const enemy = createSide('enemy'), log = el('div', 'battle-log'), player = createSide('player'), flight = el('div', 'flight-layer'), banner = el('div', 'turn-banner'), queue = createEnemyQueuePanel(), embers = el('div', 'ember-layer'); banner.hidden = true;
  embers.setAttribute('aria-hidden', 'true'); for (let i = 0; i < 16; i++) { const ember = el('i', 'ember'); ember.style.setProperty('--ember-x', `${(i * 37) % 101}%`); ember.style.setProperty('--ember-drift', `${(i % 5 - 2) * 13}px`); ember.style.setProperty('--ember-delay', `${-dur(i * 510)}ms`); ember.style.setProperty('--ember-duration', `${dur(TIMING.emberMin + (i % 7) * TIMING.emberStep)}ms`); embers.append(ember); }
  const openingPreview = createEnemyPreview(initialState.fight, initialState.enemy.deck, initialState.enemy.board); openingPreview.classList.add('enemy-preview--opening');
  battle.style.setProperty('--idle-duration', `${dur(TIMING.idle)}ms`); battle.append(embers, header, enemy.root, log, player.root, flight, banner, queue.panel, openingPreview); root.append(battle);
  const history = el('div', 'battle-log__history'), detail = el('div', 'battle-detail'), live = el('span', 'sr-only'), toggle = el('button', 'log-toggle', 'Log');
  detail.hidden = true; live.setAttribute('aria-live', 'polite'); toggle.setAttribute('aria-expanded', 'false'); history.id = 'battle-history'; toggle.setAttribute('aria-controls', history.id);
  for (let i = 0; i < 4; i++) history.append(el('p', 'battle-log__line', i === 3 ? 'Combat proceeds automatically' : ''));
  log.append(history, detail, live, toggle);
  toggle.addEventListener('click', () => { const open = log.classList.toggle('is-expanded'); toggle.setAttribute('aria-expanded', String(open)); });
  battle.addEventListener('keydown', event => { if (event.key === 'Escape') { detail.hidden = true; log.classList.remove('is-expanded'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
  battle.addEventListener('click', event => { if (event.target.closest('button')) playSfx('uiClick'); });
  els = { battle, phase, headerCount, speedControl, log, history, detail, live, flight, banner, openingPreview, queue, enemy, player }; bindSynchronizedBattleLanes();
  const toggleQueue = open => { queue.panel.hidden = open === undefined ? !queue.panel.hidden : !open; enemy.deck.stack.setAttribute('aria-expanded', String(!queue.panel.hidden)); };
  enemy.deck.stack.tabIndex = 0; enemy.deck.stack.setAttribute('role', 'button'); enemy.deck.stack.setAttribute('aria-controls', queue.panel.id); enemy.deck.stack.setAttribute('aria-expanded', 'false');
  enemy.deck.stack.addEventListener('pointerdown', () => { enemy.deck.stack._queueWasOpen = !queue.panel.hidden; });
  enemy.deck.stack.addEventListener('focus', () => toggleQueue(true)); enemy.deck.stack.addEventListener('click', () => toggleQueue(!enemy.deck.stack._queueWasOpen)); enemy.deck.stack.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleQueue(); } });
  const styles = getComputedStyle(battle);
  slotWidth = parseFloat(styles.getPropertyValue('--slot-w')) || 128; slotGap = parseFloat(styles.getPropertyValue('--slot-gap')) || 12; slotPitch = slotWidth + slotGap; cardHeight = parseFloat(styles.getPropertyValue('--card-h'));
  for (const key of ['--slot-w', '--slot-gap', '--card-h', '--name-size', '--name-line', '--pip-size', '--stat-size', '--badge-size', '--name-bottom']) battle.style.setProperty(key, styles.getPropertyValue(key));
  battle.dataset.cardTier = slotWidth === 112 ? 'mobile' : slotWidth === 216 ? 'large' : 'medium';
  for (const side of SIDES) replaceDeckTop(side, deckQueues[side][0]);
  updateEnemyQueuePanel();
  for (const side of SIDES) if (initialState[side]?.charger) populateCharger(side, initialState[side].charger);
  for (const side of SIDES) (initialState[side]?.board || []).forEach((unit, index) => createUnitEl(unit.uid, unit, side, index, initialState));
  if ((initialState.enemy?.board || []).some(unit => unit.boss)) playSfx('deploy');
  reconcile(snapshotView(initialState)); return els;
}

// REGISTRY
export const unitEls = new Map();
export function createUnitEl(uid, unit, side, slotIndex, snapshot = lastSnapshot) {
  if (unitEls.has(uid)) return unitEls.get(uid).el;
  const card = el('article', `card${unit.boss ? ' boss' : ''}`); card.dataset.uid = uid; card.style.transform = `translate3d(${slotIndex * slotPitch}px, 0, 0)`;
  const stats = snapshot ? effectiveStats(snapshot, side, unit) : { atk: unit.baseAtk ?? unit.atk, hp: (unit.baseMaxHp ?? unit.hp) - (unit.damage || 0) };
  const idle = el('div', `card__idle card__idle--${side}`), atk = el('span', 'card__atk', String(stats.atk)), hp = el('span', 'card__hp', String(stats.hp)), badges = el('div', 'card__badges');
  const badgeEls = new Map();
  for (const key of ['shield', 'aura', 'poisonous', 'windfury', 'deathrattle', 'battlecry']) { const badge = img('card__badge', `assets/${iconFor(key)}`, key); badge.title = key === 'battlecry' ? battlecryText(unit) : key; badges.append(badge); badgeEls.set(key, badge); }
  const more = el('span', 'card__badge card__badge--more'); badges.append(more);
  idle.append(createFace(unit), atk, hp, badges); if (unit.boss) idle.append(el('p', 'card__trait', bossText(unit)), el('em', 'card__crown', '♛')); card.append(idle);
  inspect(card, () => card.getAttribute('aria-label'));
  bindMouseHover(card, () => { const entry = unitEls.get(uid), current = lastSnapshot?.[side]?.board.find(item => item.uid === uid); return entry && current ? cardTipData(current, { atk: entry.atk, hp: entry.hp, maxHp: effectiveStats(lastSnapshot, side, current).maxHp }) : null; });

  els[side].lane.append(card); unitEls.set(uid, { el: card, side, slotIndex, atk: stats.atk, hp: stats.hp, atkEl: atk, hpEl: hp, badgeEls, more, dying: false }); return card;
}
export function getUnitEl(uid) { return unitEls.get(uid)?.el || null; }
export function removeUnitEl(uid) { const entry = unitEls.get(uid); if (entry) { if (els.detail.owner === entry.el) { els.detail.hidden = true; els.detail.textContent = ''; els.detail.owner = null; } entry.el.remove(); unitEls.delete(uid); } }

export function setPlaybackSpeed(value) {
  if (!SPEEDS.includes(Number(value))) return; playbackSpeed = Number(value);
  try { localStorage.setItem('dab_speed', String(playbackSpeed)); } catch { /* storage may be unavailable */ }
  els?.speedControl?.querySelectorAll('.speed-control__button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === playbackSpeed)));
}

function createEnemyQueuePanel() {
  const panel = el('aside', 'enemy-queue-panel'), list = el('ol', 'enemy-queue-list');
  panel.hidden = true; panel.id = 'enemy-queue-panel';
  const items = Array.from({ length: 8 }, () => { const item = el('li'); item.hidden = true; list.append(item); return item; });
  panel.append(el('h2', '', 'ENEMY DRAW ORDER'), list); return { panel, list, items };
}

// RECONCILE
function updateHero(side, state) {
  const refs = els[side].hero, max = state.maxHp || HERO_MAX, hp = Math.max(0, state.hp), pct = Math.max(0, Math.min(100, hp / max * 100));
  if (refs.hp === hp && refs.max === max) return;
  const previous = refs.hp === undefined ? pct : refs.hp / (refs.max || max) * 100;
  refs.hpbar.style.setProperty('--loss-from', `${previous}%`); refs.hpbar.style.setProperty('--health', `${pct}%`);
  refs.fill.style.transitionDuration = `${dur(TIMING.hp)}ms`;
  if (hp < refs.hp) { refs.hpbar.getAnimations().forEach(animation => animation.cancel()); refs.hpbar.animate([{ width: `${previous}%` }, { width: `${pct}%` }], { duration: dur(TIMING.hp), easing: 'ease-in', pseudoElement: '::before' }); }
  refs.hpbar.setAttribute('aria-valuenow', String(hp)); refs.hpbar.setAttribute('aria-valuemax', String(max));
  setText(refs.hpText, `${hp} / ${max}`); refs.fill.style.width = `${pct}%`;
  refs.panel.classList.toggle('is-low', hp <= max * .25); refs.panel.classList.toggle('is-healing', hp > refs.hp);
  setText(refs.label, `${side === 'player' ? 'YOU' : 'ENEMY'}${hp <= max * .25 ? ' · LOW HP' : side === 'player' ? ' · CARRIED HP' : ' HERO'}`);
  refs.label.dataset.compact = `${side === 'player' ? 'YOU' : 'ENEMY'}${hp <= max * .25 ? ' \u00b7 LOW HP' : ''}`; refs.hp = hp; refs.max = max;
}
export function reconcile(snapshot) {
  if (!els || !snapshot) return; lastSnapshot = snapshot;
  if (snapshot.enemy.deck) { deckQueues.enemy = [...snapshot.enemy.deck]; replaceDeckTop('enemy', deckQueues.enemy[0]); updateEnemyQueuePanel(); }
  for (const side of SIDES) {
    updateHero(side, snapshot[side]);
    const boardEmptyHidden = snapshot[side].board.length > 0; if (els[side].empty.hidden !== boardEmptyHidden) els[side].empty.hidden = boardEmptyHidden;
    const charge = snapshot[side].charger;
    setText(els[side].chargerLabel, charge ? els[side].charger.querySelector('.is-scout-revealed') ? 'SCOUTED' : charge.counter === 0 ? snapshot[side].board.length >= 20 ? 'WAITING' : 'READY' : 'CHARGING' : deckQueues[side].length ? 'EMPTY' : 'NO ARRIVAL');
    const chargeLabel = charge ? `${side === 'player' ? 'Your' : 'Enemy'} charger, ${charge.card.name}, cost ${charge.card.cost}, remaining ${charge.counter}` : `${side === 'player' ? 'Your' : 'Enemy'} charger, ${els[side].chargerLabel.textContent}`;
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
  const visual = createFace(charger.card, 'charger-card');
  visual.append(createCostDot(charger.card.cost));
  slot.append(visual, el('span', 'cost-dot__count', String(charger.counter))); setText(els[side].chargerLabel, charger.counter === 0 ? 'READY' : 'CHARGING');
}
function clearCharger(side) { populateCharger(side, null); }
function makeFlightVisual(card, includeFace, includeCost = true) { const ghost = el('div', 'card-ghost is-flying'), visual = includeFace ? createFace(card) : createBack(card.cost); if (includeFace && includeCost) visual.append(createCostDot(card.cost)); ghost.append(visual); return ghost; }

export async function flyCard(startEl, destRect, content, duration, keyframeOpts = {}) {
  const startRect = startEl.getBoundingClientRect(), dx = destRect.left - startRect.left, dy = destRect.top - startRect.top, scale = startRect.width ? destRect.width / startRect.width : 1;
  startEl.classList.add('is-vacant'); Object.assign(content.style, { left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, height: `${startRect.height}px` }); els.flight.append(content);
  const overshoot = keyframeOpts.overshoot && Math.abs(dx) > 1 ? Math.sign(dx) * 10 : 0, overshootY = keyframeOpts.overshoot && Math.abs(dx) <= 1 ? (Math.sign(dy) || 1) * 10 : 0;
  const keyframes = keyframeOpts.overshoot ? [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .7, transform: `translate3d(${dx + overshoot}px,${dy + overshootY}px,0) scale(${scale * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }] : [{ transform: 'translate3d(0,0,0) scale(1)' }, { offset: .5, transform: `translate3d(${dx / 2}px,${dy / 2 - 12}px,0) scale(${(1 + scale) / 2 * 1.05})` }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }];
  const scaled = dur(duration), animation = content.animate(reducedMotion() ? [{ opacity: .7 }, { opacity: .7 }] : keyframes, { duration: scaled, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  try { await Promise.race([animation.finished, new Promise(resolve => setTimeout(resolve, scaled))]); } catch { /* cancelled fight */ }
  content.remove(); startEl.classList.remove('is-vacant');
}

async function playReveal(event) {
  const side = event.side, source = els[side].deck.top || els[side].deck.stack, charger = event.state[side].charger;
  if (!source || !charger) { await wait(TIMING.reveal); return; }
  const destination = els[side].charger.getBoundingClientRect(), ghost = makeFlightVisual(charger.card, true);
  await flyCard(source, destination, ghost, TIMING.reveal); playSfx('reveal'); populateCharger(side, charger); if (side === 'enemy' && event.state.enemy.deck) deckQueues.enemy = [...event.state.enemy.deck]; else { if (deckQueues[side][0]?.id !== charger.card.id) deckKnown[side] = false; if (deckKnown[side]) deckQueues[side].shift(); } replaceDeckTop(side, deckQueues[side][0]); updateEnemyQueuePanel();
}
function autoScrollFor(side, slotIndex) { const scroll = els[side].scroll, left = slotIndex * slotPitch, right = left + slotWidth; if (right > scroll.scrollLeft + scroll.clientWidth - 8 || left < scroll.scrollLeft + 8) setBattleScrollLeft(left + slotWidth / 2 - scroll.clientWidth / 2); }
function destinationRect(side, slotIndex) { const rect = els[side].lane.getBoundingClientRect(); return { left: rect.left + slotIndex * slotPitch, top: rect.top, width: slotWidth, height: cardHeight }; }
async function playDeploy(event) {
  const side = event.side, unit = event.state[side].board.find(item => item.uid === event.uid); if (!unit) { await wait(TIMING.deploy); return; }
  const slotIndex = event.state[side].board.findIndex(item => item.uid === event.uid); autoScrollFor(side, slotIndex); const dest = destinationRect(side, slotIndex), ghost = makeFlightVisual(unit, true, true);
  await flyCard(els[side].charger, dest, ghost, TIMING.deploy, { overshoot: true }); playSfx('deploy'); const card = createUnitEl(unit.uid, unit, side, slotIndex, event.state); pulse(card, 'fx-deploy-pop', TIMING.pop); if (unit.dead) scheduleDeath(unit.uid); clearCharger(side); reconcile(event.state);
}

let hoverTip = null, hoverTimer = null, hoverOwner = null;
function ensureHoverTip() {
  if (hoverTip?.root?.isConnected) return hoverTip;
  const root = el('aside', 'card-hover-tip'), name = el('strong', 'card-hover-tip__name'), cost = el('span', 'card-hover-tip__cost'), stats = el('span', 'card-hover-tip__stats'), base = el('span', 'card-hover-tip__base'), keywords = el('div', 'card-hover-tip__keywords'), text = el('p', 'card-hover-tip__text'), keywordEls = new Map();
  for (const key of Object.keys(KEYWORD_NAMES)) { const keyword = el('span', `card-hover-tip__keyword card-hover-tip__keyword--${key}`); keywords.append(keyword); keywordEls.set(key, keyword); }
  root.hidden = true; root.setAttribute('role', 'tooltip'); root.append(name, cost, stats, base, keywords, text); document.body.append(root); hoverTip = { root, name, cost, stats, base, keywords, keywordEls, text }; return hoverTip;
}
function hideHoverTip(node) { if (node && hoverOwner !== node) return; clearTimeout(hoverTimer); hoverTimer = null; hoverOwner = null; if (hoverTip) hoverTip.root.hidden = true; }
function positionHoverTip(event) {
  if (!hoverTip || hoverTip.root.hidden) return;
  const gap = 14, rect = hoverTip.root.getBoundingClientRect(); let left = event.clientX + gap, top = event.clientY + gap;
  if (left + rect.width > innerWidth - 8) left = event.clientX - rect.width - gap;
  if (top + rect.height > innerHeight - 8) top = event.clientY - rect.height - gap;
  hoverTip.root.style.left = `${scrollX + Math.max(8, left)}px`; hoverTip.root.style.top = `${scrollY + Math.max(8, top)}px`;
}
function showHoverTip(node, data, event) {
  if (!data || hoverOwner !== node) return; const tip = ensureHoverTip(), keys = data.keys || [];
  tip.name.textContent = data.name; tip.cost.textContent = String(data.cost ?? 0); tip.stats.textContent = `ATK ${data.atk}  ·  HP ${data.hp}`;
  tip.base.textContent = data.base && (data.base.atk !== data.atk || data.base.hp !== data.maxHp) ? `Base ${data.base.atk}/${data.base.hp}` : '';
  tip.keywordEls.forEach((keyword, key) => { keyword.textContent = KEYWORD_NAMES[key]; keyword.classList.toggle('is-visible', keys.includes(key)); }); tip.keywords.classList.toggle('is-empty', keys.length === 0); tip.text.textContent = data.text || 'No special ability.';
  tip.root.hidden = false; positionHoverTip(event);
}
function bindMouseHover(node, getData) {
  let latestEvent = null;
  node.addEventListener('mouseenter', event => { latestEvent = event; hoverOwner = node; clearTimeout(hoverTimer); hoverTimer = setTimeout(() => showHoverTip(node, getData(), latestEvent), dur(TIMING.hover)); });
  node.addEventListener('mousemove', event => { latestEvent = event; positionHoverTip(event); });
  node.addEventListener('mouseleave', () => hideHoverTip(node));
}
function cardTipData(card, stats = null) {
  const def = definitionFor(card), resolved = stats || { atk: card.atk ?? card.baseAtk, hp: card.hp ?? card.baseMaxHp, maxHp: card.hp ?? card.baseMaxHp };
  return { name: card.name || def.name, cost: def.cost ?? 0, atk: resolved.atk, hp: resolved.hp, maxHp: resolved.maxHp ?? resolved.hp, base: { atk: card.baseAtk ?? def.atk, hp: card.baseMaxHp ?? def.hp }, keys: printedKeywordsFor(card), text: descriptorText(card) };
}
function pulse(node, className, duration) { if (node) { const scaled = dur(duration); node.style.setProperty('--fx-duration', `${scaled}ms`); node.classList.add(className); setTimeout(() => { node.classList.remove(className); node.style.removeProperty('--fx-duration'); }, scaled); } }
function battlecryCaption(event) {
  const target = event.target || event.targets?.join(' and ');
  if (event.kind === 'hex_hurler') return target ? `Battlecry: 2 damage → ${target}` : 'Battlecry: no opposing unit';
  if (event.kind === 'inquisitor') return target ? 'Battlecry: 3 damage → strongest enemy' : 'Battlecry: no enemy units';
  if (event.kind === 'hexblade') return target ? `Battlecry: ${target} becomes 1/1` : 'Battlecry: no opposing unit';
  if (event.kind === 'copycat') return target ? `Battlecry: copy ${target}'s stats` : 'Battlecry: no opposing unit';
  if (event.kind === 'cultist') return target ? `Battlecry: devour ${target}` : 'Battlecry: no ally to devour';
  if (event.kind === 'gate') return event.moved ? `Battlecry: shove ${target} right` : 'Battlecry: no unit to shove';
  if (event.kind === 'cataclysm') return 'Battlecry: 2 damage to all units';
  if (event.kind === 'firebelch') return event.targetUids?.length ? 'Battlecry: 1 damage to all enemies' : 'Battlecry: no enemy units';
  if (event.kind === 'squire') return event.neighborIndices?.length ? 'Battlecry: adjacent allies gain +1/+1' : 'Battlecry: no adjacent allies';
  if (event.kind === 'gravedigger') return event.count ? `Battlecry: summon ${event.count} token${event.count === 1 ? '' : 's'}` : 'Battlecry: no fallen units';
  if (event.kind === 'duelist') return event.applied ? 'Battlecry: gain +2/+2' : 'Battlecry: adjacent ally prevents gain';
  if (event.kind === 'tax') return event.counterDelta ? 'Battlecry: enemy charge +1 turn' : 'Battlecry: no enemy charging';
  if (event.kind === 'chrono') return event.counterDelta ? `Battlecry: own charge -1 turn${event.deployed ? ' and deploy' : ''}` : 'Battlecry: no friendly charge';
  if (event.kind === 'scout') return 'Battlecry: already scouted — enemy order is known';
  if (event.kind === 'doom') return event.destroyed ? 'Battlecry: destroy enemy charge' : 'Battlecry: no enemy charging';
  if (event.kind === 'meddler') return event.returned ? 'Battlecry: return enemy charge' : 'Battlecry: no enemy charging';
  return `Battlecry: ${battlecryText(event).replace(/^On deploy:\s*/i, '') || 'no effect'}`;
}
async function playBattlecry(event) {
  const source = getUnitEl(event.uid);
  const targets = Array.isArray(event.targetUids) ? event.targetUids.map(getUnitEl).filter(Boolean) : event.all ? [...unitEls.values()].map(entry => entry.el) : [event.targetUid].filter(Boolean).map(getUnitEl).filter(Boolean);
  pulse(source, 'fx-battlecry-source', TIMING.battlecry);
  for (const target of new Set(targets.filter(node => node !== source))) pulse(target, 'fx-battlecry-target', TIMING.battlecry);
  const isReduced = reducedMotion(), caption = el('span', `battlecry-caption${isReduced ? ' is-reduced' : ''}`, battlecryCaption(event));
  if (source && !isReduced) { const rect = source.getBoundingClientRect(); caption.style.left = `${rect.left + rect.width / 2}px`; caption.style.top = `${Math.max(8, rect.top - 8)}px`; }
  els.flight.append(caption);
  caption.style.setProperty('--caption-fade', `${dur(TIMING.captionFade)}ms`);
  setTimeout(() => caption.classList.add('is-fading'), dur(TIMING.battlecry));
  setTimeout(() => caption.remove(), dur(TIMING.battlecry + TIMING.captionFade));
  await wait(TIMING.battlecry);
}
async function playAttack(event) {
  const attacker = getUnitEl(event.uid), target = event.targetUid ? getUnitEl(event.targetUid) : els[event.side === 'player' ? 'enemy' : 'player'].hero.portrait;
  if (!attacker || !target) { await wait(TIMING.attack); return; }
  const a = attacker.getBoundingClientRect(), b = target.getBoundingClientRect(); els.battle.querySelectorAll('.is-attacker:not(.fx-death), .is-target:not(.fx-death)').forEach(node => node.classList.remove('is-attacker', 'is-target'));
  const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2, factor = reducedMotion() ? 0 : Math.min(.28, 60 / (Math.hypot(dx, dy) || 1));
  attacker.style.setProperty('--lunge-x', `${dx * factor}px`); attacker.style.setProperty('--lunge-y', `${dy * factor}px`); attacker.style.setProperty('--fx-duration', `${dur(TIMING.attack + (event.targetUid ? TIMING.hitStop : 0))}ms`); attacker.classList.add('is-attacker', 'fx-lunge'); target.classList.add('is-target');
  if (event.targetUid) { await wait(TIMING.impactDelay); attacker.classList.add('fx-hit-stop'); playSfx('impact'); await wait(TIMING.hitStop); attacker.classList.remove('fx-hit-stop'); await wait(TIMING.attack - TIMING.impactDelay); }
  else await wait(TIMING.attack);
  attacker.classList.remove('fx-lunge'); attacker.style.removeProperty('--fx-duration');
}
function damageFloater(target, amount, rect = target?.getBoundingClientRect()) { if (!target) return; const offset = target._floatAlternate ? 16 : -16; target._floatAlternate = !target._floatAlternate; const floater = el('span', 'damage-floater', typeof amount === 'number' ? `-${amount}` : amount); floater.style.left = `${rect.left + rect.width / 2 + offset}px`; floater.style.top = `${rect.top + rect.height * .35}px`; floater.style.setProperty('--fx-duration', `${dur(TIMING.floater)}ms`); els.flight.append(floater); setTimeout(() => floater.remove(), dur(TIMING.floater)); }
function scheduleDeath(uid) { const entry = unitEls.get(uid); if (!entry || entry.dying) return; entry.dying = true; entry.el.style.setProperty('--fx-duration', `${dur(TIMING.death)}ms`); entry.el.classList.add('fx-death'); entry.el.style.pointerEvents = 'none'; entry.el.setAttribute('aria-disabled', 'true'); setTimeout(() => entry.el.classList.add('is-corpse'), dur(TIMING.death)); }
async function playShift(event) {
  const liveUids = new Set(SIDES.flatMap(side => event.state[side].board.map(unit => unit.uid)));
  for (const [uid, entry] of unitEls) if (entry.dying && !liveUids.has(uid)) removeUnitEl(uid);
  const shifting = [];
  for (const side of SIDES) event.state[side].board.forEach((unit, index) => { const entry = unitEls.get(unit.uid); if (entry && !entry.dying && entry.slotIndex !== index) shifting.push({ entry, index }); });
  shifting.sort((a, b) => a.index - b.index).forEach(({ entry, index }, order) => { entry.slotIndex = index; entry.el.style.transitionDuration = `${dur(TIMING.shift)}ms`; entry.el.style.transitionDelay = `${dur(order * TIMING.stagger)}ms`; entry.el.style.transform = `translate3d(${index * slotPitch}px, 0, 0)`; setTimeout(() => { entry.el.style.transitionDelay = '0ms'; }, dur(TIMING.shift + order * TIMING.stagger)); });
  reconcile(event.state); await wait(TIMING.shift + Math.max(0, shifting.length - 1) * TIMING.stagger);
}

async function playEvent(event, deployUids) {
  if (event.type === 'turnStart') {
    for (const side of SIDES) els[side].root.classList.toggle('is-active-turn', side === event.side);
    setText(els.phase, `ROUND ${event.round} · ${event.side === 'player' ? 'YOUR TURN' : 'ENEMY TURN'}`);
    await wait(TIMING.turnStart); return;
  }
  els.phase.textContent = `${event.phase.toUpperCase()} · ROUND ${event.round}`;
  if (event.type === 'reveal') return playReveal(event); if (event.type === 'deploy') return playDeploy(event);
  if (event.type === 'battlecry') return playBattlecry(event);
  if (event.type === 'summonPing') { pulse(getUnitEl(event.uid), 'fx-battlecry-source', TIMING.summonPing); pulse(getUnitEl(event.targetUid), 'fx-battlecry-target', TIMING.summonPing); await wait(TIMING.summonPing); return; }
  if (event.type === 'summon') { if (!deployUids.has(event.uid)) { const unit = event.state[event.side].board.find(item => item.uid === event.uid), index = event.state[event.side].board.findIndex(item => item.uid === event.uid); if (unit) pulse(createUnitEl(unit.uid, unit, event.side, index, event.state), 'fx-deploy-pop', TIMING.summon); } reconcile(event.state); await wait(TIMING.summon); return; }
  if (event.type === 'tick') { reconcile(event.state); playSfx('charge'); pulse(els[event.side].charger.querySelector('.cost-dot__count'), 'fx-tick', TIMING.tick); await wait(TIMING.tick); return; }
  if (event.type === 'attack') return playAttack(event);
  if (event.type === 'damage') { const target = getUnitEl(event.uid), rect = target?.getBoundingClientRect(); reconcile(event.state); pulse(target, 'fx-hit', TIMING.damage); damageFloater(target, event.amount, rect); await wait(TIMING.damage); return; }
  if (event.type === 'statChange') { reconcile(event.state); pulse(getUnitEl(event.uid), 'fx-deploy-pop', TIMING.statChange); await wait(TIMING.statChange); return; }
  if (event.type === 'death') { playSfx('death'); scheduleDeath(event.uid); await wait(TIMING.death); return; } if (event.type === 'shift') return playShift(event);
  if (event.type === 'heroHit') { reconcile(event.state); playSfx('heroDamage'); pulse(els[event.side].hero.portrait, 'fx-hit', TIMING.heroHit); pulse(els[event.side].root, 'fx-hero-hit', TIMING.heroHit); await wait(TIMING.heroHit); return; }
  if (event.type === 'shield') { const target = getUnitEl(event.uid), rect = target?.getBoundingClientRect(); reconcile(event.state); damageFloater(target, 'BLOCKED', rect); pulse(getUnitEl(event.uid), 'fx-shield', TIMING.shield); await wait(TIMING.shield); return; }
  if (event.type === 'chargerDestroyed') { pulse(els[event.side].charger, 'fx-shatter', TIMING.chargerDestroyed); await wait(TIMING.chargerDestroyed); clearCharger(event.side); reconcile(event.state); return; }
  if (event.type === 'stalemate') { pulse(els.player.hero.panel, 'fx-stalemate', TIMING.stalemate); pulse(els.enemy.hero.panel, 'fx-stalemate', TIMING.stalemate); appendLog(`Stalemate: ${event.winner} wins`); await wait(TIMING.stalemate); return; }
  if (event.type === 'cleanup') { for (const side of SIDES) els[side].root.classList.remove('is-active-turn'); await wait(TIMING.cleanup); return; } reconcile(event.state); await wait(TIMING[event.type] || TIMING.cleanup);
}
export async function playEvents(eventStream) {
  const deployUids = new Set(eventStream.filter(event => event.type === 'deploy' && event.state[event.side].board.some(unit => unit.uid === event.uid)).map(event => event.uid)); let lastAttack = null;
  for (const event of eventStream) {
    if (event.round > lastRenderedRound) { lastRenderedRound = event.round; await playTurnBanner(event.round); }
    if (event.type === 'attack') { if (lastAttack === event.uid && event.state[event.side].board.find(unit => unit.uid === event.uid)?.keywords.includes('windfury')) await wait(TIMING.windfuryGap); lastAttack = event.uid; }
    await playEvent(event, deployUids); if (!['attack', 'damage', 'shield', 'heroHit'].includes(event.type)) els.battle.querySelectorAll('.is-attacker:not(.fx-death), .is-target:not(.fx-death)').forEach(node => node.classList.remove('is-attacker', 'is-target')); if (event.phase !== 'action' || !els.battle.querySelector('.is-active-turn')) setText(els.phase, `${event.phase.toUpperCase()} · ROUND ${event.round}`); appendEventLog(event);
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
  if (event.type === 'summonPing') appendLog(`${event.unit} pings ${event.target} for ${event.amount}.`);
  if (event.type === 'statChange' && event.reason === 'onDamaged') appendLog(`${event.unit} gains +${event.amount} Attack.`);
  if (event.type === 'statChange' && event.reason === 'onKill') appendLog(`${event.unit} gains +${event.amount}/+${event.amount}.`);
  if (event.type === 'turnStart') appendLog(`— ${event.side === 'player' ? 'Your' : 'Enemy'} turn —`);
}

async function playTurnBanner(round) {
  if (!els?.banner) return; const banner = els.banner; banner.textContent = `FIGHT ${fight?.fight || 1} — ROUND ${round}`; banner.hidden = false;
  const enter = banner.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate(-50%,-58%) scale(.96)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: dur(TIMING.bannerIn), fill: 'forwards', easing: 'ease-out' });
  try { await enter.finished; } catch { /* remounted */ } await wait(TIMING.bannerHold);
  const leave = banner.animate(reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-42%) scale(.98)' }], { duration: dur(TIMING.bannerOut), fill: 'forwards', easing: 'ease-in' });
  try { await leave.finished; } catch { /* remounted */ } banner.hidden = true;
}

function button(label, handler) { const node = el('button', 'primary', label); node.addEventListener('click', event => { if (label === 'Start Run') initAudio(); playSfx('uiClick'); handler(event); }); return node; }
function updateEnemyQueuePanel() {
  if (!els?.queue) return;
  els.queue.items.forEach((item, index) => { const card = deckQueues.enemy[index]; item.hidden = !card; setText(item, card ? `${card.name} · ${card.cost} cost · ${card.atk}/${card.hp}` : ''); });
}
export function createEnemyPreview(fightNumber, queue) {
  const panel = el('aside', 'enemy-preview');
  const boss = fightBoss(fightNumber, Math.random, true), bossBlock = boss && el('div', 'enemy-preview__boss');
  if (boss) bossBlock.append(el('strong', '', `${boss.name} · ${boss.baseAtk}/${boss.baseMaxHp}`), el('p', '', boss.text));
  const list = el('ul', 'enemy-preview__units');
  queue.forEach((unit, index) => list.append(el('li', '', `${index + 1}. ${unit.name} · ${unit.cost} cost · ${unit.atk}/${unit.hp}`)));
  panel.append(el('h2', 'enemy-preview__title', `FIGHT ${fightNumber} · ENEMY DRAW ORDER`));
  if (bossBlock) panel.append(bossBlock);
  panel.append(list); return panel;
}
function showTitle() {
  stopped = true;
  const screen = el('section', 'screen title');
  const actions = el('div', 'title-actions');
  actions.append(button('Start Run', showStarterSelection));
  if (authUser?.provider === 'mock') {
    const status = el('p', 'auth-status', `Signed in as ${authUser.name || 'Mock Warrior'}`);
    if (premiumEntitled) status.append(el('span', 'premium-badge', 'PREMIUM'));
    actions.append(status);
  } else {
    const signIn = button('Sign in with Google', async () => {
      signIn.disabled = true;
      setText(signIn, 'Signing in...');
      try {
        const savedUser = JSON.parse(stored('dab_user') || 'null');
        const providerId = savedUser?.provider === 'mock' ? savedUser.providerId : undefined;
        await requestAuth('/api/auth/google', { providerId }, { 'x-guest-token': ensureGuestToken() });
        await refreshEntitlement();
        showTitle();
      } catch {
        setText(signIn, 'Sign in with Google'); signIn.disabled = false;
      }
    });
    signIn.classList.add('secondary', 'auth-button');
    signIn.style.setProperty('--auth-hover', `${dur(TIMING.hover)}ms`);
    actions.append(signIn);
  }
  screen.append(el('div', 'title-mark', 'DECK AUTO BATTLER'), el('p', '', 'Build a warband. Watch the line break. Carry every wound.'), actions);
  app.replaceChildren(screen);
}
function showStarterSelection() {
  let selectedId = STARTERS[0].id;
  const screen = el('section', 'screen starter-select'), choices = el('div', 'starter-select__choices');
  const confirm = button('March', () => startRun(selectedId));
  const starterButtons = STARTERS.map(starter => {
    const choice = el('button', 'starter-choice');
    choice.type = 'button'; choice.setAttribute('aria-pressed', String(starter.id === selectedId));
    choice.style.setProperty('--starter-hover', `${dur(TIMING.hover)}ms`);
    const cards = el('span', 'starter-choice__cards');
    cards.append(...starter.ids.map(id => draftCard(getCard(id), () => {}, { readOnly: true })));
    choice.append(el('strong', 'starter-choice__name', starter.name), el('span', 'starter-choice__blurb', starter.blurb), cards);
    choice.addEventListener('click', () => {
      playSfx('uiClick'); selectedId = starter.id;
      for (const button of starterButtons) button.setAttribute('aria-pressed', String(button === choice));
    });
    return choice;
  });
  choices.append(...starterButtons);
  screen.append(el('h1', '', 'CHOOSE YOUR BANNER'), el('p', 'starter-select__intro', 'Select the warband that will march into Fight 1.'), choices, confirm);
  app.replaceChildren(screen);
}
function startRun(starterId) { run = createRun(Math.random, starterId); stopped = false; beginFight(); }
async function beginFight() { fight = startRunFight(run); mountBattleScreen(fight); await wait(TIMING.bannerHold + TIMING.deathFallback); els?.openingPreview?.classList.add('is-dismissed'); await wait(TIMING.bannerOut); while (!fight.over && !stopped) { runRound(fight); await playEvents(fight.events); await wait(TIMING.betweenRounds); } if (stopped) return; const completedLevel = run.fight; finishRunFight(run, fight); if (run.lost) return showEnd(false); if (run.won) return showEnd(true); await wait(TIMING.deathFallback); showGap(completedLevel); }
function tooltip(card) { return descriptorText(card) || [...(card.keywords || [])].map(key => KEYWORD_NAMES[key] || key).join(' · ') || 'No deploy effect.'; }
export function draftCard(def, choose = () => {}, { readOnly = false } = {}) { const node = el(readOnly ? 'span' : 'button', 'draft-card'), visual = el('span', 'draft-visual'); visual.append(img('draft-art', unitPortrait(def), ''), img('draft-frame', frameFor(def.tier), ''), createCostDot(def.cost)); node.append(visual, el('strong', '', def.name), el('span', '', `${def.cost} turn${def.cost > 1 ? 's' : ''}`), el('b', '', `${def.atk} / ${def.hp}`), el('small', 'draft-effect', tooltip(def))); if (!readOnly) { node.append(el('span', 'draft-confirm', 'Choose card')); bindMouseHover(node, () => cardTipData(def)); node.addEventListener('click', () => { playSfx('uiClick'); choose(def); }); } return node; }
export function createDraftFlow({ deck, rng, advance, getOffers = draftOffers }) {
  let offers = getOffers(rng), redrawAvailable = true, complete = false;
  const finish = card => {
    if (complete) return false;
    if (card) deck.push(card);
    complete = true; advance(); return true;
  };
  return {
    state: () => ({ offers, redrawAvailable, complete }),
    pick: card => finish(card),
    skip: () => finish(),
    redraw: () => {
      if (complete || !redrawAvailable) return false;
      offers = getOffers(rng); redrawAvailable = false; return true;
    },
  };
}
export function createDeckEventFlow({ deck, rng, kind }) {
  let selectedIndex = null, complete = false;
  return {
    state: () => ({ selectedIndex, complete }),
    select: index => {
      if (complete || !Number.isInteger(index) || index < 0 || index >= deck.length) return false;
      selectedIndex = index; return true;
    },
    confirm: () => {
      if (complete || selectedIndex === null) return null;
      const removed = deck[selectedIndex]; let replacement = null;
      if (kind === 'transform') {
        const sameTier = CARD_POOL.filter(card => card.tier === removed.tier);
        const picked = sameTier[Math.min(sameTier.length - 1, Math.floor(rng() * sameTier.length))];
        replacement = { ...picked, keywords: [...(picked.keywords || [])] };
        deck.splice(selectedIndex, 1, replacement);
      } else deck.splice(selectedIndex, 1);
      complete = true;
      return { index: selectedIndex, removed, replacement };
    },
  };
}
function showDraft() {
  const screen = el('section', 'screen draft'), flow = createDraftFlow({ deck: run.deck, rng: run.rng, advance: beginFight });
  const charge = el('small', 'draft-charge'), offers = el('div'), actions = el('div', 'draft-actions');
  const redraw = button('Redraw', () => { if (flow.redraw()) render(); });
  const skip = button('Skip', () => flow.skip());
  offers.id = 'offers'; redraw.classList.add('secondary'); skip.classList.add('secondary');
  const render = () => {
    const state = flow.state();
    setText(charge, state.redrawAvailable ? 'REDRAW ×1' : 'REDRAW SPENT');
    redraw.disabled = !state.redrawAvailable;
    offers.replaceChildren(...state.offers.map(def => draftCard(def, chosen => flow.pick(chosen))));
  };
  actions.append(redraw, skip);
  screen.append(img('banner', 'assets/banner_draft.png', ''), el('h1', '', 'CHOOSE ONE'), el('p', '', `Pick 1 of ${RUN_CONFIG.PICKS_PER_DRAFT} · Deck ${run.deck.length} cards`), charge, createEnemyPreview(run.fight, run.enemyLine || []), offers, actions);
  render(); app.replaceChildren(screen);
}
function showDeckEvent(kind) {
  const screen = el('section', 'screen draft deck-event');
  const title = kind === 'remove' ? 'REMOVE A CARD' : 'TRANSFORM A CARD';
  const copy = kind === 'remove' ? 'Choose carefully. The selected card will be permanently removed.' : 'Choose a card to replace with a random same-tier card.';
  const count = el('p', 'deck-event__count'), choices = el('div', 'deck-event__choices');
  const flow = createDeckEventFlow({ deck: run.deck, rng: run.rng, kind });
  const confirm = button(kind === 'remove' ? 'Confirm Removal' : 'Confirm Transform', async () => {
    const result = flow.confirm();
    if (!result) return;
    confirm.disabled = true; choices.classList.add('is-resolving');
    const chosen = choices.children[result.index];
    if (chosen) { chosen.style.setProperty('--event-leave', `${dur(TIMING.shift)}ms`); chosen.classList.add('is-departing'); }
    await wait(TIMING.shift);
    render(result); choices.classList.remove('is-resolving');
    await wait(TIMING.bannerHold);
    beginFight();
  });
  confirm.disabled = true;
  const render = result => {
    setText(count, `Deck ${run.deck.length} cards`);
    choices.replaceChildren(...run.deck.map((card, index) => {
      const choice = draftCard(card, () => {
        if (!flow.select(index)) return;
        for (const node of choices.children) node.setAttribute('aria-pressed', 'false');
        choice.setAttribute('aria-pressed', 'true'); confirm.disabled = false;
      });
      choice.style.setProperty('--event-hover', `${dur(TIMING.hover)}ms`);
      choice.classList.add('deck-event__card'); choice.setAttribute('aria-pressed', 'false');
      const action = choice.querySelector('.draft-confirm');
      if (action) setText(action, kind === 'remove' ? 'Select to remove' : 'Select to transform');
      if (result?.replacement && index === result.index) {
        choice.style.setProperty('--event-arrive', `${dur(TIMING.bannerHold)}ms`);
        choice.classList.add('is-arriving'); choice.setAttribute('aria-label', `${card.name}, transformed replacement`);
        if (action) setText(action, 'New same-tier card');
      }
      return choice;
    }));
  };
  screen.append(img('banner', 'assets/banner_draft.png', ''), el('h1', '', title), el('p', 'deck-event__rule', copy), count, createEnemyPreview(run.fight, run.enemyLine || []), choices, confirm);
  render();
  app.replaceChildren(screen);
}
function showGap(completedLevel) { const kind = gapKind(completedLevel); if (kind === 'draft') showDraft(); else showDeckEvent(kind); }
function showEnd(won) {
  stopped = true; playSfx(won ? 'victory' : 'defeat');
  const snapshot = runEndSnapshot(run); globalThis.__LAST_RUN_SNAPSHOT__ = snapshot;
  localStorage.setItem('dab_last_snapshot', JSON.stringify(snapshot));
  void apiFetch('/api/decks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cardIds: snapshot.cardIds, starterId: snapshot.starterId, won: snapshot.won, levelReached: snapshot.levelReached, hpLeft: snapshot.hpLeft }),
  }).then(response => {
    if (!response.ok) throw new Error(`deck sync failed (${response.status})`);
    return response.json();
  }).then(deck => {
    store('dab_deck_id', deck.id);
    if (authUser?.provider && authUser.provider !== 'guest' && screen.isConnected) void showSavePanel(screen, deck.id);
  }).catch(() => { /* PvE remains playable offline */ });
  const screen = el('section', `screen end ${won ? 'won' : 'lost'}`);
  screen.append(img('banner', 'assets/banner_victory.png', ''), el('h1', '', won ? 'RUN VICTORY' : 'RUN DEFEAT'), el('p', '', won ? `The war-camp falls. ${run.hp} HP remains.` : 'The line broke. Build again.'));
  if (won) {
    localStorage.setItem('dab_trophy', JSON.stringify({ season: 'season-1', at: new Date().toISOString() }));
    screen.append(el('p', 'end-trophy', 'Seasonal trophy earned — banner and icon unlocked'));
  }
  screen.append(button('Restart', showStarterSelection)); app.replaceChildren(screen);
}

async function showSavePanel(screen, deckId) {
  let state;
  try {
    const response = await apiFetch('/api/slots');
    if (!response.ok) return;
    state = await response.json();
  } catch { return; }
  if (!screen.isConnected || !deckId) return;

  const panel = el('section', 'save-panel');
  panel.setAttribute('aria-label', 'Save finished deck');
  const title = el('h2', '', state.limit === 1 ? 'Save your deck' : 'Choose a save slot');
  const choices = el('div', 'save-panel__choices');
  panel.append(title, choices);

  const save = async slot => {
    try {
      const response = await apiFetch(`/api/slots/${slot}/deck`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deckId }),
      });
      if (!response.ok) throw new Error('save failed');
      panel.replaceChildren(el('p', 'save-panel__success', `Deck saved to Slot ${slot + 1}`));
    } catch { panel.replaceChildren(el('p', 'save-panel__error', 'Could not save this deck. Try again later.')); }
  };

  const confirm = (slot, label) => {
    choices.replaceChildren();
    const prompt = el('div', 'save-panel__confirm');
    prompt.append(
      el('p', '', 'Replace your saved deck with this one?'),
      button('Confirm overwrite', () => void save(slot)),
      button('Cancel', () => renderChoices()),
    );
    choices.append(prompt);
    title.textContent = label;
  };

  const renderChoices = () => {
    choices.replaceChildren();
    title.textContent = state.limit === 1 ? 'Save your deck' : 'Choose a save slot';
    state.slots.forEach((entry, slot) => {
      const occupied = Boolean(entry);
      const label = state.limit === 1 ? (occupied ? 'Overwrite saved deck' : 'Save deck') : `Slot ${slot + 1}`;
      const choice = button(label, () => occupied ? confirm(slot, label) : void save(slot));
      choice.classList.add('save-panel__slot');
      if (state.limit > 1) {
        const summary = occupied
          ? `${entry.deck.cardIds.length} cards · ${entry.deck.won ? 'Won' : 'Lost'} · Level ${entry.deck.levelReached}`
          : 'Empty';
        choice.append(el('span', 'save-panel__summary', summary));
      }
      choices.append(choice);
    });
  };
  renderChoices();
  screen.insertBefore(panel, screen.lastElementChild);
}
if (app && !globalThis.__DECK_BATTLER_NO_BOOT__) { showTitle(); void bootstrapAuth(); }
