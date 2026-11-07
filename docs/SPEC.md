# Deck Auto Battler — v0 SPEC (owner-approved)

Web prototype. Auto-battler deckbuilder: 3 scripted fights, draft between fights, full HP at the start of every fight.

## Core loop
Fixed 8-card starter deck → auto-combat vs scripted enemy → draft pick 1-of-3 (twice) → fight 2 → draft (twice) → fight 3 → run ends (victory screen).
- Lose = hero HP reaches 0 at any point → run over, restart.
- Hero HP resets to full (40) at the start of each fight. The victory screen reports the HP remaining at the end of the last fight.
- Each draft presents exactly 3 distinct cards. Every offer slot chooses a tier (Common 50%, Rare 35%, Mythic 15%), then chooses uniformly within that tier; duplicate rolls are re-rolled for that slot.
- No map, no economy, no meta in v0.

## Combat rules
> **OWNER EXPERIMENT — under owner evaluation.** This alternating-turn combat spine replaces the prior simultaneous five-step round for this pass. Revert the whole experiment (spine + follow-ups) with `git revert 3cf09cc^..HEAD`.

- **Battlefield**: up to 20 slots per side (viewport shows 5, scrolls horizontally). Columns are aligned: each unit faces the unit directly opposite.
- **Strict turns**: player takes the first turn, then sides alternate P, E, P, E. The idle side does nothing.
- **Upkeep and mana**: the active side gains +1 persistent, uncapped mana. Mana never resets.
- **Deploy**: repeatedly spend the top card's cost and put it in the leftmost empty slot while it is affordable and the board is below 20. Resolve each Battlecry before checking the new top card. A blocked or unaffordable card spends no mana.
- **Combat**: the active side's living, non-sick units sweep left-to-right. A unit that entered during the current side's turn cannot act until its controller's next turn unless it has Rush. Mutual exchanges, Windfury, moment-of-action opposite targeting, overkill loss, and corpse-lane hero hits are unchanged.
- **Death and cleanup**: lethal marking and Deathrattles remain immediate. At the end of the active side's turn, after its combat sweep, remove marked corpses from both sides; for each affected side, emit one `shift { side, removedUids }` and compact once preserving order. The idle side therefore begins its turn corpse-free.
- **Deck-out**: an empty deck does nothing; there is no reshuffle or fatigue.
- **Bosses** start in column 1, act on the enemy's first combat, and count toward the 20-slot cap.
- **Stalemate**: one full round is one player turn plus one enemy turn. If both decks are empty and a full round produces no meaningful combat-state change (hero HP, live-unit identity, stats, damage, or shield state), higher hero HP wins; equal HP is a draw. At 400 turns, the same HP comparison ends the fight as a safety limit even if combat is still changing.

## Keywords (v0)
- **Divine Shield** — negates the first instance of damage, then breaks.
- **Poisonous** — any unit it damages dies (including its own death-blow trade). Blocked by Divine Shield if the shield absorbs the hit.
- **Deathrattle** — triggers when the unit dies.
- **Aura** — continuous buff to adjacent (or all friendly) units while alive; ends when the aura unit dies.
- **Windfury** — acts twice per action phase (two full attacks; second attack hits shieldless/face if the first broke a shield).
- **Rush** — can act in the combat sweep of the turn it enters (ignores summoning sickness).
- **Battlecry** — triggers when the unit ENTERS PLAY (lands on the board), NOT when revealed/charging.

## Card pool (36)
Stat scale tuned for 40 hero HP and small decks.

### Rarity tiers
Common cards follow the vanilla toughness curve (cost 1 = 3 HP, cost 2 = 6 HP, cost 3 = 9 HP) and have no ability. Rare cards target roughly 1.5x curve toughness plus a keyword or minor ability. Mythic cards target 2x curve toughness plus an impactful ability and may cost 1 less than a normal unit. Mythic HP is hard-capped at 10 because literal 2x cost-2/3 toughness (12/18 HP) is unkillable within the 40-HP-hero combat scale.

Keywords count toward the toughness budget: Divine Shield is worth roughly 2 HP, while Poisonous is priced as removal and therefore receives a deliberately below-budget body. Scaling abilities also receive slightly below-budget bodies. Positional/opposite-targeting and charger-hate abilities are valued down because random draw order and leftmost deployment make them whiff often; their printed body is the compensated whiff floor.

