# Binding Rulings (K3 design review — build contract)

Every ruling below is BINDING for the v0 implementation. Where the spec was ambiguous, this is the answer. Source: K3 plan review of docs/SPEC.md.

## Round structure (exact order)
1. **Reveal**: if a side's charger slot is empty and its deck is non-empty, top card enters the charger with counter = cost.
2. **Tick**: all charging counters −1.
3. **Deploy**: any charger at 0 enters the leftmost empty slot; Battlecries resolve (player first). If board full, charger waits at 0 and deploys at the next Deploy step with a free slot.
4. **Action (owner test — under evaluation)**: the player side completes a live left-to-right sweep, then the enemy side completes a live left-to-right sweep. A lethal unit becomes an inert corpse in its current slot, never acts, and is treated as no unit for targeting; its lane can therefore be hit through to the hero. The previous interleaved ruling is preserved at commit `f5b2fdd`.
5. **Cleanup**: after both sweeps, all corpses are removed in one batch per affected side and survivors shift left once.

A card revealed on round N with cost 1 deploys on round N+1 and acts that same round.

**Enemy deployment owner clarification:** “the order of the enemy is preseeded, not starting all on board at round1.” Regular enemy units remain in the deck and reveal, charge, and deploy through the normal one-per-round economy. Only Hivematron/Warherald begin pre-boarded in column 1 in fights 2/3. Each fight uses the fixed order documented in `SPEC.md`; the enemy deck-top, charger identity, remaining count, and full current-fight queue are public. Scout therefore narrates an “already scouted” fizzle rather than revealing hidden information.

## Damage
- **Mutual exchange within sequential sweeps**: when a unit attacks a living defender, attacker and defender both deal their ATK to each other. Every attack is an exchange; Windfury = two exchanges. This supersedes the old within-round interleaving/simultaneous-action interpretation for the owner test, but does not change `exchange`: a defender that survives until its own side's sweep may later initiate its own exchange. (If playtests show fights ending too fast, the fallback is attacker-only damage — config flag.)
- **Opposite is evaluated at the moment of action**. A corpse in the opposite slot counts as no unit, so the attack hits the hero; damage dealt to a living unit never splashes (no trample).

## Death, shift, Deathrattle ordering
- Deaths are checked after every individual action. Lethal units are marked dead immediately, emit `death`, increment the death count, and fire Deathrattles, but remain in place until round-end cleanup. Corpses are excluded from actions, targeting, auras, Battlecries, summon pings, and every other live-unit query.
- In a mutual exchange that kills both, **player's Deathrattles resolve first**, then enemy's. DR summons append subject to the physical board cap (corpses still occupy slots) and never act in the current action phase.
- Cleanup removes all marked corpses while preserving survivor order, then emits one `shift { side, removedUids }` event per affected side. There is no second death event and no mid-sweep compaction.

## Charger manipulation
- Tax Collector, Chrono Imp, Doomcaller, Meddler all fizzle if their target charger slot is empty.
- Chrono Imp reducing a counter from 1 to 0 deploys the card immediately (same Deploy step).
- Meddler's bounced card goes on top of the enemy deck and re-enters the charger on the next Reveal.

## Tokens
- All tokens (Brood Wisp, Brood Queen, Gravedigger, boss hive) enter the leftmost empty slot; lost if the board is full. Tokens count as units for Gravedigger, Cultist, Cataclysm, and the 20-slot cap.

## Draft
- Each draft = two sequential pick-1-of-3 (pick → fresh set of 3). Offers are uniform random from the full 36-card pool, duplicates allowed. Starter cards are never removed. Deck grows 8 → 10 → 12.

## Fixed starter deck (8)
Dagger Imp, Sellsword, Oathbound ×2, Brood Wisp, Twinfang, Hex Hurler, Road Ogre.

Owner tuning: 1-cost 2/4 to soften early game.

## Keyword interactions
- Windfury vs Divine Shield: first exchange pops the shield (whole instance negated), second exchange damages normally. Poisonous only triggers if damage actually lands — a negated hit does not kill.
- Poisonous in a mutual exchange: any unit damaged by a Poisonous source dies, regardless of HP — both can die in one exchange. Hero damage is never Poisonous-relevant.
- **Base stats + dynamic auras**: units store base ATK/HP; living aura sources recompute continuously. Corpses provide no aura, and their empty lane breaks adjacency until cleanup compacts the board.
- Hexblade sets the target's **base** stats to 1/1 (an adjacent Warlord then makes it effectively 2/1).
- Copycat copies the opposite unit's current **effective** stats as its new base.
- Cultist gains the destroyed unit's current effective stats added to its base.
- Inquisitor tiebreak: **leftmost** among tied highest-ATK units (effective ATK, post-aura).
- Gravedigger counts **all unit deaths on both sides** since the fight began, including tokens and deaths before Gravedigger entered, excluding itself.

## Numeric decisions
- **Hero HP stays 40** (owner number) — but it is a single config constant; K3's model predicts ~18–25 round fights at 40 and recommends 30 as the first tuning dial.
- **Stalemate safety valve** (new rule): if both decks are empty and nothing is charging, and a full round passes with no change in total **live** unit count on either side, the fight ends immediately — higher hero HP wins; tie goes to the player. Corpses never delay this valve.
- **Enemy decks**: Fight 1 = 6× 2/1 (cost 1) + 2× 2/3 (cost 2); fights 2–3 use five 2/1s + two 2/3s plus the pre-boarded boss. These shells use the fixed, unshuffled scripts in `SPEC.md`. (Owner-approved balance fix 2026-10-29: the original 5× 2/2 + 3× 3/4 shell out-statted the starter deck 19/22 vs 12/14 and went 0/500 in simulation.)

## Information
- Owner sees their own charging card's identity only (not the card beneath it). Opponent sees cost dot + counter only.
- Scout's Battlecry reveals the enemy charger's identity until it deploys (no persistent effect).

## Wording fixes to the spec
- Fight-3 boss aura: "**friendly** units enter play with +1/+1" (one-time base-stat mod on entry, including tokens; the boss itself is not retroactively buffed).
- Fights 2–3 boss: occupies enemy column 1, acts in the first action phase.
