
// Balance sim: winrate of a fight config. Usage: node tools/balance_sim.mjs [fight] [n] [starterId]
import { STARTERS, createFight, getCard, makeRng, runRound, shuffle } from '../src/engine.js';
import { allStarters } from '../src/seasons.js';
const requestedFight = Number(process.argv[2] || 1), n = Number(process.argv[3] || 200);
const requestedStarterId = process.argv[4] || STARTERS[0].id;
const starter = allStarters().find(candidate => candidate.id === requestedStarterId) || STARTERS[0];
for (const fight of [requestedFight, requestedFight + 1, requestedFight + 2]) {
  let w = 0; const turns = []; const margins = [];
  for (let i = 0; i < n; i++) {
    const rng = makeRng(i + fight * 100000);
    const s = createFight({ fight, playerDeck: shuffle(starter.ids.map(getCard), rng), rng });
    let guard = 0; while (!s.over && guard++ < 400) runRound(s);
    turns.push(s.turnNumber); margins.push(s.player.hp - s.enemy.hp);
    if (s.winner === 'player') w++;
  }
  turns.sort((a, b) => a - b); margins.sort((a, b) => a - b);
  const p = q => turns[Math.min(turns.length - 1, Math.floor((turns.length - 1) * q))];
  console.log(`starter=${starter.id} fight=${fight} n=${n} win=${(w / n * 100).toFixed(0)}% turnsMin=${turns[0]} turnsP25=${p(.25)} turnsMed=${p(.5)} turnsP75=${p(.75)} turnsMax=${turns[n - 1]} marginMed=${margins[n >> 1]} marginBest=${margins[n - 1]}`);
}