Card frames denote rarity (bronze = Common, silver = Rare, gold = Mythic); cost is shown by the top-left cost gem.

**Common (6):**
1. Dagger Imp (cost 1) — 1/2, Battlecry: summon a 1/1 token
2. Sellsword (cost 1) — 3/3
3. Oathbound (cost 1) — 2/6 (starter keystone wall; intentionally above curve and excluded from ordinary draft offers)
4. Road Ogre (cost 2) — 3/6
5. Colossus (cost 3) — 6/9
6. Pit Tender (cost 1) — 1/4, Battlecry: destroy your leftmost other unit and gain its ATK and HP (legacy card id: `shield_saint`)

**Rare (22):**
1. Twinfang (cost 1) — 1/4 Rush, Windfury
2. Brood Wisp (cost 1) — 1/4, Deathrattle: summon 1/2
3. Hex Hurler (cost 1) — 1/5, Battlecry: deal 2 to the opposite unit, otherwise the rightmost enemy
4. Tax Collector (cost 1) — 1/4, Battlecry: gain 1 mana
5. Chrono Imp (cost 1) — 1/4, Battlecry: drain 1 enemy mana (minimum 0)
6. Gate Crasher (cost 1) — 2/4, Battlecry: push the unit opposite to the rightmost empty slot
7. Leeching Tick (cost 1) — 1/5, when this kills a unit, gain +1/+1
8. Squire (cost 1) — 1/4, Battlecry: give all other friendly units +1/+1
9. Spiteful Imp (cost 1) — 1/4, Deathrattle: deal 1 to the lowest-HP enemy unit (leftmost on ties)
10. Scout (cost 1) — 2/4, Battlecry: the opposing unit loses 2 ATK (minimum 0)
11. Aegis Knight (cost 2) — 2/7 Divine Shield
12. Venom Hound (cost 2) — 1/5 Poisonous
13. Plague Bearer (cost 2) — 2/9, Deathrattle: deal 1 to all enemies
14. Warlord (cost 2) — 2/9, Aura: adjacent +1/+0
15. Bulwark (cost 2) — 1/9, Deathrattle: the highest-ATK enemy loses 2 ATK
16. Duelist (cost 2) — 3/5, On deploy: gain +2/+2 if your line has no other living unit
17. Gravedigger (cost 2) — 2/6, Battlecry: summon a 1/2 for each unit that died this combat
18. Meddler (cost 2) — 2/6, Battlecry: return the opposite non-boss unit to the top of its deck, stripped of changes
19. Headsman (cost 2) — 3/8, after this kills a unit, gain +2/+2
20. Firebelcher (cost 2) — 2/9, Battlecry: deal 1 damage to ALL enemy units
21. Bristleback (cost 2) — 1/9, when this takes damage and survives, gain +3 Attack
22. Quillback Elder (cost 3) — 3/10, when any other unit enters a battlefield, deal 1 damage to it

**Mythic (8):**
1. Hexblade (cost 2) — 2/6, Battlecry: set the opposite unit's base ATK and HP to 1 (keywords and auras remain)
2. Copycat (cost 2) — 3/6, Battlecry: copy the opposite unit's current effective ATK and remaining HP as base stats (keywords are not copied)
3. Cataclysm (cost 3) — 2/6, Battlecry: deal 2 to ALL units on both sides, including itself
4. Cultist (cost 3) — 3/8, Battlecry: destroy your leftmost other unit, gain its ATK and HP
5. Doomcaller (cost 3) — 4/10, Battlecry: return the opposite non-boss unit to the bottom of its deck, stripped of changes
6. Inquisitor (cost 3) — 4/10, Battlecry: deal 5 to highest-ATK enemy
7. Overlord (cost 3) — 2/10, Aura: all your units +1/+1
8. Brood Queen (cost 3) — 3/10, Deathrattle: summon two 2/3s

Owner tuning: counter package vs boss engines.

## Fixed starter deck (8)
Dagger Imp, Sellsword, Oathbound ×2, Brood Wisp, Twinfang, Hex Hurler, Road Ogre.

Owner tuning: 1-cost 2/4 to soften early game.

