# CODEX_HANDOFF

## Project Goal

Increase every unit's base HP by ×1.5 (half-up, minimum +1) so formations survive long enough to develop horizontally; keep ATK and hero HP unchanged.

## Current Phase

- Phase: maintenance
- Status: implemented and verified; no commit made

## Latest Completed Work

- All 36 pool cards, enemy Grunt/Brute, Hivematron/Warherald, and 1/2 and 2/3 tokens use the owner-specified toughness formula.
- ATK, costs, keywords, triggers, and 40 hero HP are unchanged.
- Token descriptors, binding docs, and all affected HP assertions were updated; a formula sanity test covers 2/4→2/6, 2/1→2/2, and boss 1/8.
- Desktop/mobile Chrome evidence records a reproducible standard fight-1 state with five live player columns at round 15.

## Important Modified Files

- `src/engine.js`, `src/ui.js`
- `test/engine.test.mjs`, `tools/preboard_audit.py`, `tools/preseed_audit.py`, `tools/toughness_audit.py`
- `docs/SPEC.md`, `docs/RULINGS.md`
- `refs/ui-audit/toughness/`

## Verification

- `node test/engine.test.mjs`: 39/39 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring)
- Installed headless Chrome invariant harness: PASS
- Installed headless Chrome toughness audit: PASS; desktop/mobile screenshots captured
- Balance n=300: fight 1 98%, roundsMed 18; fight 2 4%, roundsMed 10; fight 3 6%, roundsMed 13

## Known Risks / Untested Areas

- Browser evidence uses installed headless Chrome, not a physical mobile device or screen reader.
- Fight 2 and fight 3 remain difficult at 4% and 6% starter-deck win rates; reported raw per owner request.

## Next Safest Task

Owner review of the five-column board evidence and whether fights 2/3 need a separate difficulty pass.
