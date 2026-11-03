# CODEX_HANDOFF

## Project Goal

Start every fight at full hero HP and run the boss encounters in the order Warherald (fight 2), then Hivematron (fight 3).

## Current Phase

- Phase: maintenance
- Status: implemented and verified; no commit made

## Latest Completed Work

- `startRunFight` now leaves `createFight` at its default 40 hero HP instead of passing carried `run.hp`.
- `finishRunFight` still records the ending HP for final-victory presentation.
- Fight 2 now uses Warherald, its entry buff, its former fight-3 script, and the dreadlord hero portrait.
- Fight 3 now uses Hivematron, its identity-keyed token summon, its former fight-2 script, and the hivelord hero portrait.
- Tests and gameplay documentation now describe the new HP and encounter rules.

## Important Modified Files

- `src/engine.js`, `src/ui.js`
- `test/engine.test.mjs`
- `docs/SPEC.md`, `docs/RULINGS.md`, `docs/ART_DIRECTION.md`, `docs/WAR_LEDGER_IMPLEMENTATION.md`

## Verification

- `node test/engine.test.mjs`: 41/41 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring)
- `node tools/balance_sim.mjs 1 200`: 68% win, median 19 rounds, median margin 8
- `node tools/balance_sim.mjs 2 200`: 59% win, median 18 rounds, median margin 5
- `node tools/balance_sim.mjs 3 200`: 46% win, median 16 rounds, median margin -7

## Known Risks / Untested Areas

- Balance results use 200 simulations per fight and therefore have sampling variance.
- UI verification is the repository's static invariant check; no new layout or interaction behavior was introduced.

## Next Safest Task

Owner playtest of the reordered Warherald/Hivematron difficulty curve.
