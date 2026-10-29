# Deck Auto Battler v0 handoff

- Phase/status: vertical slice implemented; event-snapshot rendering fix verified in maintenance.
- Goal: playable three-fight auto-battler run with two draft picks between fights.
- Important files: `src/engine.js` owns pure state/rules; `src/ui.js` owns DOM/timing; `styles.css` owns layout/animation; `test/engine.test.mjs` owns regression checks.
- Art: 16 generated UI assets are integrated. The 36 pre-existing portraits were not modified.
- Latest work: round events now carry restricted post-event view snapshots and unit UIDs; the UI animates the current DOM before rendering each event snapshot, so deaths and shifts remain visible.
- Verification: `node test/engine.test.mjs` (17 passed); `node tools/event_snapshot_check.mjs` (PASS); `node tools/balance_sim.mjs 1 100` (75%); HTTP checks for `index.html` and `animations.css` (200).
- Risks: browser interaction remains smoke-tested at the HTTP/source layer rather than through a full browser/device matrix; balance and long-session pacing at 40 HP remain playtest questions.
- Next safest task: manual browser playtest focused on repeated same-name units, simultaneous deaths, and small-screen readability.

## UI fit maintenance — 2026-10-29

- Changed `styles.css`, `src/ui.js`, and `animations.css`: viewport-bounded battle rows, full-width mobile boards below compact HUDs, proportional card geometry, contained HP fills, flow-layout banners, and draft art separated from growing descriptions. Existing assets, engine rules, events, and selector hooks remain intact.
- Verification: all 17 engine tests pass; `node --check src/ui.js` and `git diff --check` pass. No browser run was allowed for this pass; layout outcomes are source-derived, not visually certified.
- Re-probe at 1258×566 and 1258×560: battle page height, both boards/header/lane, boss and animation clipping; draft page height with Gravedigger's longest description, banner/heading separation, and all offers. At 390×844 and 390×560: battle height, three visible cards at 844px height, card names/stats/badges, internal scrolling, HP/counters, title/start, and draft/end banner separation and reachable actions. Mobile draft may scroll vertically to preserve readable offers.
- Next safest task: orchestrator browser verification at those dimensions, then diff review. No commits made. `DEBUG_HANDOFF.md` was not needed: no repeated failed diagnosis cycle. Pre-existing `_styles-pretty.css` deletion and untracked files were left untouched.

## Persistent-DOM battle rewrite — 2026-10-29

- Phase/status: production UI architecture rewrite implemented; command-line gates pass; real-browser invariants harness is ready for orchestrator execution.
- Changed `src/ui.js`, `styles.css`, and `animations.css`: the battle screen now mounts once, keeps uid-keyed unit nodes, reconciles snapshot deltas, uses fixed-overlay WAAPI flight ghosts, delays death removal until animation completion, and excludes enemy identity from deck/charger DOM outside Scout's timed face node.
- Added `tools/invariants.html`, `tools/invariants_check.mjs`, and compatibility entrypoint `tools/ui_invariants_check.mjs`. The page instruments checklist items 1, 2, 3, 6, 8, and 10 with MutationObserver/prototype spies and writes PASS/FAIL evidence to console, page, and title.
- Verification: engine 17/17; event snapshot PASS; harness wiring PASS; fight-1 simulation 77% over 100 runs; `node --check src/ui.js` and `git diff --check` pass.
- Remaining evidence: run `python -m http.server 8000`, open `/tools/invariants.html` in a visible real browser, and capture its six console lines. The available UI driver could not control Chrome in this session; headless `--dump-dom` did not advance the WAAPI sequence.
