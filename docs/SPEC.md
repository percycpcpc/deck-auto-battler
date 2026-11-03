# Deck Auto Battler — v0 SPEC (owner-approved)

Web prototype. Auto-battler deckbuilder: 3 scripted fights, draft between fights, HP persists across the run.

## Core loop
Fixed 8-card starter deck → auto-combat vs scripted enemy → draft pick 1-of-3 (twice) → fight 2 → draft (twice) → fight 3 → run ends (victory screen).
- Lose = hero HP reaches 0 at any point → run over, restart.
- HP persists across all 3 fights (Slay-the-Spire model: HP is carried debt).
- Each draft offer slot chooses a tier (Common 50%, Rare 35%, Mythic 15%), then chooses uniformly within that tier; duplicates are allowed.
- No map, no economy, no meta in v0.

## Combat rules
- **Battlefield**: up to 20 slots per side (viewport shows 5, scrolls horizontally). Columns are aligned: each unit faces the unit directly opposite.
- **Reveal phase**: both sides reveal the top card of their deck into a charging slot. The card enters play when its cost (in turns) ticks down: cost 1 = next round, cost 2 = two rounds, cost 3 = three rounds. On entering, it lands in the **leftmost empty slot**. Bosses are the only pre-boarded enemy units.
- **Information**: the player sees their own top card's identity; their deeper draw order remains private. The enemy's scripted queue is public by owner ruling: its deck-top, charger identity, remaining count, and complete ordered queue may be inspected. No future-fight or RNG information is exposed during a fight.
- **Action phase (owner test — under evaluation)**: every surviving player unit acts left-to-right, then every surviving enemy unit acts left-to-right. Lethal units remain as inert corpses in their lanes until round-end cleanup. Corpses never act or count as valid units, auras, pingers, or targets; an attacker opposite a corpse therefore attacks the enemy hero. Each attack remains a **mutual exchange** (attacker and a living defender both deal their ATK to each other). Overkill damage is lost. The prior interleaved order is preserved in git history at commit `f5b2fdd`.
- **Death and cleanup**: lethal damage, the `death` event, the death counter, and Deathrattles resolve immediately. The marked corpse stays in the board array and leaves an empty combat lane until the end of the full round (both side sweeps). Cleanup removes all corpses in one batch per affected side, emits `shift { side, removedUids }`, and shifts survivors left once while preserving order. A unit that dies before its action does not act.
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

## Card pool (36)
Stat scale tuned for 40 hero HP and small decks.

### Rarity tiers
Common cards follow the vanilla toughness curve (cost 1 = 3 HP, cost 2 = 6 HP, cost 3 = 9 HP) and have no ability. Rare cards target roughly 1.5x curve toughness plus a keyword or minor ability. Mythic cards target 2x curve toughness plus an impactful ability and may cost 1 less than a normal unit. Mythic HP is hard-capped at 10 because literal 2x cost-2/3 toughness (12/18 HP) is unkillable within the 40-HP-hero combat scale.

Keywords count toward the toughness budget: Divine Shield is worth roughly 2 HP, while Poisonous is priced as removal and therefore receives a deliberately below-budget body. Scaling abilities also receive slightly below-budget bodies. Positional/opposite-targeting and charger-hate abilities are valued down because random draw order and leftmost deployment make them whiff often; their printed body is the compensated whiff floor.

Card frames denote rarity (bronze = Common, silver = Rare, gold = Mythic); cost is shown by the top-left cost gem.

**Common (5):**
1. Dagger Imp (cost 1) — 2/2
2. Sellsword (cost 1) — 2/3
3. Oathbound (cost 1) — 2/6 (starter keystone wall; intentionally above curve)
4. Road Ogre (cost 2) — 3/6
5. Colossus (cost 3) — 6/9

