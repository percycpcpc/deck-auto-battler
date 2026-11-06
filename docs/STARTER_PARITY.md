# Starter parity baseline

Issue #42 establishes a repeatable matched-seed baseline before any starter list changes. It does not rebalance cards or starters.

## Method

Run:

```text
node tools/starter_parity.mjs 200
```

Each starter receives seeds 1–200 in every fixture. `createFight({ seed })` owns shuffle and uid randomness, so no randomness exists outside the injected seeded stream. The same enemy deck is used for all starters within a fixture.

The current owner-evaluation combat spine removed charging slots. The requested charging matchup is therefore represented by an ordered 1/2/3-cost tempo curve; it measures response to delayed expensive threats without reviving deprecated charge rules.

Fixtures:

- Wide: eight 1-cost 2/3 units.
- Tall: four 2-cost 3/8 units.
- Tempo curve: repeated 1-cost 2/3, 2-cost 3/6, 3-cost 6/9 sequence.
- Bosses: the live level 5 Warherald, level 10 Hivematron, and level 20 Broodmother scripts.

Draft dependence compares the unchanged eight-card starter with that starter plus one deterministic pick from a separate seeded offer. The pick policy is lowest cost, then highest ATK, then card id. A negative lift is valid: adding a card can perturb draw order and make a deck worse.

## Baseline (2026-11-06, main at claim)

| Scenario | Starter | Base win | +1 draft win | Draft lift | Turns median / p90 | HP median |
|---|---|---:|---:|---:|---:|---:|
| Wide line | oathbound_line | 99.5% | 99.0% | -0.5% | 20 / 20 | 40 |
| Wide line | rat_pack | 85.0% | 93.5% | 8.5% | 22 / 22 | 36 |
| Wide line | iron_bastion | 100.0% | 99.5% | -0.5% | 24 / 24 | 40 |
| Tall line | oathbound_line | 41.0% | 44.0% | 3.0% | 20 / 22 | 31 |
| Tall line | rat_pack | 29.5% | 44.5% | 15.0% | 22 / 24 | 25 |
| Tall line | iron_bastion | 59.0% | 70.0% | 11.0% | 24 / 26 | 34 |
| Tempo curve (charging proxy) | oathbound_line | 38.5% | 50.5% | 12.0% | 26 / 26 | 20 |
| Tempo curve (charging proxy) | rat_pack | 32.5% | 41.0% | 8.5% | 26 / 26 | 15 |
| Tempo curve (charging proxy) | iron_bastion | 71.0% | 79.5% | 8.5% | 28 / 30 | 31 |
| Warherald (level 5) | oathbound_line | 23.0% | 54.0% | 31.0% | 20 / 20 | 32 |
| Warherald (level 5) | rat_pack | 28.0% | 44.0% | 16.0% | 22 / 22 | 24 |
| Warherald (level 5) | iron_bastion | 38.0% | 64.0% | 26.0% | 24 / 24 | 26 |
| Hivematron (level 10) | oathbound_line | 10.0% | 30.0% | 20.0% | 24 / 24 | 20 |
| Hivematron (level 10) | rat_pack | 19.0% | 25.5% | 6.5% | 24 / 24 | 25 |
| Hivematron (level 10) | iron_bastion | 28.5% | 36.0% | 7.5% | 26 / 28 | 29 |
| Broodmother (level 20) | oathbound_line | 0.0% | 0.0% | 0.0% | 26 / 28 | 0 |
| Broodmother (level 20) | rat_pack | 0.0% | 0.0% | 0.0% | 26 / 26 | 0 |
| Broodmother (level 20) | iron_bastion | 0.0% | 0.0% | 0.0% | 28 / 28 | 0 |

## Findings

- Rat Pack is not the fast starter in observed fight duration. Its median is two turns slower than Oathbound in wide/tall fixtures and ties Oathbound on the tempo curve.
- Iron Bastion is the most resilient starter in every tall, tempo, and boss baseline, often by a large margin. That supports its endurance identity but confirms starter parity is not close.
- Rat Pack is most draft-dependent in the tall fixture (+15 points), while Oathbound and Iron Bastion receive the largest single-pick lift against Warherald (+31 and +26).
- Unmodified starters can beat Warherald without any added mythic (23–38%), so no specific mythic is a prerequisite for that milestone. The raw starters are not expected to clear the level-20 boss: a real run reaches it after many drafts/events, and this fixture intentionally isolates starter strength.
- Do not change starter lists from these results alone. Use this battery to evaluate a separately ratified candidate change, and compare matched-seed deltas rather than chasing one global 65–78% band across deliberately different fixtures.

## Existing standard-band drift

The repository-standard `node tools/balance_sim.mjs 1 200` check reports a 100% fight-1 win rate on current `origin/main`, reproduced twice. This pass has no diff in `src/engine.js`, `src/seasons.js`, or `tools/balance_sim.mjs`. A detached worktree at SHA `11542d9` reports 70% for the same fight/sample size, inside the historical 65–78% band. The out-of-band current result therefore predates this evidence-only pass and remains an owner-evaluation tuning concern rather than a regression introduced here.
