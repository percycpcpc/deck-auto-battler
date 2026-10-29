# Binding Rulings (K3 design review — build contract)

Every ruling below is BINDING for the v0 implementation. Where the spec was ambiguous, this is the answer. Source: K3 plan review of docs/SPEC.md.

## Round structure (exact order)
1. **Reveal**: if a side's charger slot is empty and its deck is non-empty, top card enters the charger with counter = cost.
2. **Tick**: all charging counters −1.
3. **Deploy**: any charger at 0 enters the leftmost empty slot; Battlecries resolve (player first). If board full, charger waits at 0 and deploys at the next Deploy step with a free slot.
4. **Action (owner test — under evaluation)**: the player side completes a live left-to-right sweep, then the enemy side completes a live left-to-right sweep. Deaths shift the board immediately; later actions use the current board position, and an enemy killed in the player sweep never acts. The previous interleaved ruling is preserved at commit `f5b2fdd`.
5. **Cleanup**: deaths and Deathrattles resolve.

A card revealed on round N with cost 1 deploys on round N+1 and acts that same round.

## Damage
- **Mutual exchange within sequential sweeps**: when a unit attacks a living defender, attacker and defender both deal their ATK to each other. Every attack is an exchange; Windfury = two exchanges. This supersedes the old within-round interleaving/simultaneous-action interpretation for the owner test, but does not change `exchange`: a defender that survives until its own side's sweep may later initiate its own exchange. (If playtests show fights ending too fast, the fallback is attacker-only damage — config flag.)
- **Opposite is evaluated at the moment of action**, after any mid-phase shifts. Overkill is lost; it never splashes to the hero (no trample).

## Death, shift, Deathrattle ordering
- Deaths are checked after every individual action; survivors shift left immediately; the action sequence is re-evaluated by position index (no phase-start snapshot). A unit that dies before its turn does not act.
- In a mutual exchange that kills both, **player's Deathrattles resolve first**, then enemy's. DR summons enter the leftmost empty slot *after* shift-left and never act in the current action phase.

## Charger manipulation
- Tax Collector, Chrono Imp, Doomcaller, Meddler all fizzle if their target charger slot is empty.
- Chrono Imp reducing a counter from 1 to 0 deploys the card immediately (same Deploy step).
- Meddler's bounced card goes on top of the enemy deck and re-enters the charger on the next Reveal.

## Tokens
- All tokens (Brood Wisp, Brood Queen, Gravedigger, boss hive) enter the leftmost empty slot; lost if the board is full. Tokens count as units for Gravedigger, Cultist, Cataclysm, and the 20-slot cap.

## Draft
- Each draft = two sequential pick-1-of-3 (pick → fresh set of 3). Offers are uniform random from the full 30-card pool, duplicates allowed. Starter cards are never removed. Deck grows 8 → 10 → 12.

## Keyword interactions
- Windfury vs Divine Shield: first exchange pops the shield (whole instance negated), second exchange damages normally. Poisonous only triggers if damage actually lands — a negated hit does not kill.
- Poisonous in a mutual exchange: any unit damaged by a Poisonous source dies, regardless of HP — both can die in one exchange. Hero damage is never Poisonous-relevant.
- **Base stats + dynamic auras**: units store base ATK/HP; auras (Warlord, Overlord, boss herald) recompute on top continuously whenever board state changes (death-shifts re-evaluate adjacency).
- Hexblade sets the target's **base** stats to 1/1 (an adjacent Warlord then makes it effectively 2/1).
- Copycat copies the opposite unit's current **effective** stats as its new base.
- Cultist gains the destroyed unit's current effective stats added to its base.
- Inquisitor tiebreak: **leftmost** among tied highest-ATK units (effective ATK, post-aura).
- Gravedigger counts **all unit deaths on both sides** since the fight began, including tokens and deaths before Gravedigger entered, excluding itself.

## Numeric decisions
- **Hero HP stays 40** (owner number) — but it is a single config constant; K3's model predicts ~18–25 round fights at 40 and recommends 30 as the first tuning dial.
- **Stalemate safety valve** (new rule): if both decks are empty and nothing is charging, and a full round passes with no change in total unit count on either side, the fight ends immediately — higher hero HP wins; tie goes to the player.
- **Enemy decks**: Fight 1 = 6× 2/1 (cost 1) + 2× 2/3 (cost 2), shuffled. Fights 2–3 = same shell minus one card, plus the pre-boarded boss. (Owner-approved balance fix 2026-10-29: the original 5× 2/2 + 3× 3/4 shell out-statted the starter deck 19/22 vs 12/14 and went 0/500 in simulation; the weaker shell wins ~65%.)

## Information
- Owner sees their own charging card's identity only (not the card beneath it). Opponent sees cost dot + counter only.
- Scout's Battlecry reveals the enemy charger's identity until it deploys (no persistent effect).

## Wording fixes to the spec
- Fight-3 boss aura: "**friendly** units enter play with +1/+1" (one-time base-stat mod on entry, including tokens; the boss itself is not retroactively buffed).
- Fights 2–3 boss: occupies enemy column 1, acts in the first action phase.
