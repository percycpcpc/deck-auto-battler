# K3 — UI Rendering Architecture Spec: Persistent-DOM Battle Screen

**Audience:** Codex (implementer). **Status:** binding spec. Zero aesthetic/architectural latitude: where a value, name, or technique is given here, use it exactly. Palette, card frames, and motion timings come from `docs/ART_DIRECTION.md`; this spec references those tokens, never redefines them.

---

## 1. Rendering architecture (kill the blinking)

### 1.1 Stable DOM skeleton — mounted ONCE per fight, never rebuilt

`mountBattleScreen()` builds this tree exactly once at fight start. After mount, **no structural region is ever recreated** — only leaf mutations, class toggles, and unit-element create/remove occur.

```html
<div id="battle-screen">
  <div class="side side--enemy">
    <div class="hero-panel">
      <img class="hero-portrait">           <!-- src set once -->
      <div class="hero-hpbar"><div class="hero-hpbar__fill"></div></div>
      <span class="hero-hp__text"></span>
    </div>
    <div class="deck-stack">                <!-- see §3 -->
      <div class="deck-stack__layer deck-stack__layer--1"></div>
      <div class="deck-stack__layer deck-stack__layer--2"></div>
      <div class="deck-stack__layer deck-stack__layer--3"></div>
      <div class="deck-top"></div>          <!-- slot for top card visual -->
      <span class="deck-count"></span>
    </div>
    <div class="charger-slot"></div>        <!-- empty = dashed frame -->
    <div class="board-scroll">
      <div class="board-lane">
        <div class="slot-ghosts"></div>     <!-- 5 dashed placeholders -->
        <!-- persistent unit .card elements live here, absolutely positioned -->
      </div>
    </div>
  </div>

  <div class="battle-log"></div>            <!-- existing log, kept -->

  <div class="side side--player">… mirrored …</div>

  <div class="flight-layer"></div>          <!-- fixed overlay, pointer-events:none, ghosts only -->
</div>
```

- `.board-scroll` is the horizontal scroll container (`overflow-x: auto`). `.board-lane` is `position: relative`, width = `20 * slotPitch`, height = card height. Scrolling moves lane content; unit positions are **lane-relative**, so scroll never invalidates them.
- `.flight-layer` is `position: fixed; inset: 0; pointer-events: none; z-index` above both sides and the log, below nothing. Only ghost elements (§2) and floating damage numbers live here.

### 1.2 Element identity — uid-keyed persistent units

Maintain a module-level registry:

```
unitEls: Map<uid, { el, side, slotIndex, atk, hp }>
```

- A unit's `.card` element is **created exactly once**, at its DEPLOY commit, and **removed exactly once**, at the end of its death animation (400ms, on `animationend`, plus a 500ms fallback timeout).
- State updates (ATK/HP changes, buffs, counters) **never** recreate the element. They mutate the existing node's text/styles.
- Unit elements are absolutely positioned inside `.board-lane` with `left: 0; top: 0; transform: translate3d(slotIndex * slotPitch, 0, 0)`. Slot position is a function of the transform only — never of DOM order or parent changes. Shift-left is a transform write (§2c). This is what makes persistence and gliding compatible with scrolling.
- `slotPitch = slotWidth + slotGap` (take both from `docs/ART_DIRECTION.md` layout constants; define once as CSS custom properties `--slot-w`, `--slot-gap` and read them into JS constants at mount).

### 1.3 Update discipline — state → DOM diffing

A single `reconcile(snapshot, side)` function walks the snapshot and applies **only deltas**:

| Snapshot field | DOM target | Mutation |
|---|---|---|
| hero HP | `.hero-hp__text` | `textContent` if changed |
| hero HP | `.hero-hpbar__fill` | `style.width = pct%` if changed (CSS transition on width handles the tween) |
| charger counter | `.charger-slot .cost-dot__count` | `textContent` if changed |
| charger presence/identity-class | `.charger-slot` | see §3 (create/remove charger card content only on reveal/deploy, not per-tick) |
| deck-top cost (enemy) / identity (player) | `.deck-top` | rebuild **this node only** when the top card changes (reveal commit), never otherwise |
| deck count | `.deck-count` | `textContent` |
| unit ATK / HP | unit el's `.card__atk` / `.card__hp` | `textContent` if changed; HP fill width if the card frame has one |

Diff rule: store last-written values on the registry entry (or `dataset`); write only on inequality. No writes at all when nothing changed.

### 1.4 Reconciliation rule for the event stream

Per event, exactly one of three operations:

