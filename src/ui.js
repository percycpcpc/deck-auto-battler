import { CARD_POOL, createRun, draftOffers, effectiveStats, finishRunFight, runRound, snapshotView, startRunFight } from './engine.js';

const app = document.querySelector('#app');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let run, fight, stopped = false;

const portrait = id => `assets/portrait_${id}.png`;
const unitPortrait = unit => {
  if (unit.token) return 'assets/portrait_brood_wisp.png';
  if (unit.cardId === 'enemy_grunt') return 'assets/portrait_sellsword.png';
  if (unit.cardId === 'enemy_brute') return 'assets/portrait_road_ogre.png';
  return portrait(unit.cardId);
};
const iconFor = key => ({ shield: 'icon_ds.png', poisonous: 'icon_poison.png', windfury: 'icon_wf.png' }[key]);
const frameFor = cost => `assets/frame_cost${Math.max(1, Math.min(3, cost || 1))}.png`;

function button(label, handler) {
  const b = document.createElement('button'); b.className = 'primary'; b.textContent = label; b.addEventListener('click', handler); return b;
}

function showTitle() {
  stopped = true;
  app.innerHTML = `<section class="screen title"><div class="title-mark">DECK <span>AUTO</span> BATTLER</div><p>Build a warband. Watch the line break. Carry every wound.</p><div id="start"></div></section>`;
  document.querySelector('#start').append(button('Start Run', startRun));
}

function startRun() { run = createRun(); stopped = false; beginFight(); }

function hero(side, view) {
  const enemyNames = ['raider', 'hivelord', 'dreadlord'];
  const id = side === 'player' ? 'player' : `enemy_${enemyNames[fight.fight - 1]}`;
  const current = view[side].hp;
  return `<div class="hero ${side}"><img src="assets/hero_${id}.png" alt="${side} hero"><div class="hp"><i style="width:${Math.max(0, current / 40 * 100)}%"></i><b>${Math.max(0, current)} / 40</b></div></div>`;
}

function cardView(unit, side, view) {
  const stats = effectiveStats(view, side, unit);
  const boss = unit.boss ? ' boss' : '';
  const art = unitPortrait(unit);
  const badges = unit.keywords.map(iconFor).filter(Boolean).map(src => `<img src="assets/${src}" alt="">`).join('');
  return `<article class="card${boss}" data-uid="${unit.uid}" data-name="${unit.name}"><img class="art" src="${art}" alt=""><img class="frame" src="${frameFor(CARD_POOL.find(c => c.id === unit.cardId)?.cost || 3)}" alt=""><span class="name">${unit.name}</span><span class="atk">${stats.atk}</span><span class="life">${stats.hp}</span><div class="badges">${badges}</div>${unit.boss ? '<em class="crown">♛</em>' : ''}</article>`;
}

function chargerView(side, view) {
  const ch = view[side].charger;
  if (!ch) return `<div class="charger empty"><img src="assets/slot_charger.png" alt="Empty charging slot"></div>`;
  const visible = side === 'player' || view[side].scouted;
  const image = visible ? portrait(ch.card.id) : 'assets/card_back.png';
  return `<div class="charger ${visible ? 'known' : 'hidden'}"><img src="${image}" alt="${visible ? ch.card.name : 'Hidden enemy card'}"><span class="cost">${ch.card.cost}</span><strong>${ch.counter}</strong></div>`;
}

function board(side, view) {
  return `<div class="side ${side}">${hero(side, view)}${chargerView(side, view)}<div class="board" aria-label="${side} board">${view[side].board.map(u => cardView(u, side, view)).join('')}</div></div>`;
}

function renderFight(view = fight) {
  app.innerHTML = `<section class="battle"><header><b>FIGHT ${fight.fight} / 3</b><span id="phase">ROUND ${view.round}</span><small>Your deck: ${run.deck.length}</small></header>${board('enemy', view)}<div class="lane"></div>${board('player', view)}<aside id="log"></aside></section>`;
}

