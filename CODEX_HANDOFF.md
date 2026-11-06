# CODEX_HANDOFF

## Goal and phase

- Goal: issue #31, owner-selected Squire Option A.
- Phase: maintenance balance pass, ready for review.
- Branch: `pass/31-squire-battlecry-rework`.

## Implemented

- Squire now gives +1/+1 to every other living friendly unit, including non-adjacent allies.
- Squire excludes itself and corpses; a lone Squire emits `fizzle: true`.
- The `battlecry` event records target indices/uids/names before stat mutation.
- Squire's card text, `docs/SPEC.md`, and binding `docs/RULINGS.md` match the implementation.
- Focused engine coverage verifies broad targeting, exclusions, pre-mutation snapshots, and fizzle behavior.

## Verification

- `node test/engine.test.mjs`: 72/72 passed.
- `node test/seasons.test.mjs`: 6/6 passed.
- `node test/speed_gating.test.mjs`: 3/3 passed.
- `node tools/event_snapshot_check.mjs`: PASS.
- `node tools/ui_invariants_check.mjs`: PASS.
- Real-browser `tools/deferred_shift_audit.py` against this worktree on port 8324: PASS, including `INVARIANTS: PASS`.
- `node tools/balance_sim.mjs 1 200`: Oathbound fight 1 remains 100%, outside the legacy 65–78% band.
- Baseline bisect at untouched `cc8c04b`: fight-1 win rates were Oathbound 100%, Rat Pack 93%, Iron Bastion 100%, Ember Vanguard 100%.
- Changed tree: the same 100% / 93% / 100% / 100%. Iron Bastion median margin moved 20 → 24; all other fight-1 summaries were unchanged.
- `git diff --check`: PASS (line-ending warnings only).

## Risks and boundaries

- The out-of-band win rates predate this pass and come from the owner-evaluation alternating-turn spine. This pass does not worsen any starter's fight-1 win rate, but it strengthens Iron Bastion's median margin by four HP as intended.
- No UI/DOM, raster art, server, entitlement, persistence, or timing code changed.
- The owner-evaluation combat experiment and its existing documented revert path remain intact.
- `DEBUG_HANDOFF.md` was not created because no unresolved defect or repeated failed hypothesis remains.

## Next safest task

Review the draft PR and decide whether the intended Iron Bastion margin increase is acceptable while the alternating-turn baseline remains under owner evaluation.