- **MUTATE-IN-PLACE:** tick, damage, heroHit, shield, attack (numbers + fx classes). Applied at the **start** of the event's animation so numbers land with the hit.
- **CREATE:** deploy (one unit element, at flight commit), reveal (charger content, at flight commit), damage floaters (transient, removed after 600ms).
- **REMOVE:** death — element gets `.fx-death`, is removed from DOM **only after the 400ms animation completes** (`animationend` handler; 500ms fallback timer in case the event is interrupted). The registry entry is deleted at the same moment. Until removal, the dying element is `pointer-events: none` and excluded from shift-left recalculation.

Deaths and shifts in the same event batch: remove dead uids from slot-index bookkeeping **immediately** (survivors glide over/through the dying card, which is fading), remove the element at animation end.

### 1.5 Board scroll + persistence

- Ghost placeholders: `.slot-ghosts` renders exactly **5 dashed slot frames** (slots 0–4, the visible window) as a non-interactive background layer. No ghosts beyond slot 4 — the extended lane is bare. (Decision made here; do not re-decide.)
- Slot geometry never changes during a fight (fixed 20-slot lane width), so `translate3d` positions are stable across scrolls. No re-measurement of units on scroll.
- Scroll is user-driven except during DEPLOY auto-scroll (§2.4). Never call `scrollTo` during reconcile.

### 1.6 Anti-blink specifics (hard rules)

1. `innerHTML` / `insertAdjacentHTML` on `#battle-screen` or any region of it is **forbidden after mount**. (The log may append child nodes via `appendChild`.)
2. Every `<img>` in the battle screen gets its `src` assigned **once** at mount or once at element creation (new unit cards). **Reassigning `src` on an existing `<img>` is forbidden.** Face/back swaps (scout reveal, deck-top flip) are done by swapping **two pre-loaded child elements' visibility classes**, both created with their `src` at parent creation — or by creating a new node (deck-top case) and letting the old one be GC'd.
3. All animation is CSS-class or WAAPI-`element.animate()` driven. No JS per-frame loops, no `setInterval` animation.
4. No forced synchronous layout between write phases: in the event player, do **one batched read phase** (all `getBoundingClientRect` calls) at animation start, then a write phase. Never read layout after writing within the same event step. Reconcile performs zero layout reads.
5. fx classes are removed via `animationend` listener or a single `setTimeout` matching the duration map — not by rebuild.

---

## 2. Travel animation (deck → charger → board)

### 2.1 Technique: absolutely-positioned ghost elements (chosen; do NOT use FLIP)

**Decision: ghost elements in `.flight-layer`, animated with the Web Animations API (`element.animate`).**

Rationale (binding): (a) REVEAL has no persistent source element to FLIP — the deck-top visual and the charger visual are different information states (enemy: back+dot → back+dot+counter; player: face → face+counter), so a single FLIPped element would either leak or lose information mid-flight. (b) Ghosts are immune to the horizontal-scroll problem: they live in a fixed overlay measured in viewport coordinates, so a mid-flight scroll can't stretch or detach them. (c) One uniform technique covers all three journeys plus future moves. (d) `pointer-events: none` on `.flight-layer` guarantees zero interactivity mid-flight without per-element bookkeeping.

Ghost lifecycle, identical for every journey:

1. **Read phase:** `startRect = sourceEl.getBoundingClientRect()`, `endRect = destEl.getBoundingClientRect()` (after any auto-scroll, §2.4). No other layout work between these reads.
2. Hide the source visual: add `.is-vacant` (opacity 0, keeps layout) to the source content node.
3. Create ghost: a `.card-ghost` node containing the card visual appropriate to the journey (see below), positioned `fixed` at `startRect`, `z-index` above all battle content, `transform-origin: top left`.
4. `ghost.animate(keyframes, { duration, easing, fill: 'forwards' })` where keyframes translate/scale from `startRect` to `endRect`:
   - `translate` from `(0,0)` to `(endRect.left − startRect.left, endRect.top − startRect.top)`
   - `scale` from `1` to `endRect.width / startRect.width` (deck/charger/board cards differ in size — the scale tween is mandatory, not decorative)
5. On `finished`: remove ghost from DOM, remove `.is-vacant` where applicable, reveal/populate the destination, resolve the event's promise.

During flight, ghost gets `.is-flying` → `z-index` top of flight-layer, `scale` multiplied by 1.05 at the 50% keyframe (subtle lift), `filter: drop-shadow` per ART_DIRECTION.

### 2.2 Journey (a) — REVEAL: deck-top → charger