## Season 2 — Emberwake
- Starter selection retains the three Founders March identities and adds Ember Vanguard as a fourth seasonal showcase. Every starter is an eight-card deck drawn from the cumulative legal pool.
- Furnace Hound is a higher-pressure 2-cost 4/4 Poisonous alternative to Venom Hound's defensive 1/5 body; Phoenix Matron is a 3-cost 4/9 Deathrattle sidegrade to Brood Queen's 3/10. Ember Scout's after-action team heal makes its 2/2 body mechanically distinct. Ashguard is a 1-cost 1/5 Common with Divine Shield and an adjacent +1 ATK aura, making it the protected formation bridge rather than an Aegis Knight reprint.
- Enemy Divine Shield is absent from the opening encounters, appears on teaching levels 4/5 and 9/10, is absent again on levels 11–13, then applies broadly on levels 14–20. The schedule is season config, not a global combat rule.

## Enemies (scripted, escalating)
- **Fight 1 — Vanilla midrange**: deck of 2/3 Ash Grunts and 2/6 Camp Brutes. Both are Common-tier cards. Teaches reveal/charging; beatable by starter deck.
- **Fight 2 / milestone 5 and 15 — Recruitment boss**: its thinned support deck uses legacy weaker Common 2/2 Ash Grunts and Common 2/5 Camp Brutes. Warherald starts on board at 1/8. Each later friendly recruit permanently gains +1/+1 as a base-stat modification. Killing Warherald stops future reinforcement buffs but does not remove buffs already granted. Clean answers: remove it before the support line arrives, wipe the reinforced line, or race the engine.
- **Fight 3 / milestone 10 — Token boss**: its thinned support deck uses the same legacy weaker Common 2/2 Ash Grunts and Common 2/5 Camp Brutes. Hivematron starts on board at 1/8, "after this attacks, summon a 1/2 Hive (max 3 living)." The token enters the leftmost empty slot after damage resolves; there is no token if the board is full or three living Hives already exist. Occupies column 1 and acts on the enemy's first eligible combat. Clean answer: Poisonous after protection is broken.
- **Milestone 20 — Removable-aura boss**: starts with Broodmother on board. Its dynamic +1/+1 aura affects every other living ally only while Broodmother lives; killing it immediately removes that bonus. This is deliberately different from Warherald's permanent recruitment buffs.
- **Teaching encounters**: the fight immediately before each milestone introduces one mechanic in the public script: level 4 Divine Shield, level 9 Deathrattle tokens, level 14 shielded Poisonous units, and level 19 adjacency formation auras. The next-fight preview names the lesson before the player makes the intervening draft or deck-event choice.
- Enemy regular units use the same reveal, charge, and leftmost-deploy rules as the player. Bosses remain the pre-board exception in column 1. Enemy draw order is fixed and public; `enemyDeckFor(fight)` never shuffles it:
  - Fight 1: Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt, Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt.
  - Fight 2: Ash Grunt, Camp Brute, Ash Grunt, Camp Brute.
  - Fight 3: Ash Grunt, Ash Grunt, Camp Brute, Ash Grunt.
- Scout remains in the pool. Its Battlecry permanently reduces the opposing living unit's base ATK by 2, floored at 0.

## Balance flags (watch in playtests)
- Hexblade / Doomcaller are the strongest control cards (deliberate — the tall/charger answers).
- Meddler vs a 3-cost charger is brutal tempo.
- Gate Crasher is the only "cheese" card — if face-races end too fast, nerf it first.
- 40 HP vs the stat scale above is unproven — expected combat length target is ~10–14 rounds.

## Deferred (consciously, not forgotten)
- Archetypes 4–7 (buff-combo engine, tokens+lords engine, stax engine, ramp engine) — support cards exist in the pool, engines come later.
- Final number tuning.
- Player-choice mana economies beyond the deterministic Tax Collector/Chrono Imp effects.
- Card-return mechanics beyond Meddler/Doomcaller's fixed opposite-unit destinations.
- All meta (map, gold, shops, upgrades, card removal).

## Tech direction
- Web (browser), dependency-light, prototype quality.
- Solo fight resolution is server-authoritative. The authenticated `POST /api/sim/solo` endpoint accepts the ordered player card ids, a uint32 seed, and the fight number; the server validates union-pool legality, derives the seasonal enemy line, runs the deterministic engine to completion, and returns `{winner, rounds, events}`. The client mounts the battle once and only replays that event log through the shared replay animation pipeline. If the server is unreachable, the same seeded engine inputs may run locally as an explicit offline fallback; this fallback is not authoritative online.
- Combat must be watchable: clear reveal → charge → action sequencing with readable timing.
