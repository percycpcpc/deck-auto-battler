# CODEX_HANDOFF

## Project Goal

Deliver issue #2: a deterministic 20-level PvE run with one-pick drafts, alternating remove/transform events every third gap, milestone bosses, full-HP level starts, and a seeded full-run balance simulator.

## Current Phase

- Phase: maintenance / balance tuning
- Status: A2-tuning implemented and verified; no commit made

## Latest Completed Work

- Tuned only deterministic enemy scripts/stat bands/deck sizes and milestone boss bodies to remove the level-5 wall and produce a smooth 20-level greedy-policy survival curve.
- Final 200-seed curve: L1 72%, L5 54.5%, L8 34%, L10 20%, L14 8%, L15 5.5%, L19 2.5%, L20 2%.
- Updated locked-number engine assertions for the tuned Warherald and Broodmother data.
- Added locked `RUN_CONFIG`, deterministic 20-level enemy generation, `gapKind`, milestone boss routing, and level-20 Broodmother with the existing all-friendly aura path.
- Preserved legacy `fightBoss(2)`/`fightBoss(3)` and direct `createFight` behavior while limiting actual run bosses to levels 5/10/15/20.
- Reworked the UI loop to one draft pick per normal gap and functional remove/transform event screens built with DOM helpers.
- Added regression coverage for cadence, level-1 byte identity, level-20 boss/aura, full 20-level progression, and the new seeded full-run simulator.

## Important Modified Files

- `src/engine.js`, `src/ui.js`, `styles.css`
- `test/engine.test.mjs`
- `tools/level_sim.mjs`

## Verification

- `node test/engine.test.mjs`: 46/46 passed
- `node tools/balance_sim.mjs 1 200`: 72% win on the reported verification run (required 65-78%; tool is unseeded)
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/level_sim.mjs 200`: 5/200 reached level 20 and 4/200 won it under the normal seeded greedy policy
- `node --check src/ui.js`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring; browser checklist not executed per owner scope)
- `git diff --check`: PASS (line-ending warnings only)

## Known Risks / Untested Areas

- Monte Carlo percentages are deterministic for the specified 200 seeds/policy but remain sample- and policy-dependent.
- Real-browser smoke and 1280px interaction/layout verification remain assigned to Hermes.
- Broodmother intentionally reuses the existing Warherald portrait path because the issue requests data-only boss work and no new raster asset.

## Next Safest Task

Orchestrator review and ship of the verified A2-tuning diff; no further softening is recommended against the current acceptance targets.
