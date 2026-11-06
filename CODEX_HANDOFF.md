# CODEX_HANDOFF

## Project Goal

Deliver the owner-evaluation `alt-turns` experiment: strict player/enemy turns with persistent mana, direct affordable deployment, active-side combat/cleanup, and no charging-slot UI.

## Current Phase

- Phase: production experiment
- Status: implemented and locally verified; no commit made

## Latest Completed Work

- Replaced the five-step simultaneous round with player-first strict alternation and observable `turn`/`mana` events.
- Added persistent uncapped mana and repeated top-deck deployment into the leftmost empty slot.
- Scoped corpse cleanup to the active side and retained mutual exchanges, keyword interactions, deterministic RNG, bosses, and the two-turn stalemate window.
- Removed the charging-slot presentation, added both mana banks and active-turn indication, and retained battle-root DOM invariants.
- Deprecated Tax Collector, Chrono Imp, Meddler, and Doomcaller from active draft pools; Scout remains active.
- Updated experiment docs, event/balance tools, browser invariants, and rule-coupled tests.
- Captured 12 screenshots in `refs/ui-audit/alt-turns/` at 1440x900 and 390x844.

## Important Modified Files

- `src/engine.js`, `src/seasons.js`, `src/ui.js`, `styles.css`
- `test/engine.test.mjs`, `test/seasons.test.mjs`
- `tools/balance_sim.mjs`, `tools/event_snapshot_check.mjs`, `tools/invariants.html`
- `docs/SPEC.md`, `docs/RULINGS.md`

## Verification

- `node test/engine.test.mjs`: 67/67 passed
- `node test/seasons.test.mjs`: 6/6 passed
- `node test/speed_gating.test.mjs`: 3/3 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/balance_sim.mjs 1 200`: fights 1-3 reported win rate and turn percentiles
- `node tools/ui_invariants_check.mjs`: PASS
- Browser `tools/invariants.html` on port 8321: all CHECK lines PASS
- `node --check src/engine.js`, `node --check src/ui.js`, `git diff --check`: PASS (line-ending warnings only)
- Grep of `src/engine.js` and `src/ui.js` for old flow terminology: no matches

## Known Risks / Untested Areas

- Windows denied visible Edge focus/screenshot permissions, so the real-browser harness and screenshots were completed in headless Chrome instead of the visible Edge window.
- The owner experiment intentionally has no balance-band assertion; fight 1 measured 100% and fight 2 measured 36% under the fixed starter harness.
- Documentation uses `git revert <sha>` because this agent was explicitly prohibited from creating the orchestrator-owned commit.

## Next Safest Task

Owner review of the screenshot matrix and measured pacing, then orchestrator commit/ship or experiment revert.
