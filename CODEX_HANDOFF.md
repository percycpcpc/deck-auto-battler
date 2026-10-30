# Deck Auto Battler handoff

## Latest update — five counter units

- Phase: maintenance / counter-package content. No commit made.
- Outcome: pool is 36 cards with Headsman, Firebelcher, Shield Saint, Bristleback, and Quillback Elder; numeric kill growth, enemy-wide deploy damage, surviving-damage growth, and cross-board entry pings use ordered engine events and the existing sequential UI player.
- Owners changed: `src/engine.js`, `src/ui.js`, `test/engine.test.mjs`, `docs/SPEC.md`, `docs/RULINGS.md`; audit automation/evidence: `tools/counters_audit.py`, `refs/ui-audit/counters/`.
- Verification: engine tests, event snapshots, UI harness, balance simulations, HTTP portrait checks, real Chrome desktop/mobile descriptors, and combat feedback were run; see the completing Codex response for exact outputs.
- Limits: no drafted full-run simulator exists; raw-starter balance is unseeded. Browser evidence is headless Chrome, not physical-device or screen-reader certification.
- `DEBUG_HANDOFF.md` remains unnecessary because no gameplay defect survived repeated diagnosis.

## Latest update — touching rows and sequential side turns

- Phase: maintenance / owner combat-order test. No commit made.
- Outcome: rounds now emit `turnStart` and resolve the complete player sweep before the complete enemy sweep; live board shifts and existing mutual `exchange()` behavior are preserved. The battle card rows share a zero-gap boundary, with enemy info above and player info below, while the log overlays that boundary. Header/log/lane accent identify the active side.
- Owners changed: `src/engine.js`, `src/ui.js`, `styles.css`, `test/engine.test.mjs`, combat/UI binding docs; audit evidence is in `refs/ui-audit/sequential-turns/` and `tools/sequential_turns_audit.py`.
- Verification: engine 20/20; event snapshots PASS; UI harness wiring PASS; real Chrome invariants PASS (0 forbidden DOM writes/src mutations, max one ghost, Scout 1513ms, deaths 418–432ms); actual card-row boundary gap 0px and log track 0px at desktop/mobile; 1258×566 scroll layout captured.
- Balance (200 simulations each): fight 1 66%, fight 2 0%, fight 3 0%. No tuning was made. Deterministic trace: `turnStart:player -> attack:player:P1 -> attack:player:P2 -> turnStart:enemy -> attack:enemy:E1 -> attack:enemy:E2`.
- Limits: headless installed Chrome was used at 1920, 1258×566, and 390×844; no physical-device or screen-reader certification. Title/draft selectors were untouched. `DEBUG_HANDOFF.md` remains unnecessary because no repeated diagnosis loop occurred.

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
