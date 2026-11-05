// Seeded full-run Monte Carlo. Usage: node tools/level_sim.mjs [n]
import { CARD_POOL, RUN_CONFIG, createRun, draftOffers, finishRunFight, gapKind, makeRng, runRound, startRunFight } from '../src/engine.js';

const n = Number(process.argv[2] || 200);
const survived = Array(RUN_CONFIG.LEVELS).fill(0);
const deckSizes = Array.from({ length: RUN_CONFIG.LEVELS }, () => []);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : '-';
};
const lowestCostIndex = deck => deck.reduce((best, card, index) => card.cost < deck[best].cost ? index : best, 0);

for (let seed = 1; seed <= n; seed++) {
  const run = createRun(makeRng(seed));
  while (!run.won && !run.lost) {
    const level = run.fight;
    const fight = startRunFight(run);
    let rounds = 0;
    while (!fight.over && rounds++ < 500) runRound(fight);
    finishRunFight(run, fight);
    if (run.lost) break;
    survived[level - 1]++;
    if (!run.won) {
      const kind = gapKind(level);
      if (kind === 'draft') run.deck.push(draftOffers(run.rng)[0]);
      else {
        const [removed] = run.deck.splice(lowestCostIndex(run.deck), 1);
        if (kind === 'transform') {
          const sameTier = CARD_POOL.filter(card => card.tier === removed.tier);
          const replacement = sameTier[Math.min(sameTier.length - 1, Math.floor(run.rng() * sameTier.length))];
          run.deck.push({ ...replacement, keywords: [...(replacement.keywords || [])] });
        }
      }
    }
    deckSizes[level - 1].push(run.deck.length);
  }
}

console.log(`Seeded full-run Monte Carlo (n=${n}; draft=offer #1; events=lowest cost)`);
console.log('Level | Survival | Median deck size at gap');
console.log('----- | -------- | -----------------------');
for (let level = 1; level <= RUN_CONFIG.LEVELS; level++) {
  console.log(`${String(level).padStart(5)} | ${(survived[level - 1] / n * 100).toFixed(1).padStart(7)}% | ${String(median(deckSizes[level - 1])).padStart(23)}`);
}
