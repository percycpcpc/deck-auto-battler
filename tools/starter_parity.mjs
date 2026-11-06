// Matched-seed starter parity battery. Usage: node tools/starter_parity.mjs [n]
import { createFight, draftOffers, enemyDeckFor, getCard, makeRng, runRound } from '../src/engine.js';
import { BASE_STARTERS } from '../src/seasons.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const enemy = (id, name, cost, atk, hp) => ({ id, name, cost, atk, hp, tier: 'common' });
const repeat = (count, factory) => Array.from({ length: count }, (_, index) => factory(index));

export const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'early-wide', group: 'early', label: 'Wide line', fight: 1,
    enemyDeck: () => repeat(8, index => enemy(`parity_wide_${index}`, 'Line Recruit', 1, 2, 3)),
  }),
  Object.freeze({
    id: 'early-tall', group: 'early', label: 'Tall line', fight: 1,
    enemyDeck: () => repeat(4, index => enemy(`parity_tall_${index}`, 'Tower Guard', 2, 3, 8)),
  }),
  Object.freeze({
    id: 'early-tempo', group: 'early', label: 'Tempo curve (charging proxy)', fight: 1,
    enemyDeck: () => [
      enemy('parity_tempo_1a', 'Tempo Scout', 1, 2, 3),
      enemy('parity_tempo_2a', 'Tempo Guard', 2, 3, 6),
      enemy('parity_tempo_3a', 'Tempo Ogre', 3, 6, 9),
      enemy('parity_tempo_1b', 'Tempo Scout', 1, 2, 3),
      enemy('parity_tempo_2b', 'Tempo Guard', 2, 3, 6),
      enemy('parity_tempo_3b', 'Tempo Ogre', 3, 6, 9),
    ],
  }),
  Object.freeze({ id: 'boss-warherald', group: 'boss', label: 'Warherald (level 5)', fight: 5, enemyDeck: () => enemyDeckFor(5) }),
  Object.freeze({ id: 'boss-hivematron', group: 'boss', label: 'Hivematron (level 10)', fight: 10, enemyDeck: () => enemyDeckFor(10) }),
  Object.freeze({ id: 'boss-broodmother', group: 'boss', label: 'Broodmother (level 20)', fight: 20, enemyDeck: () => enemyDeckFor(20) }),
]);

const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

const draftPick = seed => {
  const offer = draftOffers(makeRng((seed ^ 0x9e3779b9) >>> 0));
  return [...offer].sort((a, b) => a.cost - b.cost || b.atk - a.atk || a.id.localeCompare(b.id))[0];
};

function simulate(starter, scenario, seed, withDraft) {
  const cards = starter.ids.map(getCard);
  if (withDraft) cards.push(getCard(draftPick(seed).id));
  const state = createFight({
    fight: scenario.fight,
    playerDeck: cards,
    enemyDeck: scenario.enemyDeck(),
    seed,
  });
  let guard = 0;
  while (!state.over && guard++ < 500) runRound(state);
  if (!state.over) throw new Error(`Parity simulation exceeded 500 turns: ${starter.id}/${scenario.id}/seed-${seed}`);
  return { won: state.winner === 'player', turns: state.turnNumber, hp: Math.max(0, state.player.hp) };
}

export function runStarterParity({ n = 200, seeds = null } = {}) {
  const matchedSeeds = seeds || Array.from({ length: n }, (_, index) => index + 1);
  if (!matchedSeeds.length || matchedSeeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new TypeError('Starter parity seeds must be a non-empty list of uint32 integers');
  }

  const rows = [];
  for (const scenario of SCENARIOS) {
    for (const starter of BASE_STARTERS) {
      const base = matchedSeeds.map(seed => simulate(starter, scenario, seed, false));
      const drafted = matchedSeeds.map(seed => simulate(starter, scenario, seed, true));
      const wins = base.filter(result => result.won).length;
      const draftedWins = drafted.filter(result => result.won).length;
      rows.push(Object.freeze({
        scenario: scenario.id,
        group: scenario.group,
        label: scenario.label,
        starter: starter.id,
        seeds: Object.freeze([...matchedSeeds]),
        winRate: wins / matchedSeeds.length,
        draftedWinRate: draftedWins / matchedSeeds.length,
        draftLift: (draftedWins - wins) / matchedSeeds.length,
        turnsMedian: percentile(base.map(result => result.turns), 0.5),
        turnsP90: percentile(base.map(result => result.turns), 0.9),
        hpMedian: percentile(base.map(result => result.hp), 0.5),
      }));
    }
  }
  return Object.freeze({ n: matchedSeeds.length, seeds: Object.freeze([...matchedSeeds]), rows: Object.freeze(rows) });
}

const percent = value => `${(value * 100).toFixed(1)}%`;

export function formatStarterParity(report) {
  const sequentialSeeds = report.seeds.every((seed, index) => seed === index + 1);
  const seedLabel = sequentialSeeds ? `1..${report.n}` : report.seeds.join(',');
  const lines = [
    `Matched-seed starter parity (n=${report.n} per starter/scenario; seeds=${seedLabel})`,
    'One-draft policy: lowest cost, then highest ATK, then card id from a separate seeded offer.',
    '',
    '| Scenario | Starter | Base win | +1 draft win | Draft lift | Turns median / p90 | HP median |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.label} | ${row.starter} | ${percent(row.winRate)} | ${percent(row.draftedWinRate)} | ${percent(row.draftLift)} | ${row.turnsMedian} / ${row.turnsP90} | ${row.hpMedian} |`);
  }
  return lines.join('\n');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const n = Number(process.argv[2] || 200);
  if (!Number.isInteger(n) || n <= 0) throw new TypeError('n must be a positive integer');
  console.log(formatStarterParity(runStarterParity({ n })));
}
