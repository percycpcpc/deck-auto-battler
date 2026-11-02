# CODEX_HANDOFF

## Project Goal

Keep enemy and player combat rows horizontally aligned for the full fight so the same slot indices always face one another.

## Current Phase

- Phase: maintenance
- Status: implemented and verified; no commit made

## Latest Completed Work

- The existing named enemy/player scroll regions now share one guarded logical `scrollLeft`.
- Native wheel/touch scrolling on either lane mirrors to the other; arrows, keyboard arrows, and deploy auto-scroll update both synchronously.
- Both arrow pairs derive disabled state from the shared position.
- Browser invariant check 11 covers slot 6+, reverse-source scrolling, first-visible index equality, and <=1px drift.
- Desktop mid-scroll, desktop right-edge, and 390x844 mobile evidence is in `refs/ui-audit/sync-scroll/`.

## Important Modified Files

- `src/ui.js`
- `docs/UI_ARCHITECTURE.md`, `docs/FIGHT_UI_DESIGN.md`
- `tools/invariants.html`, `tools/invariants_check.mjs`, `tools/sync_scroll_audit.py`
- `refs/ui-audit/sync-scroll/`

## Verification

- `node test/engine.test.mjs`: 39/39 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static wiring includes check 11)
- Installed headless Chrome real-browser invariant harness: PASS checks 1, 2, 3, 6, 8, 10, 11
- Installed headless Chrome sync audit: slot 6 aligned at 1440px; enemy wheel moved both to 1800px with 0px drift; right edge 3600px with both next arrows disabled; mobile slot 6 aligned at 744px

## Known Risks / Untested Areas

- Browser evidence uses installed headless Chrome, not a physical touch device or screen reader.
- Touch uses the same native scroll-event synchronization path verified by wheel input, but no physical swipe automation was available.

## Next Safest Task

Owner visual review of the aligned desktop/mobile screenshots.