async function beginFight() {
  fight = startRunFight(run); renderFight(); await wait(500);
  while (!fight.over && !stopped) {
    const pre = snapshotView(fight); renderFight(pre);
    runRound(fight); await playEvents(fight.events); await wait(600);
  }
  if (stopped) return;
  finishRunFight(run, fight);
  if (run.lost) return showEnd(false);
  if (run.won) return showEnd(true);
  await wait(500); showDraft(0);
}

async function playEvents(events) {
  const timing = { reveal: 300, tick: 250, deploy: 400, attack: 350, damage: 200, death: 400, shift: 300, heroHit: 250 };
  for (const event of events) {
    const log = document.querySelector('#log');
    const phase = document.querySelector('#phase'); if (phase) phase.textContent = `${event.phase.toUpperCase()} · ROUND ${event.round}`;
    if (log && ['deploy', 'death', 'heroHit', 'shield', 'stalemate'].includes(event.type)) {
      log.textContent = event.type === 'heroHit' ? `${event.side} hero takes ${event.amount}` : event.type === 'stalemate' ? `Stalemate: ${event.winner} wins` : `${event.unit || ''} ${event.type}`;
      log.className = `show ${event.type}`;
    }
    const unit = event.uid ? document.querySelector(`.card[data-uid="${CSS.escape(event.uid)}"]`) : null;
    const target = unit
      || (['reveal', 'tick'].includes(event.type) && event.side ? document.querySelector(`.side.${event.side} .charger`) : null)
      || (['shift', 'heroHit'].includes(event.type) ? document.querySelector('.battle') : null);
    target?.classList.add(`fx-${event.type}`);
    document.querySelector('.battle')?.classList.toggle('hero-hit', event.type === 'heroHit');
    await wait(timing[event.type] || 55);
    target?.classList.remove(`fx-${event.type}`);
    log?.classList.remove('show');
    renderFight(event.state);
  }
}

function draftCard(def, choose) {
  const el = document.createElement('button'); el.className = 'draft-card';
  el.innerHTML = `<img class="draft-art" src="${portrait(def.id)}" alt=""><img class="draft-frame" src="${frameFor(def.cost)}" alt=""><strong>${def.name}</strong><span>${def.cost} turn${def.cost > 1 ? 's' : ''}</span><b>${def.atk} ⚔ ${def.hp} ♥</b><small>${tooltip(def)}</small>`;
  el.addEventListener('click', () => choose(def)); return el;
}

function tooltip(c) {
  if (c.id === 'gravedigger') return 'Battlecry: summon a 1/1 for every death on either side, including tokens.';
  const tags = [...(c.keywords || []), c.battlecry && 'Battlecry', c.deathrattle && 'Deathrattle', c.aura && 'Aura'].filter(Boolean);
  return tags.join(' · ') || 'A dependable fighter.';
}

function showDraft(pick) {
  const offers = draftOffers(run.rng);
  app.innerHTML = `<section class="screen draft"><img class="banner" src="assets/banner_draft.png" alt=""><h1>CHOOSE ONE</h1><p>Pick ${pick + 1} of 2 · Deck ${run.deck.length} cards</p><div id="offers"></div></section>`;
  const holder = document.querySelector('#offers');
  offers.forEach(def => holder.append(draftCard(def, chosen => { run.deck.push(chosen); pick === 0 ? showDraft(1) : beginFight(); })));
}

function showEnd(won) {
  stopped = true;
  app.innerHTML = `<section class="screen end ${won ? 'won' : 'lost'}"><img class="banner" src="assets/banner_victory.png" alt=""><h1>${won ? 'RUN VICTORY' : 'RUN DEFEAT'}</h1><p>${won ? `The war-camp falls. ${run.hp} HP remains.` : 'The line broke. Build again.'}</p><div id="restart"></div></section>`;
  document.querySelector('#restart').append(button('Restart', startRun));
}

showTitle();
