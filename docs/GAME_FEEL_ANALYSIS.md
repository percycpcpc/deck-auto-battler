# Game-Feel Analysis — Poke Derby vs Deck Auto Battler

Date: 2026-11-03. Reference: https://pokederby.com/play/ (played/inspected by
Hermes; remote browser died twice on the 181 MB WASM load, so in-game motion
numbers come from the title screen + official marketing screenshots).

## What Poke Derby actually is

Not a DOM webgame — a **Godot 4 + .NET engine export to WASM** (181 MB
download, 220 MB desktop), by a team standing on huge borrowed asset
libraries: PMDCollab animated sprite sheets, PokeRogue battle effects,
PMD:Origins music/SFX, Suno original tracks. The "webgame feel" is a real
game engine running in the browser.

## Measured gap (screenshot pixel analysis, both games)

| Metric | Poke Derby screens | Deck Auto Battler |
|---|---|---|
| Unique colors (quantized) | 1,061–2,410 | 587–875 |
| Mean saturation | 56–107 | 17–18 |
| Edge/detail density | 5.2–18 | 3.7–6.6 |
| Battle motion | not captured (session died) | ~8% of px / 1.2 s |
| Audio | full soundtrack + per-event SFX | **none** |

## Why it feels more like a game

1. **Audio is half of game feel and we have none.** Every Derby event has a
   sound; silence reads as "webpage".
2. **Camera.** Derby runs a TV-style camera that follows the race and cuts
   away for big skills. DOM has no camera — our board is a static wide shot,
   so nothing ever feels important.
3. **Perpetual motion.** Their sprites idle-animate, weather runs, particles
   drift — alive even when nothing happens. Our units sit frozen between
   actions.
4. **Impact grammar.** Game feel = anticipation → impact → follow-through
   (hit-stop, shake, flash, overshoot). CSS ease transitions have none of it.
5. **Engine ceiling.** CSS tweens transform/opacity/color only; particles,
   shaders, skeletal sprites need canvas — but most juice can be faked in DOM.

The muted palette is **not** the problem — `ART_DIRECTION.md`'s grim
war-room look is right for the theme. The gap is juice, not colors.

## Transferable improvements, ranked by impact ÷ cost

1. **SFX pass (WebAudio, synthesized — no asset files)** — deploy click,
   card reveal, charge tick, deploy thud, attack impact, death, hero damage,
   victory sting. Biggest feel-per-effort win.
2. **Screen shake + hit-stop** on attacks and deaths — one CSS class on the
   battle root, ~120 ms, routed through the `dur()` speed helper.
3. **Idle life** — every unit gets a subtle bob/breathe + glow pulse;
   drifting ember particles behind the board.
4. **Impact frames** — white flash on hit, damage floaters, attacker
   scale-pop, dissolve-with-particles on death.
5. **Camera fakes** — battle-root zoom pulse on big events; brief ~300 ms
   cutaway overlay on boss abilities / lethal.
6. **One looping dark-ambient music track** (Suno — Derby's own approach).

## Decision

Items **1–3 ship as one "game feel" pass** (owner-approved 2026-11-03);
items 4–6 are evaluated separately after. Scope guard: presentation-only,
engine frozen, all new timing through `dur()`.