**Rare (23):**
1. Twinfang (cost 1) — 1/4 Windfury
2. Brood Wisp (cost 1) — 1/4, Deathrattle: summon 1/2
3. Hex Hurler (cost 1) — 1/5, Battlecry: deal 2 to opposite unit
4. Tax Collector (cost 1) — 1/4, Battlecry: enemy charging card +1 turn
5. Chrono Imp (cost 1) — 1/4, Battlecry: your charging card ticks down 1 extra
6. Gate Crasher (cost 1) — 2/4, Battlecry: push the unit opposite to the rightmost empty slot
7. Leeching Tick (cost 1) — 1/5, when this kills a unit, gain +1/+1
8. Squire (cost 1) — 1/4, Battlecry: adjacent units get +1/+1
9. Spiteful Imp (cost 1) — 1/4, Deathrattle: deal 1 to the unit opposite
10. Scout (cost 1) — 2/4, Battlecry: reveal the identity of the enemy's charging card
11. Aegis Knight (cost 2) — 2/7 Divine Shield
12. Venom Hound (cost 2) — 3/5 Poisonous
13. Plague Bearer (cost 2) — 2/9, Deathrattle: deal 1 to all enemies
14. Warlord (cost 2) — 2/9, Aura: adjacent +1/+0
15. Bulwark (cost 2) — 1/9, Deathrattle: the unit opposite gets −2 ATK
16. Duelist (cost 2) — 3/5, On deploy: gain +2/+2 if no adjacent ally
17. Gravedigger (cost 2) — 2/6, Battlecry: summon a 1/2 for each unit that died this combat
18. Meddler (cost 2) — 2/6, Battlecry: put the enemy's charging card back on top of their deck
19. Headsman (cost 2) — 3/8, after this kills a unit, gain +2/+2
20. Firebelcher (cost 2) — 2/9, Battlecry: deal 1 damage to ALL enemy units
21. Shield Saint (cost 2) — 3/6 Divine Shield
22. Bristleback (cost 2) — 1/9, when this takes damage and survives, gain +3 Attack
23. Quillback Elder (cost 3) — 3/13, when any other unit enters a battlefield, deal 1 damage to it

**Mythic (8):**
1. Hexblade (cost 2) — 2/6, Battlecry: set the unit opposite to 1/1
2. Copycat (cost 2) — 3/6, Battlecry: copy the ATK/HP of the unit opposite
3. Cataclysm (cost 3) — 2/6, Battlecry: deal 2 to ALL units (both sides)
4. Cultist (cost 3) — 3/8, Battlecry: destroy your leftmost other unit, gain its ATK and HP
5. Doomcaller (cost 3) — 4/10, Battlecry: destroy the enemy's charging card
6. Inquisitor (cost 3) — 4/10, Battlecry: deal 3 to highest-ATK enemy
7. Overlord (cost 3) — 2/10, Aura: all your units +1/+1
8. Brood Queen (cost 3) — 3/10, Deathrattle: summon two 2/3s

Owner tuning: counter package vs boss engines.

## Fixed starter deck (8)
Dagger Imp, Sellsword, Oathbound ×2, Brood Wisp, Twinfang, Hex Hurler, Road Ogre.

Owner tuning: 1-cost 2/4 to soften early game.

## Enemies (scripted, escalating)
- **Fight 1 — Vanilla midrange**: deck of 2/3 Ash Grunts and 2/6 Camp Brutes. Both are Common-tier cards. Teaches reveal/charging; beatable by starter deck.
- **Fight 2 — Token boss**: support deck uses legacy weaker Common 2/2 Ash Grunts and Common 2/5 Camp Brutes so the boss fight stays easier. Starts with Hivematron on board: 1/8, "create a 1/2 token when it attacks" (token enters its leftmost empty slot after damage resolves; no token if board full). Occupies column 1, acts turn 1. Clean answer: Poisonous.
- **Fight 3 — Aura boss**: support deck uses the same legacy weaker Common 2/2 Ash Grunts and Common 2/5 Camp Brutes so the boss fight stays easier. Starts with Warherald on board: 1/8, "friendly units enter play with +1/+1" (aura; dies with the boss). Clean answers: wipe (Plague Bearer/Cataclysm) or racing before buffs snowball.
- Enemy regular units use the same reveal, charge, and leftmost-deploy rules as the player. Bosses remain the pre-board exception in column 1. Enemy draw order is fixed and public; `enemyDeckFor(fight)` never shuffles it:
  - Fight 1: Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt, Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt.
  - Fight 2: Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt.
  - Fight 3: Ash Grunt, Camp Brute, Ash Grunt, Camp Brute.
- Scout remains in the pool. Its Battlecry is a narrated fizzle: **“Already scouted — enemy order is known.”**

## Balance flags (watch in playtests)
- Hexblade / Doomcaller are the strongest control cards (deliberate — the tall/charger answers).
- Meddler vs a 3-cost charger is brutal tempo.
- Gate Crasher is the only "cheese" card — if face-races end too fast, nerf it first.
- 40 HP vs the stat scale above is unproven — expected combat length target is ~10–14 rounds.

## Deferred (consciously, not forgotten)
- Archetypes 4–7 (buff-combo engine, tokens+lords engine, stax engine, ramp engine) — support cards exist in the pool, engines come later.
- Final number tuning.
- Mana pool / multi-charger economies.
- Card-return mechanics (harsh-requirement exceptions, none in v0 pool).
- All meta (map, gold, shops, upgrades, card removal).

## Tech direction
- Web (browser), dependency-light, prototype quality.
- Combat must be watchable: clear reveal → charge → action sequencing with readable timing.
