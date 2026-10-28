
// Balance sim: winrate of a fight config. Usage: node tools/balance_sim.mjs [fight] [n]
import { createFight, runRound, starterDeck, shuffle, enemyDeckFor } from '../src/engine.js';
const fight = Number(process.argv[2] || 1), n = Number(process.argv[3] || 200);
let w = 0; const rounds = []; const margins = [];
for (let i = 0; i < n; i++) {
  const s = createFight({ fight, playerDeck: shuffle(starterDeck()) });
  let r = 0; while (!s.over && r < 200) { runRound(s); r++; }
  rounds.push(s.round); margins.push(s.player.hp - s.enemy.hp);
  if (s.winner === 'player') w++;
}
rounds.sort((a, b) => a - b); margins.sort((a, b) => a - b);
console.log(`fight=${fight} n=${n} win=${(w / n * 100).toFixed(0)}% roundsMed=${rounds[n >> 1]} marginMed=${margins[n >> 1]} marginBest=${margins[n - 1]}`);
