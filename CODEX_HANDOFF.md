# CODEX_HANDOFF

## Project Goal

Ship issue #39's single truthful rules contract for Bulwark, Gate Crasher, Copycat, Cataclysm, and Hexblade without disturbing the owner-evaluation alternating-turn spine.

## Current Phase

- Phase: maintenance
- Status: implemented and verified; ready for draft-PR review

## Latest Completed Work

- Bulwark now targets the leftmost highest-effective-ATK enemy on Deathrattle and reduces base ATK by 2, floored at 0.
- Gate Crasher, Copycat, Cataclysm, and Hexblade retain their bounded engine behavior with explicit player-facing text.
- `SPEC.md`, `RULINGS.md`, season card text, and UI fallback descriptions now publish the same contract.
- Added focused deterministic engine coverage for all five cards.

## Important Modified Files

- `src/engine.js`, `src/seasons.js`, `src/ui.js`
- `test/engine.test.mjs`
- `docs/SPEC.md`, `docs/RULINGS.md`

## Verification

- `node test/engine.test.mjs`: 77/77 passed
- `node test/seasons.test.mjs`: 6/6 passed
- `node test/speed_gating.test.mjs`: 3/3 passed
- `node test/ui_event.test.mjs`: 1/1 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS
- Real-browser `tools/invariants.html`: all wired checks PASS
- `node --check src/engine.js`, `node --check src/ui.js`, `git diff --check`: PASS
- `node tools/balance_sim.mjs 1 200`: 100% / 40% / 97%; identical on rerun and detached `origin/main` (`cc8c04b`), so the out-of-band fight-1 result is pre-existing

## Known Risks / Untested Areas

- #38 is already in progress and changes nearby targeting behavior; reviewers should resolve the small engine/test merge overlap explicitly.
- A separate abandoned-looking #39 worktree exists with uncommitted changes and no worker lock; this pass does not touch it.
- The legacy sequential-turn and war-ledger audit scripts contain stale layout/timing assertions; the direct real-browser invariant harness passes.

## Next Safest Task

Review the draft PR's Bulwark design decision and merge overlap with #38; do not merge automatically.
