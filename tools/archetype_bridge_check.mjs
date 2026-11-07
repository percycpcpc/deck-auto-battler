// Deterministic draft-access check for issue #41's bridge packages.
// Usage: node tools/archetype_bridge_check.mjs [runs] [drafts]
import { draftOffers, makeRng } from '../src/engine.js';
import { __setNowOverride } from '../src/seasons.js';

const runs = Number(process.argv[2] || 1000);
const drafts = Number(process.argv[3] || 13);
if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(drafts) || drafts < 1) {
  throw new TypeError('runs and drafts must be positive integers');
}

const packages = Object.freeze({
  'token/sacrifice': ['dagger_imp', 'shield_saint'],
  'wide rally': ['dagger_imp'],
  'ping/pain': ['cataclysm', 'bristleback'],
  'mana tempo': ['tax_collector', 'chrono_imp'],
  'formation/windfury': ['ashguard', 'twinfang'],
});

__setNowOverride('2026-12-01T00:00:00.000Z');
try {
  const assembled = Object.fromEntries(Object.keys(packages).map(name => [name, 0]));
  for (let seed = 1; seed <= runs; seed++) {
    const rng = makeRng(seed), seen = new Set();
    for (let draft = 0; draft < drafts; draft++) {
      // A normal draft contains two sequential pick-one-of-three offers.
      for (let pick = 0; pick < 2; pick++) for (const card of draftOffers(rng)) seen.add(card.id);
    }
    for (const [name, ids] of Object.entries(packages)) {
      if (ids.every(id => seen.has(id))) assembled[name]++;
    }
  }
  for (const [name, count] of Object.entries(assembled)) {
    if (count === 0) throw new Error(`${name} was never assemblable in ${runs} seeded runs`);
    console.log(`${name}: ${count}/${runs} (${(100 * count / runs).toFixed(1)}%)`);
  }
  console.log(`PASS all archetype packages appeared within ${drafts} drafts`);
} finally {
  __setNowOverride(null);
}
