# Binding Rulings (K3 design review — build contract)

Every ruling below is BINDING for the v0 implementation. Where the spec was ambiguous, this is the answer. Source: K3 plan review of docs/SPEC.md.

## Round structure (exact order)
> **OWNER EXPERIMENT — under owner evaluation.** Revert the whole experiment (spine + follow-ups) with `git revert 3cf09cc^..HEAD`.

Player always takes the first turn, then turns strictly alternate.

1. **Upkeep**: active side gains +1 persistent, uncapped mana.
2. **Deploy**: repeatedly spend the top card's cost and put it into the leftmost empty slot while affordable and below the 20-unit cap. Resolve each Battlecry before checking the new top card. Unspent mana persists; blocked cards cost nothing.
3. **Combat**: active living units sweep left-to-right using the existing mutual-exchange rules. A unit with `enteredTurn` equal to the current `turnNumber` has summoning sickness and does not act unless it has Rush. Windfury performs two exchanges; sick Windfury units do not act, while Rush Windfury units exchange twice normally. Units killed before their action do not act.
4. **Cleanup**: after the combat sweep, remove marked corpses from both sides. Emit one `shift { side, removedUids }` per affected side and compact each affected side once preserving order, so the idle side begins its turn corpse-free.
5. **Pass**: the opponent becomes active.

## Damage
- **Mutual exchange within sequential sweeps**: when a unit attacks a living defender, attacker and defender both deal their ATK to each other. Every attack is an exchange; Windfury = two exchanges. This supersedes the old within-round interleaving/simultaneous-action interpretation for the owner test, but does not change `exchange`: a defender that survives until its own side's sweep may later initiate its own exchange. (If playtests show fights ending too fast, the fallback is attacker-only damage — config flag.)
- **Opposite is evaluated at the moment of action**. A corpse in the opposite slot counts as no unit, so the attack hits the hero; damage dealt to a living unit never splashes (no trample).

## Death, shift, Deathrattle ordering
- Deaths are checked after every individual action. Lethal units are marked dead immediately, emit `death`, increment the death count, and fire Deathrattles, but remain in place until round-end cleanup. Corpses are excluded from actions, targeting, auras, Battlecries, summon pings, and every other live-unit query.
- In a mutual exchange that kills both, **player's Deathrattles resolve first**, then enemy's. DR summons append subject to the physical board cap (corpses still occupy slots) and never act in the current action phase.
- Cleanup at each player's end of turn removes all marked corpses from both sides while preserving survivor order, then emits one `shift { side, removedUids }` event per affected side. There is no second death event and no mid-sweep compaction.

## Experiment card exclusions
Tax Collector, Chrono Imp, Meddler, and Doomcaller are deprecated from draft generation because their live text depends on the removed slot. They remain legal in the union pool for saved-deck compatibility. Scout remains active because its live Battlecry now reduces the opposing unit's ATK and has no dependency on the removed system.

## Tokens
- All tokens (Brood Wisp, Brood Queen, Gravedigger, boss hive) enter the leftmost empty slot; lost if the board is full. Tokens have summoning sickness and cannot act during the turn they enter unless they have Rush. Tokens count as units for Gravedigger, Cultist, Cataclysm, and the 20-slot cap.

## Draft
- Each draft = two sequential pick-1-of-3 (pick → fresh set of 3). Every offer contains three distinct cards; each slot first rolls a tier (Common 50%, Rare 35%, Mythic 15%), then chooses uniformly within that tier and re-rolls duplicates. Starter cards are never removed. Deck grows 8 → 10 → 12.
- Soft seasons only add cards to the active draft pool; draft cadence and 50/35/15 tier weighting do not change as the pool grows.

## Seasonal card removal and legacy legality
- No card is removed from play before the union pool reaches approximately 60 cards. Config may mark cards deprecated, but deprecation does not remove them from the legal union or invalidate a saved deck. Legacy saved decks remain legal forever under the current soft-season model; any later Standard/Open split requires a separate ruling and migration plan.

## Fixed starter deck (8)
Dagger Imp, Sellsword, Oathbound ×2, Brood Wisp, Twinfang, Hex Hurler, Road Ogre.

Owner tuning: 1-cost 2/4 to soften early game.
Owner tuning: fights 2/3 enemy support decks thinned to 4 so the player can out-value the boss after clearing the line.

## Keyword interactions
- Rush ignores summoning sickness only; it does not change entry timing, Battlecries, targeting, or exchanges.
- Windfury vs Divine Shield: first exchange pops the shield (whole instance negated), second exchange damages normally. Poisonous only triggers if damage actually lands — a negated hit does not kill.
- Poisonous in a mutual exchange: any unit damaged by a Poisonous source dies, regardless of HP — both can die in one exchange. Hero damage is never Poisonous-relevant.
- **Base stats + dynamic auras**: units store base ATK/HP; living aura sources recompute continuously. Corpses provide no aura, and their empty lane breaks adjacency until cleanup compacts the board.
- Hexblade sets the target's **base** stats to 1/1 (an adjacent Warlord then makes it effectively 2/1).
- Copycat copies the opposite unit's current **effective** stats as its new base.
- Cultist gains the destroyed unit's current effective stats added to its base.
- Inquisitor tiebreak: **leftmost** among tied highest-ATK units (effective ATK, post-aura).
- Gravedigger counts **all unit deaths on both sides** since the fight began, including tokens and deaths before Gravedigger entered, excluding itself.

## Replay information

Replays are full-information: both decks and all events are visible to anyone with the link. Live-scouting invariants (`UI_ARCHITECTURE.md`) apply ONLY to in-run fights.

## Numeric decisions
- **Hero HP stays 40** (owner number) — but it is a single config constant; K3's model predicts ~18–25 round fights at 40 and recommends 30 as the first tuning dial.
- **Global toughness pass (owner): all unit HP ×1.5 half-up, min +1; ATK unchanged; hero HP unchanged.**
- **Stalemate safety valve** (new rule): if both decks are empty and nothing is charging, and a full round passes with no change in total **live** unit count on either side, the fight ends immediately — higher hero HP wins; tie goes to the player. Corpses never delay this valve.
- **Enemy decks**: Fight 1 uses six pumped Common 2/3 Ash Grunts (cost 1) + two pumped Common 2/6 Camp Brutes (cost 2). Fights 2–3 use fixed, thinned support scripts with the legacy weaker Common 2/2 Grunts + Common 2/5 Brutes, alongside the pre-boarded 1/8 boss documented in `SPEC.md`, so the boss fights stay easier.

## Information
- Owner sees their own charging card's identity only (not the card beneath it). Opponent sees cost dot + counter only.
- Scout's Battlecry reveals the enemy charger's identity until it deploys (no persistent effect).

## Wording fixes to the spec
- Fight-2 boss aura: "**friendly** units enter play with +1/+1" (one-time base-stat mod on entry, including tokens; the boss itself is not retroactively buffed).
- Fights 2–3 boss: occupies enemy column 1, acts in the first action phase.