- **Player:** ghost = mini face card (identity visible — the player owns this information). **Enemy:** ghost = card-back with cost dot. Identity must not exist in the enemy ghost's DOM.
- Destination: that side's `.charger-slot` rect.
- Duration: **300ms**.
- Commit: charger slot populates — player: face card + cost dot + turn counter; enemy: card-back + cost dot + turn counter. Counter starts at the snapshot value.
- Simultaneously, at commit, `.deck-top` is updated to the **next** top card (player: new face; enemy: new back + new cost dot) and `.deck-count` decrements. This is the only moment deck-top content changes.
- Cost dot / counter location by phase: **deck-top** — enemy shows cost dot (no counter); player face card shows whatever the standard card face shows (no counter). **In flight** — dot only. **On charger** — dot + counter, both sides. Counter never appears on the deck-top.

### 2.3 Journey (b) — DEPLOY: charger → board slot

- **Read phase order:** auto-scroll first (§2.4), then measure charger rect and destination slot rect (slot rect = lane rect + `slotIndex * slotPitch`, converted to viewport coords — measure a live element if the slot is rendered; for slots without a ghost frame (index ≥ 5), compute from `boardLane.getBoundingClientRect()`).
- Ghost content: the full unit card face (deploying card is now public — it hit the board; Battlecry fires). Counter is **dropped** (it reads 0); the cost dot is **dropped at commit** (board cards show ATK/HP pips, not cost). Keep the dot on the ghost during flight; the committed board element has no dot.
- Duration: **400ms**. Keyframes: 0% → start; 70% → destination **+ 10px overshoot in the direction of travel** (sign of `dx`, or downward if `dx ≈ 0`); 100% → destination. Ease-out on the settle segment.
- Commit: create the persistent unit element (registry entry, uid-keyed) at `translate3d(slotIndex * slotPitch, 0, 0)`, initially with `.fx-deploy-pop` (250ms settle scale 1.02 → 1), remove ghost, clear charger slot to its empty dashed state.
- Timing note for the acceptance checklist: the persistent `.card` element appears in the DOM **exactly once**, at commit — not at event start, not twice.
- Battlecry: fires at commit as a separate visual (§4) — never mid-flight.

### 2.4 Journey (c) — shift-left glide (no ghosts)

