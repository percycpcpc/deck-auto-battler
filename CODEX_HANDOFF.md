# CODEX_HANDOFF

## Project Goal

Ship issue #33: progress-aware stalemate detection with side-symmetric draws across local fights, replays, friendlies, and ranked scoring.

## Current Phase

- Phase: maintenance
- Status: implemented; shipping blocked by the required 65–78% fight-1 balance gate

## Latest Completed Work

- Replaced live-unit-count stalemate detection with a deterministic full-round combat fingerprint covering hero HP and live-unit identity/stats/damage/shields.
- Added a 400-turn safety valve and explicit `noProgress` / `turnLimit` event reasons.
- Equal-HP valves now resolve as `draw`; ranked ELO scores draws 0.5/0.5.
- Added draw-safe battle-log, replay, friendly, and ranked result copy.
- Updated `SPEC.md`, binding `RULINGS.md`, and stale implementation-ledger wording.
- Captured desktop/mobile draw-state evidence in `refs/ui-audit/stalemate-draw/`.

## Important Modified Files

- `src/engine.js`, `src/ui.js`
- `server/src/ranked.js`
- `test/engine.test.mjs`, `server/test/ranked.test.mjs`, `server/test/sim.test.mjs`
- `docs/SPEC.md`, `docs/RULINGS.md`, `docs/WAR_LEDGER_IMPLEMENTATION.md`

## Verification

- `node test/engine.test.mjs`: 75/75 passed
- Full server suite: 48/48 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS
- Real-browser invariants: checks 1, 2, 3, 6, 8, 10, 11 PASS
- Draw smoke: `winner=draw`, `reason=noProgress`, battle log contains `Stalemate: draw`
- Static syntax checks and `git diff --check`: PASS
- `node tools/balance_sim.mjs 1 200`: fight 1 92%, fight 2 77%, fight 3 100%; historical 65–78% band remains broken by the owner-evaluation alternating-turn spine, bisected to `3cf09cc` + `7a51c50`. This ticket improves fight 1 from current-main baseline 100% to 92% by allowing progressing combat to continue.

## Known Risks / Untested Areas

- Balance is not in the historical fight-1 band; this is a pre-existing experiment-level blocker, not introduced by #33.
- Draw result labels were browser-smoked in battle playback; ranked/friendly draw panels are covered by shared result-contract logic but not forced through live D1 matchmaking in-browser.

## Next Safest Task

Ratify a new alternating-turn balance band or land a dedicated encounter/combat rebalance, then rerun the battery and ship #33 from `pass/33-stalemate-detection`.
