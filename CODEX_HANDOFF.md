# CODEX_HANDOFF

## Goal and phase

- Goal: issue #48, make Sellsword a distinct aggressive common and strengthen Inquisitor's mythic battlecry.
- Phase: maintenance balance/content pass, pre-ship verification complete.
- Branch: `pass/48-inquisitor-sellsword-balance`.

## Implemented

- Sellsword is now 3/3 in card data.
- Inquisitor now carries `battlecryAmount: 5`; runtime units, damage resolution, emitted events, card text, and battle narration consume the configured amount.
- `SPEC.md` and `RULINGS.md` match the owner-locked behavior.
- Focused tests pin the card data, five-damage result/event, and rendered rules text; generic combat fixtures no longer depend on Sellsword's tuned stats.
- Added a real-browser desktop/mobile audit with draft and battle screenshots.

## Verification

- Engine: 95/95 passed.
- Seasons: 8/8 passed.
- Speed gating: 3/3 passed.
- Starter parity: 4/4 passed.
- UI event: 1/1 passed.
- `event_snapshot_check.mjs`, `invariants_check.mjs`, `ui_invariants_check.mjs`: PASS.
- Real-browser Chrome audit: Sellsword 3/3, Inquisitor five-damage rules/event/caption, desktop/mobile screenshots, and invariants checks PASS.
- Changed-tree `balance_sim 1 200`: fight 1 99%, fight 2 99%, fight 3 100%.
- `origin/main` baseline from detached `6e285df`: fight 1 98%, fight 2 99%, fight 3 100%. The documented 65–78% fight-1 band is pre-existingly broken; measured delta is +1 point, and the owner explicitly ruled the drift out of scope.
- `git diff --check`: PASS (line-ending warnings only).

## Risks and boundaries

- The fight-1 target band remains broken on main; this pass does not chase it per the pinned owner ruling.
- No targeting, event ordering, RNG, server, entitlement, persistence, timing, DOM lifecycle, pool membership, or save-identity contract changed.
- No raster asset was generated or edited.
- `DEBUG_HANDOFF.md` was not created because no repeated failed hypothesis or unresolved defect remains.

## Next safest task

Commit, rebase onto `origin/main`, rerun the full battery on the rebased commit, and land only if it remains green.