- For each surviving unit whose slotIndex decreased: write the new `translate3d`. CSS `transition: transform 300ms` does the glide. Stagger: `transition-delay = 40ms × (unit's order among shifting units, left to right)`. Clear the delay on transition end (or set it, then force-remove in the same write batch via rAF — implementer's choice, but no layout reads between).
- Duration **300ms** + up to 40×(n−1)ms stagger; the event player's wait accounts for total = 300 + 40×(shiftingCount − 1).

### 2.5 Auto-scroll during deploy

Before measuring rects for journey (b): compute the destination slot's lane-space rect. If its right edge > `.board-scroll` visible right edge − 8px, or left edge < visible left edge + 8px: `boardScroll.scrollTo({ left: slotCenter − scrollViewportWidth / 2, behavior: 'auto' })` (instant — a smooth scroll mid-measurement would desync the flight start). **Then** measure. Instant scrolling before measurement keeps the ghost path coherent; the board never scrolls during the flight itself.

---

## 3. Deck & charger visuals (information rules made visible)

### 3.1 Per-side layout (final, binding)

Left → right within each `.side`'s info row: **`hero-panel` → `deck-stack` → `charger-slot`**, with the `board-scroll` lane spanning the full width below the info row. Player side at bottom of screen, enemy at top, mirrored horizontally (enemy's row is `row-reverse` so both players' decks sit beside their own hero). The deck-stack takes the position the charger previously occupied adjacent to the hero; the charger slot moves one position outward, adjacent to the lane it feeds.

### 3.2 Deck stack element

- Three `.deck-stack__layer` divs, each offset by (2px, −2px) from the last, all using the card-back art via CSS `background-image` (set once in the stylesheet from the asset path — **no `<img>` in the stack**, so there is nothing to re-decode).
- `.deck-top` sits on top of the stack (offset 3×): the actual top-card visual.
- `.deck-count` badge: remaining deck size, `textContent` only.

**Top-card states:**

| Side | Pre-reveal (idle) | During REVEAL flight | Post-commit |
|---|---|---|---|
| Player | Face card at reduced size (`.deck-top .card--mini`, ~70% scale of board card): art + name + stats per the standard card frame | deck-top `.is-vacant`; ghost carries the face | next card's face (node rebuilt — the ONLY permitted deck-top rebuild) |
| Enemy | Card-back + **48px cost dot, top-left**, ring colored by cost tier (§3.3). No identity in DOM. | deck-top `.is-vacant`; ghost = back + dot | next card's back + new dot |

The enemy's identity must **never** be present in the DOM in any form (no hidden nodes, no data attributes, no alt text). The UI is the enforcement layer: hidden information is rendered absent, not rendered invisible.

### 3.3 Cost dot (placement & palette)

- 48px circle, positioned top-left of the card with the offset defined in `docs/ART_DIRECTION.md` (`.cost-dot`).
- Ring color by cost tier: classes `.cost-dot--t1 … .cost-dot--tN` mapping to the tier color tokens defined in `docs/ART_DIRECTION.md`. Use the doc's exact hex/token values and tier boundaries; do not invent colors.
- Appears on: enemy deck-top (always), both chargers (always), flight ghosts for journeys (a) and (b). Never on board units, never on the player's deck-top beyond what the standard face frame already shows.
- On chargers, the turn counter is a **separate** element (`.cost-dot__count`, bottom-right per ART_DIRECTION) — not overlaid on the dot.

### 3.4 Charger slot

- Empty: dashed slot frame (`.charger-slot.is-empty` — dashed border, empty interior; styles from ART_DIRECTION's slot-placeholder treatment).
- Occupied — player: face card + cost dot + counter. Occupied — enemy: card-back + cost dot + counter; **identity absent from DOM**.
- **Scout reveal:** on scout Battlecry, the enemy charger temporarily shows identity. Implement as: create a face card node, add `.is-scout-revealed` for **1500ms** (with a 250ms flip-in class), then remove the face node from the DOM entirely. The identity exists in the DOM only inside that window.
- Content changes (reveal commit / deploy commit / scout window) are the **only** times charger child nodes are created/removed. Tick mutates the counter's `textContent` only.

### 3.5 Empty states

- **Deck empty (deck-out):** `.deck-stack.is-empty` — the three stack layers collapse to a single layer at 40% opacity + grayscale filter; `.deck-top` node removed; `.deck-count` shows `0`. Transition to this state via class toggle at the commit where the last card leaves.
- **Charger empty:** dashed frame, §3.4.
- **Board < 5 units:** the 5 dashed `.slot-ghosts` frames remain visible (decision from §1.5 — ghost placeholders, not bare lane). Slots ≥ 5 are never ghosted.

---

## 4. Event → visual mapping table

Timings are binding and unchanged from current values. "Op" = MUTATE (in place) / MOVE (ghost or transform) / CREATE / REMOVE.

| Event | Op | Visual response | Duration |
|---|---|---|---|
| `reveal` | MOVE + CREATE | Ghost deck-top → charger (§2.2). Commit: charger content created; deck-top advances; deck-count −1. | 300ms |
| `tick` | MUTATE | Charger counter `textContent` −1 (both sides, from snapshot); `.fx-tick` pulse class on the counter, removed after. No other DOM change. | 250ms |
| `deploy` | MOVE + CREATE | Ghost charger → slot with 10px overshoot (§2.3). Auto-scroll if needed (§2.5). Commit: persistent unit element created (exactly one), charger → empty dashed. | 400ms |
| `battlecry` (if separate event) | MUTATE + transient | `.fx-cast` glow on the deployed unit. **Scout:** enemy charger face reveal per §3.4 (face node in DOM for 1500ms only). Other battlecries: effect-specific class on affected targets, log line. | 300ms (scout window 1500ms) |
| `attack` | MUTATE | `.fx-lunge` on attacker: translate toward target (direction computed from rects once, applied as CSS var `--lunge-x/--lunge-y`) and back. No numeric changes here. | 350ms |
| `damage` | MUTATE + CREATE | Target HP text/fill update at animation start; `.fx-hit` shake on target; floating damage number created in `.flight-layer` at target rect, rises/fades, removed after 600ms. | 200ms |
| `death` | REMOVE (deferred) | `.fx-death` fade/collapse; element removed from DOM + registry at `animationend` (500ms fallback). Slot bookkeeping freed immediately for shifts. | 400ms |
| `shift` | MUTATE (transform) | Survivors glide via `translate3d`, staggered 40ms (§2.4). | 300ms + stagger |
| `heroHit` | MUTATE | Hero HP text + bar width; `.fx-hit` on hero portrait; screen-edge flash on the victim's side (class on `.side`, ART_DIRECTION's damage-flash token). | 200ms |
| `shield` | MUTATE | `.fx-shield` ring pulse on the protected unit/hero; if the snapshot carries a shield value, update its badge textContent. | 250ms |
| `stalemate` | MUTATE | `.fx-stalemate` flash on both hero panels simultaneously + log line. No element changes. | 400ms |

Event player: sequential `async` — each event applies its visuals, awaits its duration (shift awaits duration + max stagger), then the next event begins. No overlap between events except damage floaters and death fades, which always finish in the background.

---

## 5. Implementation notes for Codex

### 5.1 File structure — restructured `src/ui.js`

Organize into five labeled sections, top to bottom:

1. **CONSTANTS** — keep the existing timing map (extend it with the stagger 40ms, scout window 1500ms, floater 600ms); keep asset path helpers untouched; add slot-geometry constants read from CSS custom properties at mount.
2. **MOUNT** — `mountBattleScreen(initialState)`: builds §1.1 skeleton once, assigns all `<img>` `src`s (heroes, card-backs, art preloads), renders initial deck-tops, returns/holds element references in a module-level `els` object.
3. **REGISTRY** — `unitEls` Map + helpers: `createUnitEl(uid, card, side, slotIndex)`, `removeUnitEl(uid)`, `getUnitEl(uid)`.
4. **RECONCILE** — `reconcile(snapshot)`: the diff writer of §1.3/§3. Pure targeted mutations; no layout reads; no creates except deck-top node swap.
5. **EVENT PLAYER** — `playEvents(eventStream)`: async loop over events; per-event: batched rect reads → ghost/transform writes → await duration → commit (creates/removes/reconcile) → next. Includes the ghost helper `flyCard(startEl, destRect, content, duration, keyframeOpts)` used by both journeys.
6. **LOG** — keep the existing log renderer; it may keep append-only `appendChild` behavior.

**Keep:** asset path helpers, the timing map, the log, the CSS from ART_DIRECTION. **Delete:** the battle-screen template-string builder, `app.innerHTML = …` and every code path that re-renders the full battle screen.

### 5.2 Forbidden (hard constraints)

1. `innerHTML`/`outerHTML`/`insertAdjacentHTML` anywhere under `#battle-screen` after mount.
2. Reassigning `src` on any existing `<img>` in the battle screen.
3. Per-event full re-renders, full-node replacement of any §1.1 region, or recreating a unit element that already exists in the registry.
4. Enemy card identity anywhere in the DOM outside the scout-reveal window (no hidden nodes, no data attributes).
5. Per-frame JS animation loops; layout reads interleaved with writes inside an event step.
6. Smooth-scroll during a flight; any scroll except user input and the §2.5 pre-measure instant scroll.

### 5.3 Acceptance checklist (self-verify, headless-able)

1. Mount a scripted fight of ≥ 3 full rounds including ≥ 1 deploy, ≥ 1 death, ≥ 1 shift. During the entire run, `document.querySelectorAll('#battle-screen .card').length` changes **only** in steps of +1 at deploy commits and −1 at death-animation completions — never any other delta.
2. After mount, instrument `HTMLImageElement` via a MutationObserver on attributes: zero `src` mutations under `#battle-screen` for the whole fight.
3. Instrument `innerHTML`/`insertAdjacentHTML` (setter override / prototype spy): zero calls touching nodes under `#battle-screen` after mount.
4. A single `deploy` event adds exactly one `.card` element to `.board-lane`, and that element's uid is registered; the element is the same node (`===`) before and after any subsequent `damage`/`tick`/`shift` events.
5. A `tick` event mutates at most one text node per charger (the counter) and adds/removes no elements other than the transient `.fx-tick` class.
6. During REVEAL and DEPLOY, exactly one `.card-ghost` exists in `.flight-layer`; it is removed at commit; `pointer-events` computed style of `.flight-layer` is `none`.
7. Deploy to a slot scrolled out of view: `.board-scroll.scrollLeft` changes **before** the ghost's first animation frame and not during it.
8. Enemy charger and enemy deck-top: `querySelector` finds no node containing the card's name/art for the entire fight, except during a scout window, where the face node exists for 1500ms ± 100ms and is then absent again.
9. Enemy deck-top shows a `.cost-dot` with the correct tier class; player deck-top shows a face card; both update only at reveal commits.
10. Death: the dying element remains in the DOM for ≥ 400ms after the death event and is absent after 500ms; a shift in the same round does not recreate any survivor element.
11. Board with 2 units renders exactly 5 `.slot-ghost` frames; deck-out renders `.deck-stack.is-empty` with no `.deck-top` child.
12. Full scripted fight completes with zero uncaught errors and zero `animationend` fallback timeouts firing (log a warning if the 500ms death fallback ever triggers).

---

**End of spec.** Any ambiguity discovered during implementation: prefer the interpretation that (a) touches less DOM, and (b) exposes less hidden information — in that order — and flag the ambiguity in the PR description rather than deciding silently.