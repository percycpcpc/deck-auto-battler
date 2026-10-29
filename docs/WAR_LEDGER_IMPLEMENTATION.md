# War Ledger implementation evidence

Fight-page UI implementation completed with the data-contract blocker and verification limits below. No commit was made. Engine/rules, title/draft functions, and all 52 existing asset PNGs are unchanged. No runtime dependencies or new artwork were added. The optional browser audit uses Python Playwright with installed Google Chrome.

## Changed files
- `src/ui.js`: existing CONSTANTS/MOUNT/REGISTRY/RECONCILE/EVENT PLAYER/LOG owners retained. Persistent labels, deck plaques, log/history/detail controls, six keyword badges, accessible state, frozen mount geometry, measured flights, reduced motion, hero damage/chunk, and safe unknown-deck handling.
- `styles.css`: scoped War Ledger layout, responsive tiers, opaque information plates, stat/status/boss anatomy, scroll controls, and focus styling.
- `animations.css`: scoped timings, local feedback, reduced-motion amplitudes, and inner-visual deployment pop.
- `tools/war_ledger_audit.py`: reproducible Chrome viewport/state captures and runtime assertions. Run a static server on port 8323 first.
- `CODEX_HANDOFF.md`: current status and blocker.
- This report and `refs/ui-audit/war-ledger/`: screenshots and raw verification output.

## Numbered deviations / remaining acceptance limits
1. **Meddler data-contract blocker.** `src/engine.js` mutates `foe.deck` and clears its charger in the `meddler` battlecry without emitting a bounce/deck-change event. `snapshotView` omits decks and deck counts. Reproduction with Meddler versus Colossus/Sellsword produces `tick, tick, summon, deploy, attack, heroHit, cleanup`; the actual enemy deck top is Colossus, the last snapshot charger is null, and its snapshot has no deck field. There is no authorized non-reveal deck-top commit. The UI cannot correctly synchronize the bounced charger/deck at that moment. On a subsequent reveal that proves the mirror stale, it removes the guessed next face and shows an unknown count (`?`) instead of inventing a new top from the stale queue. Identical-card bounces cannot always be detected from the current stream. Full Meddler visual correctness remains blocked; no engine fix or synthetic event was introduced.
2. **Balance result outside approximate target on latest sample.** The requested unseeded 100-run simulation returned 70% initially and 68% on the final run (requested approximately 70-80%). Engine source is byte-for-byte unchanged; results are reported without selecting a favorable rerun.
3. **Human/device acceptance not performed.** Desktop/mobile screenshots were visually inspected, but the one-second human glance test and physical six-inch touch/readability test were not run. Token contrasts were calculated; a complete per-pixel icon/art contrast certification and screen-reader session were not performed.
4. **Matrix capture method.** All seven requested viewport sizes were exercised in real headless Google Chrome. Screenshots use full-page capture to include the approved vertical-scroll overflow. 200% was exercised with CSS page zoom, not Chrome toolbar zoom. The mobile orientation test resizes a desktop-mounted fight and verifies that its original card geometry persists. Board-density/low-health/charger states are controlled fixtures using engine constructors; Scout and mutual trade use actual engine events. The boss fixture uses the engine's fight-2 boss rather than completing a full interactive run.
5. **Draft verification boundary.** Title PNG output is pixel-identical to the original. Draft functions and all original nonbattle CSS are unchanged by exact source comparison; a separate interactive draft screenshot comparison was not performed.

## Runtime evidence
- Slot 5 deployment after nonzero horizontal scroll: scrollLeft=708; expected destination x=852; ghost end x=852; committed card x=852; registry identity retained.
- Resize 1920 to 390 keeps card width=216 and pitch=240.
- No-op reconciliation: zero DOM mutations.
- One enemy charger cost dot; independent counter; inspection first/second tap and log Escape behavior pass.
- Zero hero HP, READY, and full-board WAITING states pass.
- Normal and reduced-motion original six-check harness pass. No browser errors or death fallback warnings.
- All inspected images loaded. The 320px page has document width=320; board overflow remains native horizontal scrolling.
- A deployment-pop defect discovered during testing was fixed by scaling only the inner visual; the outer slot transform stays fixed. Dying nodes are excluded from exchange-bracket cleanup to preserve their final lifecycle without late class writes.

## Verification output

### engine-results.txt
```text
ok 1 - round ordering and cost-1 deploys on the following round
ok 2 - mutual exchange: 2/2 versus 2/2 both die
ok 3 - Windfury performs two full exchanges
ok 4 - Divine Shield negates one complete damage instance
ok 5 - Poisonous kills through HP, but not through a shielded hit
ok 6 - player Deathrattle resolves first and its summon waits until next round
ok 7 - dynamic adjacent aura recomputes after shift-left
ok 8 - Hexblade sets base stats and aura reapplies
ok 9 - Gravedigger counts token deaths on both sides
ok 10 - Tax Collector fizzles against an empty charger
ok 11 - Chrono Imp turns a 1 counter into immediate deployment
ok 12 - Meddler bounce returns to top and re-enters charger next reveal
ok 13 - deck-out does nothing and stalemate valve favors player on tie
ok 14 - fight-2 boss token appears only after attack damage and only with room
ok 15 - fight-3 entry buff applies to tokens, not the pre-boarded boss
ok 16 - round events carry post-event view snapshots for deploys and deaths
ok 17 - full three-fight run victory carries HP and grows deck 8 to 12
# 17 tests passed
```

