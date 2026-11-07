# CODEX_HANDOFF

## Goal and phase

- Goal: issue #41, replace redundant carriers with accessible archetype bridges without enlarging the pool.
- Phase: maintenance balance/content pass, pre-ship verification complete.
- Branch: `pass/41-archetype-bridges`.

## Implemented

- `shield_saint` is redesigned in place as Pit Tender, a common 1/1/4 using the existing deterministic Cultist sacrifice contract.
- Ashguard is redesigned in place as a common 1/1/5 Divine Shield formation bridge with an adjacent +1 ATK aura.
- Card ids and union-pool cardinality remain stable for saved-deck legality.
- Binding docs now record the bridge decisions and align stale Dagger Imp/Scout descriptions with landed behavior.
- Added deterministic 13-draft package-access evidence and a real-browser desktop/mobile audit.

## Verification

- Engine: 94/94 passed.
- Seasons: 8/8 passed.
- Speed gating: 3/3 passed.
- Starter parity: 4/4 passed.
- UI event: 1/1 passed.
- `event_snapshot_check.mjs`, `invariants_check.mjs`, `ui_invariants_check.mjs`: PASS.
- `archetype_bridge_check.mjs 1000 13`: every package assembled in seeded runs; token/sacrifice 99.7%, wide rally 100%, ping/pain 47.2%, mana tempo 42.9%, formation/windfury 68.3%.
- Real-browser Chrome audit: desktop/mobile screenshots, Pit Tender sacrifice contract, and invariants checks 1/2/3/6/8/10/11 PASS.
- Balance baseline and changed tree are byte-identical for Oathbound simulations: fight 1 98%, fight 2 99%, fight 3 100%. The documented 65–78% fight-1 band is pre-existingly broken and this pass introduces zero measured drift.
- `git diff --check`: PASS (line-ending warnings only).

## Risks and boundaries

- The 65–78% fight-1 band remains broken on untouched main; this pass does not worsen it.
- No new engine trigger, RNG path, server behavior, entitlement, persistence, timing, DOM lifecycle, or raster asset was introduced.
- The owner-evaluation combat experiment and its documented revert path remain intact.
- `DEBUG_HANDOFF.md` was not created because no repeated failed hypothesis or unresolved defect remains.

## Next safest task

Commit, rebase onto `origin/main`, rerun the full battery, and land only if the rebased state stays green.
