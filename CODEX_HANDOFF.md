# CODEX_HANDOFF

## Project Goal

Deliver D1 / issue #17: config-driven four-week PvE seasons that rotate starters, cumulative draft additions, and the enemy keyword while preserving legacy deck legality.

## Current Phase

- Phase: live ops production
- Status: D1 implemented and locally verified; no commit made

## Latest Completed Work

- Added `src/seasons.js` with two scheduled seasons, immutable base content, seven Season 2 cards, one Season 2 starter, cumulative pools, union legality, and a screenshot/test clock override.
- Wired engine starters, draft pool, and regular-enemy keyword to season config while preserving deterministic RNG and the all-season `CARD_POOL` contract.
- Confirmed the starter UI follows the engine's live starter binding without additional UI code.
- Added six season tests and tuned Ember Vanguard to the required fight-1 band using config stats only.

- Replaced minimal remove/transform lists with the shared draft-card presentation, banner, deck count, next-enemy preview, scrollable grid, explicit selection, and confirm-only mutation.
- Added `createDeckEventFlow` as a UI-owned, engine-preserving test seam. Remove deletes only the selected slot; transform replaces that slot with a cloned random same-tier card and preserves deck order.
- Added `dur()`-driven departure/arrival feedback and reduced-motion handling; transform exposes the replacement card briefly before the next fight.
- Added automated coverage for zero-selection refusal, confirm gating, exact removal, same-tier transform, unchanged deck size, and order preservation.
- Tuned only deterministic enemy scripts/stat bands/deck sizes and milestone boss bodies to remove the level-5 wall and produce a smooth 20-level greedy-policy survival curve.
- Final 200-seed curve: L1 72%, L5 54.5%, L8 34%, L10 20%, L14 8%, L15 5.5%, L19 2.5%, L20 2%.
- Updated locked-number engine assertions for the tuned Warherald and Broodmother data.
- Added locked `RUN_CONFIG`, deterministic 20-level enemy generation, `gapKind`, milestone boss routing, and level-20 Broodmother with the existing all-friendly aura path.
- Preserved legacy `fightBoss(2)`/`fightBoss(3)` and direct `createFight` behavior while limiting actual run bosses to levels 5/10/15/20.
- Reworked the UI loop to one draft pick per normal gap and functional remove/transform event screens built with DOM helpers.
- Added regression coverage for cadence, level-1 byte identity, level-20 boss/aura, full 20-level progression, and the new seeded full-run simulator.

## Important Modified Files

- D1: `src/seasons.js`, `src/engine.js`, `test/seasons.test.mjs`, `test/engine.test.mjs`, `tools/balance_sim.mjs`, and season docs.

- `src/engine.js`, `src/ui.js`, `styles.css`
- `test/engine.test.mjs`
- `tools/level_sim.mjs`

## Verification

- `node test/engine.test.mjs`: 58/58 passed
- `node test/seasons.test.mjs`: 6/6 passed
- `node tools/balance_sim.mjs 1 2000 oathbound_line`: 71% Season 1 win rate
- forced Season 2 `node tools/balance_sim.mjs 1 2000 ember_vanguard`: 65% win rate
- `node --test server/test/*.test.mjs`: 44/44 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring; browser checklist remains orchestrator-owned)
- `node --check` for touched JavaScript: PASS
- `git diff --check`: PASS (line-ending warnings only)

## Known Risks / Untested Areas

- D1 orchestrator screenshot remains: forced Season 2 starter-select at 1280px under `refs/ui-audit/seasons/`.
- Season scheduling is bundled config, not remote config; rollback is a config edit and deployment.

- Orchestrator still needs the requested 1280px screenshot matrix; the replacement state lasts for the `dur(500)` arrival/hold window after confirmation.
- Monte Carlo percentages are deterministic for the specified 200 seeds/policy but remain sample- and policy-dependent.
- Real-browser smoke and 1280px interaction/layout verification remain assigned to Hermes.
- Broodmother intentionally reuses the existing Warherald portrait path because the issue requests data-only boss work and no new raster asset.

## Next Safest Task

Orchestrator capture of the Season 2 starter-select using `__setNowOverride('2026-12-01T00:00:00Z')`, then review and ship the uncommitted diff.
