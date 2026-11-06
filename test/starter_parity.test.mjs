import assert from 'node:assert/strict';
import { BASE_STARTERS } from '../src/seasons.js';
import { SCENARIOS, formatStarterParity, runStarterParity } from '../tools/starter_parity.mjs';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}

await test('covers every base starter and parity scenario with identical seeds', () => {
  const report = runStarterParity({ seeds: [11, 22, 33] });
  assert.equal(report.rows.length, BASE_STARTERS.length * SCENARIOS.length);
  assert.deepEqual(new Set(report.rows.map(row => row.starter)), new Set(BASE_STARTERS.map(starter => starter.id)));
  assert.deepEqual(new Set(report.rows.map(row => row.scenario)), new Set(SCENARIOS.map(scenario => scenario.id)));
  for (const scenario of SCENARIOS) {
    const rows = report.rows.filter(row => row.scenario === scenario.id);
    assert.ok(rows.every(row => JSON.stringify(row.seeds) === JSON.stringify([11, 22, 33])));
  }
});

await test('is byte-identical for repeated matched-seed runs', () => {
  const first = formatStarterParity(runStarterParity({ seeds: [3, 5, 8, 13] }));
  const second = formatStarterParity(runStarterParity({ seeds: [3, 5, 8, 13] }));
  assert.equal(second, first);
});

await test('reports early, boss, duration, health, and draft-dependence evidence', () => {
  const report = runStarterParity({ seeds: [1, 2] });
  assert.deepEqual(new Set(SCENARIOS.map(scenario => scenario.group)), new Set(['early', 'boss']));
  for (const row of report.rows) {
    assert.ok(row.winRate >= 0 && row.winRate <= 1);
    assert.ok(row.draftedWinRate >= 0 && row.draftedWinRate <= 1);
    assert.equal(row.draftLift, row.draftedWinRate - row.winRate);
    assert.ok(Number.isInteger(row.turnsMedian) && Number.isInteger(row.turnsP90));
    assert.ok(Number.isFinite(row.hpMedian));
  }
});

await test('rejects invalid seed sets', () => {
  assert.throws(() => runStarterParity({ seeds: [] }), /non-empty list/);
  assert.throws(() => runStarterParity({ seeds: [-1] }), /uint32/);
  assert.throws(() => runStarterParity({ seeds: [1.5] }), /uint32/);
});

console.log(`# ${passed} starter parity tests passed`);
