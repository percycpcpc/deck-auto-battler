# Deck Auto Battler — v0 SPEC (owner-approved)

Web prototype. Auto-battler deckbuilder: 3 scripted fights, draft between fights, HP persists across the run.

## Core loop
Fixed 8-card starter deck → auto-combat vs scripted enemy → draft pick 1-of-3 (twice) → fight 2 → draft (twice) → fight 3 → run ends (victory screen).
- Lose = hero HP reaches 0 at any point → run over, restart.
- HP persists across all 3 fights (Slay-the-Spire model: HP is carried debt).
- No map, no economy, no meta in v0.

## Combat rules
- **Battlefield**: up to 20 slots per side (viewport shows 5, scrolls horizontally). Columns are aligned: each unit faces the unit directly opposite.
- **Reveal phase**: both sides simultaneously reveal the top card of their deck into a charging slot. The card enters play when its cost (in turns) ticks down: cost 1 = next round, cost 2 = two rounds, cost 3 = three rounds. On entering, it lands in the **leftmost empty slot**.
- **Information**: the owner sees their own top card's identity. The opponent sees only a cost dot + turn counter on the charging card — identity hidden. Owner also sees opponent's top-card cost only.
- **Action phase (owner test — under evaluation)**: every surviving player unit acts left-to-right, then every surviving enemy unit acts left-to-right. Board order is evaluated live at each unit's action; deaths shift the board immediately, so later units target using the shifted layout. An enemy killed during the player sweep does not act. Each unit attacks the unit directly opposite; if no opposite unit, it attacks the enemy hero. Each attack remains a **mutual exchange** (attacker and a living defender both deal their ATK to each other). Overkill damage is lost. The prior interleaved order is preserved in git history at commit `f5b2fdd`.
- **Death**: a unit at 0 HP dies; all units shift left to fill the gap. A unit that dies before its action in the same phase does NOT act (action list resolves live).
- **Deck-out**: when a deck is empty, nothing happens — no more cards revealed, no reshuffle, no fatigue. Deck never refills in v0.
- **Board cap 20**: if a charging card finishes its timer while the board is full, it waits at 0 and enters on the next free slot.
- **Bosses** start on board before the first reveal: they occupy column 1, act in the first action phase, count toward the 20-slot cap.

## Keywords (v0)
- **Divine Shield** — negates the first instance of damage, then breaks.
- **Poisonous** — any unit it damages dies (including its own death-blow trade). Blocked by Divine Shield if the shield absorbs the hit.
- **Deathrattle** — triggers when the unit dies.
- **Aura** — continuous buff to adjacent (or all friendly) units while alive; ends when the aura unit dies.
- **Windfury** — acts twice per action phase (two full attacks; second attack hits shieldless/face if the first broke a shield).
- **Battlecry** — triggers when the unit ENTERS PLAY (lands on the board), NOT when revealed/charging.

## Card pool (30)
Stat scale tuned for 40 hero HP and small decks.

**Cost 1 (12):**
1. Dagger Imp — 2/1
2. Sellsword — 2/2
3. Twinfang — 1/1 Windfury
4. Brood Wisp — 1/2, Deathrattle: summon 1/1
5. Hex Hurler — 1/1, Battlecry: deal 2 to opposite unit
6. Tax Collector — 1/2, Battlecry: enemy charging card +1 turn
7. Chrono Imp — 1/1, Battlecry: your charging card ticks down 1 extra
8. Gate Crasher — 2/1, Battlecry: push the unit opposite to the rightmost empty slot
9. Leeching Tick — 1/2, when this kills a unit, gain +1/+1
10. Squire — 1/1, Battlecry: adjacent units get +1/+1
11. Spiteful Imp — 1/1, Deathrattle: deal 1 to the unit opposite
12. Scout — 2/1, Battlecry: reveal the identity of the enemy's charging card

**Cost 2 (10):**
13. Road Ogre — 3/4
14. Aegis Knight — 2/4 Divine Shield
15. Venom Hound — 3/2 Poisonous
16. Plague Bearer — 2/3, Deathrattle: deal 1 to all enemies
17. Warlord — 2/3, Aura: adjacent +1/+0
18. Bulwark — 1/5, Deathrattle: the unit opposite gets −2 ATK
19. Duelist — 3/2, Battlecry: +1/+1 for each adjacent friendly unit
20. Hexblade — 2/1, Battlecry: set the unit opposite to 1/1
21. Gravedigger — 2/2, Battlecry: summon a 1/1 for each unit that died this combat
22. Meddler — 2/2, Battlecry: put the enemy's charging card back on top of their deck

**Cost 3 (8):**
23. Colossus — 6/6
24. Inquisitor — 4/5, Battlecry: deal 3 to highest-ATK enemy
25. Brood Queen — 3/6, Deathrattle: summon two 2/2s
26. Doomcaller — 4/4, Battlecry: destroy the enemy's charging card
27. Copycat — 3/3, Battlecry: copy the ATK/HP of the unit opposite
28. Overlord — 2/4, Aura: all your units +1/+1
29. Cultist — 3/2, Battlecry: destroy your leftmost other unit, gain its ATK and HP
30. Cataclysm — 1/1, Battlecry: deal 2 to ALL units (both sides)

## Fixed starter deck (8)
Dagger Imp, Sellsword ×2, Brood Wisp, Twinfang, Hex Hurler, Squire, Road Ogre.

## Enemies (scripted, escalating)
- **Fight 1 — Vanilla midrange**: deck of 2/2s and 3/4s. Teaches reveal/charging; beatable by starter deck.
- **Fight 2 — Token boss**: starts with a boss unit on board: 1/10, "create a 1/1 token when it attacks" (token enters its leftmost empty slot after damage resolves; no token if board full). Occupies column 1, acts turn 1. Clean answer: Poisonous.
- **Fight 3 — Aura boss**: starts with a boss unit on board: 1/10, "friendly units enter play with +1/+1" (aura; dies with the boss). Clean answers: wipe (Plague Bearer/Cataclysm) or racing before buffs snowball.
- Enemy decks play by the same rules (reveal top card each round, leftmost empty slot, etc.). Bosses are pre-board exceptions.

## Balance flags (watch in playtests)
- Hexblade / Doomcaller are the strongest control cards (deliberate — the tall/charger answers).
- Meddler vs a 3-cost charger is brutal tempo.
- Gate Crasher is the only "cheese" card — if face-races end too fast, nerf it first.
- 40 HP vs the stat scale above is unproven — expected combat length target is ~10–14 rounds.

## Deferred (consciously, not forgotten)
- Archetypes 4–7 (buff-combo engine, tokens+lords engine, stax engine, ramp engine) — support cards exist in the pool, engines come later.
- Draft curation vs doomed runs (pure random 1-of-3 for now).
- Final number tuning.
- Mana pool / multi-charger economies.
- Card-return mechanics (harsh-requirement exceptions, none in v0 pool).
- All meta (map, gold, shops, upgrades, card removal).

## Tech direction
- Web (browser), dependency-light, prototype quality.
- Combat must be watchable: clear reveal → charge → action sequencing with readable timing.
