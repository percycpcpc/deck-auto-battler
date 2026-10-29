# Deck Auto Battler v0 handoff

- Phase/status: vertical slice implemented; event-snapshot rendering fix verified in maintenance.
- Goal: playable three-fight auto-battler run with two draft picks between fights.
- Important files: `src/engine.js` owns pure state/rules; `src/ui.js` owns DOM/timing; `styles.css` owns layout/animation; `test/engine.test.mjs` owns regression checks.
- Art: 16 generated UI assets are integrated. The 36 pre-existing portraits were not modified.
- Latest work: round events now carry restricted post-event view snapshots and unit UIDs; the UI animates the current DOM before rendering each event snapshot, so deaths and shifts remain visible.
- Verification: `node test/engine.test.mjs` (17 passed); `node tools/event_snapshot_check.mjs` (PASS); `node tools/balance_sim.mjs 1 100` (75%); HTTP checks for `index.html` and `animations.css` (200).
- Risks: browser interaction remains smoke-tested at the HTTP/source layer rather than through a full browser/device matrix; balance and long-session pacing at 40 HP remain playtest questions.
- Next safest task: manual browser playtest focused on repeated same-name units, simultaneous deaths, and small-screen readability.
