# Deck Auto Battler handoff

- Phase: maintenance / battlecry observability. No commit made.
- Outcome: every implemented battlecry kind emits an ordered `battlecry` event before its effects, including target/change/fizzle details. Draft choices show plain deploy text; public board inspection, the battlecry icon tooltip, and own NEXT plaque reuse the same descriptors. Combat plays a 300ms source/target pulse, caption, and War Ledger line with a reduced-motion branch.
- Owners: `src/engine.js`, `src/ui.js`, `styles.css`, `animations.css`, `test/engine.test.mjs`; title screen and gameplay effects remain unchanged.
- Verification: engine 17/17; event snapshots PASS; UI harness wiring PASS; real Chrome harness PASS at `http://localhost:8321/tools/invariants.html`; targeted battlecry precedes damage (indices 0/1); targeted, fizzle, inspect, desktop/mobile draft, and reduced motion checks PASS with no browser errors.
- Balance: the required unseeded `node tools/balance_sim.mjs 1 200` produced 66% on the final run (earlier run 69%), below the requested approximate 70–80% band. No tuning was made because this pass is observability-only.
- Evidence: `refs/ui-audit/battlecry/` and `tools/battlecry_audit.py`. The audit requires Python Playwright, installed Chrome, and `python -m http.server 8321`.
- Existing blocker: Meddler changes deck/charger without a deck-mutation snapshot contract, so the own NEXT mirror can become unknown after a bounce; battlecry narration itself is now explicit and does not reveal enemy hidden identity.
- Acceptance limits: no physical-device or screen-reader certification. The brief says 16 battlecry kinds, while the current card pool implements 15 distinct kinds; all 15 are described and emitted.
- DEBUG_HANDOFF.md not created: the implementation passed focused tests without a repeated unresolved diagnosis loop.

## Latest update — speed, round banner, hover details

- Phase: maintenance / fight presentation. No commit made.
- Outcome: persistent 1x/2x/3x/5x/10x playback control (2x preserves prior timing), sequential round banners, and one cursor-following tooltip for own/public cards and draft offers. Enemy hidden zones remain unbound, including during Scout.
- Owners changed: `src/ui.js`, `styles.css`; verification/evidence: `tools/speed_hover_audit.py`, `refs/ui-audit/speed-hover/`. Engine rules and title screen are unchanged.
- Verification: engine 17/17; event snapshots PASS; UI harness wiring PASS; real Chrome invariants PASS (0 forbidden DOM writes/src mutations, max one ghost, Scout 1508ms, deaths 421–426ms at 2x). Scripted 10-round playback at 10x measured 2605ms.
- Limits: headless Chrome at 1920x1080 and 390x844 was tested; no physical-device or screen-reader certification. The Meddler snapshot-contract blocker above remains.
