# Deck Auto Battler v0 handoff

- Phase/status: vertical slice implemented; automated logic and static-server verification complete.
- Goal: playable three-fight auto-battler run with two draft picks between fights.
- Important files: `src/engine.js` owns pure state/rules; `src/ui.js` owns DOM/timing; `styles.css` owns layout/animation; `test/engine.test.mjs` owns regression checks.
- Art: 16 generated UI assets are integrated. The 36 pre-existing portraits were not modified.
- Verification: run `node test/engine.test.mjs`, then serve the repository with any static HTTP server.
- Risks: balance and long-session pacing at 40 HP remain playtest questions; browser interaction was smoke-tested at the HTTP/source layer, not across a physical-device matrix.
- Next safest task: player playtest focused on fight duration and small-screen card readability; tune only `HERO_HP` first if fights drag.