### event-results.txt
```text
PASS: death player-dagger_imp-ykhhavz9578 absent; deploy player-dagger_imp-ykhhavz9578 present
```

### balance-results.txt
```text
fight=1 n=100 win=68% roundsMed=19 marginMed=7 marginBest=41
```

### wiring-results.txt
```text
PASS: C:\Users\Crimson\Projects\deck-auto-battler\tools\invariants.html exists and wires browser checks 1, 2, 3, 6, 8, 10 with MutationObserver instrumentation.
NOTE: open http://localhost:8000/tools/invariants.html in a real browser to execute the checklist.
```

### browser-results.txt
```text
{'errors': [], 'width': 320}
SCROLLED DEPLOY {'scroll': 708, 'expected': 852, 'start': 880, 'end': 'translate3d(-28px,128px,0) scale(3)', 'actual': 852, 'flightEnd': 852, 'identity': True}
FROZEN RESIZE PASS {'w': 216, 'pitch': 240}
SCOUT EXPIRY PASS
NO-OP RECONCILE mutations 0
INSPECTION / LOG / SINGLE COST DOT PASS
ZERO HP / READY / WAITING PASS
REDUCED MOTION
CHECK 1: PASS — card deltas [1, 1, -1, -1], only unit commits/removals
CHECK 2: PASS — 0 src attribute mutations after mount
CHECK 3: PASS — 0 innerHTML/insertAdjacentHTML calls under battle screen
CHECK 6: PASS — max ghosts 1, pointer-events none, final ghosts 0
CHECK 8: PASS — enemy identity absent after window; scout duration 1504ms
CHECK 10: PASS — death durations [429, 431]ms; survivors retained by uid registry
NORMAL MOTION
CHECK 1: PASS — card deltas [1, 1, -1, -1], only unit commits/removals
CHECK 2: PASS — 0 src attribute mutations after mount
CHECK 3: PASS — 0 innerHTML/insertAdjacentHTML calls under battle screen
CHECK 6: PASS — max ghosts 1, pointer-events none, final ghosts 0
CHECK 8: PASS — enemy identity absent after window; scout duration 1500ms
CHECK 10: PASS — death durations [430, 412]ms; survivors retained by uid registry
BROWSER ERRORS [] WARNINGS []
```

### regression-final.txt
```text
TITLE/DRAFT source and original nonbattle CSS unchanged: PASS
TITLE pixel-identical PNG: True
BASELINE CHECKS
CHECK 1: PASS — card deltas [1, 1, -1, -1], only unit commits/removals
CHECK 2: PASS — 0 src attribute mutations after mount
CHECK 3: PASS — 0 innerHTML/insertAdjacentHTML calls under battle screen
CHECK 6: PASS — max ghosts 1, pointer-events none, final ghosts 0
CHECK 8: PASS — enemy identity absent after window; scout duration 1508ms
CHECK 10: PASS — death durations [417, 424]ms; survivors retained by uid registry
CONTRAST bone/panel: 13.75:1
CONTRAST secondary/panel: 5.59:1
CONTRAST damage/background large: 6.05:1
CONTRAST bone/raised: 12.15:1
CONTRAST gold/background: 11.18:1
CONTRAST teal/background: 8.78:1
CONTRAST enemy/background: 4.31:1
```

## Screenshot paths
- `refs/ui-audit/war-ledger/pre-change.png`
- `refs/ui-audit/war-ledger/wl-1024x768-board.png`
- `refs/ui-audit/war-ledger/wl-1258x566-board.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-board.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-boss.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-chargers.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-deck-out.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-empty.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-low.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-mutual-trade.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-overflow-six.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-reduced-motion.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-scout.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-title.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-zero-ready.png`
- `refs/ui-audit/war-ledger/wl-1920x1080-zoom200.png`
- `refs/ui-audit/war-ledger/wl-320x568-board.png`
- `refs/ui-audit/war-ledger/wl-390x560-board.png`
- `refs/ui-audit/war-ledger/wl-390x844-board.png`
- `refs/ui-audit/war-ledger/wl-390x844-desktop-resize.png`
- `refs/ui-audit/war-ledger/wl-768x1024-board.png`

## UI audit boundary
Readable: desktop and 390px visual review completed; human glance timing untested.
UX: native scroll, card/deck inspection, log open/Escape, and frozen resize tested.
Accessibility: semantic labels, focus, reduced motion, and opaque text backing implemented; screen-reader/device certification remains untested.
Commercial / retention / Google Play risk: not assessed in this fight-only pass.
Priority: resolve the Meddler event contract before claiming complete fight-state visual correctness; then perform human glance/device and screen-reader checks.
