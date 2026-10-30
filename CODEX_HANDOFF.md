# CODEX_HANDOFF

## Project Goal

Defer dead-unit removal and left compaction until the end of the full combat round while keeping death effects immediate.

## Current Phase

- Phase: maintenance
- Status: implemented and verified; no commit made

## Latest Completed Work

- Lethal units are marked `dead`, emit `death`, increment `state.deaths`, and fire Deathrattles immediately while remaining in their physical lane.
- All engine live-unit reads exclude corpses. An opposite corpse is an empty combat lane and attacks/battlecries resolve accordingly.
- Cleanup removes corpses in one batch and emits one `shift { side, removedUids }` per affected side; stalemate counts live units.
- UI death animation settles into a visible corpse. Cleanup removes corpse nodes and slides surviving nodes left once.
- Binding docs, engine tests, event snapshots, invariant harness, browser audit, and desktop/mobile evidence were updated.

## Important Modified Files

- `src/engine.js`, `src/ui.js`, `styles.css`, `animations.css`
- `test/engine.test.mjs`, `tools/event_snapshot_check.mjs`, `tools/invariants.html`, `tools/deferred_shift_audit.py`
- `docs/SPEC.md`, `docs/RULINGS.md`, `docs/UI_ARCHITECTURE.md`, `docs/FIGHT_UI_DESIGN.md`
- `refs/ui-audit/deferred-shift/`

## Verification

- `node test/engine.test.mjs`: 38/38 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring)
- Installed headless Chrome invariant harness: PASS, including cleanup-delayed removals
- Installed headless Chrome desktop/mobile audit: PASS; four screenshots captured
- Balance n=300: fight 1 99%, fight 2 4%, fight 3 18%

## Known Risks / Untested Areas

- Browser evidence uses installed headless Chrome, not a physical mobile device or screen reader.
- The cleanup contract emits one shift event per affected side; the first cleanup snapshot already contains the fully compacted state, so UI removal/animation is one visual batch.

## Next Safest Task

Owner review of corpse readability and confirmation that “turn” means the full round rather than each side sweep.
