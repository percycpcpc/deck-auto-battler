# DECK AUTO BATTLER v0 — Design Review & Art Direction

---

## 1. PLAN REVIEW — holes, risks, contradictions

### A. Sequencing questions the spec leaves open (with binding answers)

**1. Round timeline is never defined.**
The spec describes reveal, charging, and action phases but never states the order of operations within a round, which is the single most likely place two implementers diverge. *Resolution — bind this exact round structure:*
1. **Reveal**: if a side's charger slot is empty and deck is non-empty, its top card enters the charger with counter = cost.
2. **Tick**: all charging counters −1.
3. **Deploy**: any charger at 0 enters the leftmost empty slot; Battlecries resolve (player first). If board is full, the charger waits at 0 and deploys in the next Deploy step with a free slot.
4. **Action (owner test — under evaluation)**: every surviving player unit acts left-to-right, then every surviving enemy unit acts left-to-right, using current board position at each action. The former interleaved order remains available at commit `f5b2fdd`.
5. **Cleanup**: deaths and Deathrattles resolve.
A card revealed on round N with cost 1 deploys on round N+1 and **acts that same round** (bosses "act turn 1" sets the precedent: entering play doesn't cost you your action).

**2. "Damage simultaneous" has two incompatible readings, and the choice doubles combat speed.**
Reading 1: an attack is a *mutual exchange* — attacker and defender both deal ATK when either one attacks. Since each unit also attacks on its own initiative, a mirrored pair trades damage **twice per round**. Reading 2: only the attacker deals damage; "simultaneous" just means paired deaths resolve together. These produce wildly different fight lengths. *Resolution:* adopt Reading 1 (it matches the literal text "both deal ATK to each other") — every attack is a mutual exchange, and Windfury grants two exchanges. Flag for playtest: if fights end too fast, Reading 2 is the fallback. This is the single highest-leverage balance knob in the prototype.

**3. Mid-phase death and shift-left timing.**
"Units shift left" doesn't say when, and shifting mid-phase changes which units face each other. *Resolution:* deaths are checked after every individual action; surviving units shift left **immediately**; each side's sweep is re-evaluated by position index, not by a snapshot taken at phase start. Example: if P1's attack kills E1, enemy units shift, and the unit that was E2 is now in column 1 for the enemy sweep. An enemy killed during the player sweep never acts.

**4. Deathrattle ordering on simultaneous death.**
When an exchange kills both units, DR order matters (Spiteful Imp's DR targeting, Plague Bearer wiping tokens). *Resolution:* in a mutual exchange, resolve the **player's Deathrattles first**, then enemy's; summons from DRs enter the leftmost empty slot *after* the shift-left, and never act in the current action phase.

**5. Charger-manipulation cards vs. an empty charger.**
Tax Collector (+1 turn), Chrono Imp (−1 turn), Doomcaller (destroy), Meddler (bounce to deck top) all target "the enemy/your charger" — undefined if nothing is charging. *Resolution:* all four fizzle with no charger present. Chrono Imp reducing a counter from 1 to 0 deploys the card **immediately** (same Deploy step). Meddler's bounced card goes on top of the enemy deck and will simply re-enter the charger next Reveal — intended, no infinite loop since Meddler is one-shot.

**6. Token placement.**
Brood Wisp, Brood Queen, Gravedigger, and the Fight-2 boss summon tokens with no stated destination. *Resolution:* all tokens enter the **leftmost empty slot**; if the board is full, the summon is lost. Tokens count as units for Gravedigger, Cultist, Cataclysm, and the 20-slot cap.

**7. Draft mechanics unspecified.**
*Resolution:* each draft is two sequential 1-of-3 picks (pick → new set of 3); offers are drawn uniformly from the full 30-card pool **with duplicates allowed** (you can be offered a card already in your deck); starter cards are never removed. Deck grows 8 → 10 → 12.

### B. Keyword interactions the spec doesn't pin down

**8. Windfury vs Divine Shield.** First exchange pops the shield (negates the whole damage instance), second exchange deals damage normally. Poisonous only triggers if damage actually lands — a shielded unit that negates the hit does **not** die to Poisonous.

**9. Poisonous vs simultaneous damage.** In a mutual exchange, Poisonous applies to any unit that took damage from a Poisonous source — so a Poisonous unit and its target can kill each other in one exchange regardless of HP. Damage-to-hero is never Poisonous-relevant. Poisonous triggered by Battlecry/Deathrattle damage (Hex Hurler is not Poisonous, but if a Poisonous unit deals DR damage in future, it applies).

**10. Aura + stat-setting Battlecries (Hexblade, Copycat).** Adopt a **base stat + dynamic aura** model: every unit stores base ATK/HP; auras (Warlord, Overlord, Fight-3 boss) are recalculated continuously on top of base stats whenever board state changes (deaths shift adjacency → auras re-evaluate). Hexblade sets the target's **base** stats to 1/1 (an adjacent Warlord then makes it effectively 2/1). Copycat copies the opposite unit's **current effective** stats as its own new base. Cultist gains the destroyed unit's current effective stats added to its base.

**11. "Highest-ATK enemy" tie (Inquisitor).** Tiebreak: **leftmost** among tied units. (Effective ATK, post-aura.)

**12. Gravedigger counting.** "Per death this combat" = **all unit deaths on both sides** since the fight began, including tokens and including units that died before Gravedigger entered, excluding Gravedigger itself. Yes, this counts the Fight-2 boss's tokens — that's a feature; note it in the draft tooltip so players can draft it as a counter.

### C. Numeric sanity

**13. Fight 1 will run ~18–25 rounds, not 10–14, and 40 HP is the main reason.**
Rough model: the starter deck is 7× cost-1 + 1× cost-2, so from round 2 onward each side deploys ~1 unit/round and both decks are empty by ~round 9–10. With mutual-exchange combat, mirrored pairs annihilate fast (2/2 vs 2/2 both die in one action; 2/2 vs 3/4 leaves a wounded 3/4), so boards clear each other for most of the mid-game and face damage only starts flowing ~round 8–10, at roughly 2–4 HP/round from survivors in empty columns. 40 HP ÷ ~3/round ≈ 12+ rounds of face-bashing on top of the ramp — call it **18–25 rounds total**, and the random shuffle order creates huge variance. *Resolution:* cut hero HP to **30** for v0 (keeps the "HP is carried debt" feel, lands fights near the 10–14 target), and treat HP as the first tuning dial after playtest. Cheap to change; do not rebalance 30 cards around it.

**14. Stalemate is possible and the spec has no clock.**
Deck-out = "nothing happens," and with no fatigue, a fight where both boards and decks empty (very plausible in a symmetric fight 1) **never ends**. This is a hard prototype blocker — a soft-locked run is the worst possible demo outcome. *Resolution:* add an end condition: if both decks are empty and no cards are charging, and a full round passes with no change in total unit count on either side, the fight ends immediately — higher hero HP wins, tie goes to the player. One sentence of rules, one `if` in code, eliminates the soft-lock.

**15. Enemy deck composition is unspecified.**
"Fight 1: vanilla midrange (2/2s, 3/4s)" gives no counts or costs, so the fight is literally unimplementable. *Resolution — bind this:* Fight 1 deck = 5× 2/2 (cost 1) + 3× 3/4 (cost 2), shuffled. Fights 2–3: same shell plus the pre-boarded boss, minus one card (boss occupies board slot, not deck).

### D. Contradictions and wording traps

**16. Fight-3 boss aura says "enemy units enter with +1/+1" — enemy from whose perspective?**
Read literally, the boss buffs the *player's* units. Clearly intended to buff the boss's own side. *Resolution:* rewrite as "friendly units enter with +1/+1." Applies as a one-time base-stat modification on entry (including tokens); the boss itself does not get it (it entered before the aura existed).

**17. "Owner sees own top card identity" vs. the charging model.**
The spec says the owner sees their own *top card* and the opponent's *cost only* — but cards charge one at a time and the top card is the one charging, so in practice both players always know their own charger. This is consistent but easy to misread as "owner sees next-up card too." *Resolution:* owner sees own charging card's identity only (not the card beneath it); opponent sees cost dot + counter; Scout's Battlecry temporarily reveals the enemy charger's identity (until it deploys — no persistent scouting in v0).

**18. Overkill-lost + hero attack condition needs one clarification.**
"Attacks unit directly opposite; if none, attacks enemy hero" — with immediate shift-left, "opposite" is evaluated at the moment of the action, post-shift. Overkill lost applies only to unit damage; it never splashes to the hero. State both explicitly so nobody builds a trample flag.

---

## 2. ART DIRECTION — executable by an AI image generator

### Overall style
Dark-fantasy "infernal war-room": a gritty, painterly-but-flat storybook look — think gouache concept art with heavy silhouettes, rim lighting, and a limited grim palette, as if the whole game is lit by a single brazier. Characters are stylized and slightly exaggerated (big heads on imps, oversized weapons) for readability at small sizes, rendered with visible brush texture but **no** fine detail — every portrait must read clearly at 64px. Backgrounds are near-black with muted violet-brown tones so saturated accents (teal player glow, crimson enemy glow, gold UI) pop. It must NOT look like: anime/cel-shading, photorealism, cutesy cartoon (no chibi, no pastel), high-fantasy brightness (no blue skies, no white marble), or cluttered maximalism — clean silhouettes, one focal point per portrait, generous dark negative space.

### Palette
| Hex | Role |
|---|---|
| `#14101C` | Screen background (near-black violet) |
| `#1E1830` | Panels, card interior fill |
| `#2A2140` | Slot frames, raised surfaces |
| `#EDE6D6` | Primary text (bone) |
| `#9A8FA8` | Dim/secondary text |
| `#46C2CB` | Player accent (teal — hero ring, player HP bar, player slot glow) |
| `#D64550` | Enemy accent (crimson — enemy HP bar, enemy slot glow) |
| `#B08D57` | Cost-1 frame trim (bronze) |
| `#C0C6D4` | Cost-2 frame trim (silver) |
| `#E8B84B` | Cost-3 frame trim (gold) |
| `#FF5A3C` | Damage flash, ATK number |
| `#7BE382` | Heal / buff flash |
| `#FFD966` | Divine Shield bubble, shield icon |
| `#6FCF3F` | Poison tint, Poisonous icon |
| `#E8C468` | Gold UI (buttons, victory banner, draft banner trim) |

### Card layout (portrait, 256×384 master, rendered in-game at 128×192)
- **Cost dot**: 48px circle, top-left corner, overlapping the frame edge; interior is `#14101C` with the cost numeral in `#EDE6D6`; the dot's ring uses the cost-trim color (bronze/silver/gold).
- **Art window**: centered, 200×176, top ~56px, gently arched top.
- **Name banner**: horizontal plaque below art window, 224×36, `#1E1830` fill, cost-trim 2px outline, name centered in bone text.
- **Keyword badges**: up to two 40×40 circular icons stacked on the **right edge** of the art window, half-overlapping the frame.
- **ATK / HP**: 52px circles, bottom-left (ATK, `#FF5A3C` number) and bottom-right (HP, `#EDE6D6` number, circle tinted `#D64550` when damaged).
- **Hidden charging card**: card back (see asset list) at reduced saturation, with the **cost dot pip top-left** and a large **turn counter numeral dead-center** in `#EDE6D6`; enemy chargers show nothing else. Player's own charger renders as the real card at 60% opacity with the counter overlaid center.
- Frames are **one design recolored three ways** — do not generate three structurally different frames.

### Battlefield
Reference resolution 1920×1080. Enemy row of slots across the **top** (y≈180), player row across the **bottom** (y≈700), 5 visible slots per side, each slot a 220×300 rounded-rect in `#2A2140` with a 2px accent-tinted edge (crimson top, teal bottom); off-board slots implied by row-fade at both screen edges plus a chevron scroll button. **Heroes** sit at the far left of each row's side: player hero bottom-left corner (200×200 circular portrait in a teal ring), enemy hero top-left (crimson ring), each with a horizontal HP bar directly adjacent (240×28, accent fill over `#14101C`, white numeral). **Charging slots** sit beside each hero, between hero and slot row: a 160×240 dashed-outline slot. **Boss treatment**: the boss occupies column 1 of the enemy row but renders at 1.35× scale with a distinct jagged gold-black frame, a small crown pip on its HP circle, and a faint crimson ground-glow — unmistakably "this is the boss" without new layout logic.

### Motion language
- **Reveal** (300ms): card back slides from deck position to charger slot with a slight arc, flips on arrival; counter numeral pops in with a 1.15→1.0 scale settle.
- **Charging tick** (250ms): counter pulses (scale 1.0→1.25→1.0) and decrements; a thin ring around the charger slot drains like a clock hand.
- **Deploy** (400ms): card drops from charger into its slot with a 10px overshoot-and-settle, dust-puff flash in accent color; Battlecry (if any) fires as a 300ms projectile/beam to its target before the drop fully settles.
- **Attack lunge** (350ms): attacker slides 60px toward its target (up for player, down for enemy), impact frame = white flash + target shake (±4px, 3 oscillations), then attacker eases back. Windfury = two lunges with a 150ms pause between.
- **Damage flash** (200ms): damaged unit's frame flashes `#FF5A3C`, floating damage numeral rises 40px and fades. Divine Shield pop = `#FFD966` bubble shatter instead of red flash.
- **Death** (400ms): unit desaturates to grey, cracks, collapses downward 20px while fading; Deathrattle effect plays during the fade.
- **Shift-left** (300ms): surviving units glide left into place with slight stagger (40ms apart, nearest first).
- **Hero hit**: hero portrait ring flashes red, screen-edge vignette pulse, HP bar chunk-drains (animated fill, 250ms).

### Asset list
All portraits: painterly flat gouache style, dark `#1E1830` background, strong rim light from upper-left, single character centered, no text, no borders. Frames/UI: flat vector-clean style.

**Card chrome**
| File | Size | Prompt notes |
|---|---|---|
| `card_back.png` | 256×384 | Ornate dark card back, deep violet-black, symmetrical embossed demon-eye motif in bronze, subtle scratch texture, no text |
| `frame_cost1.png` | 256×384 | Portrait card frame only, weathered bronze trim, arched art window filled solid magenta `#FF00FF` for keying, empty banner plaque, two empty corner circles |
| `frame_cost2.png` | 256×384 | Identical frame, trim recolored brushed silver |
| `frame_cost3.png` | 256×384 | Identical frame, trim recolored ornate gold with small gem accents |

**Unit portraits (all 256×256, `portrait_*.png`)**
1. `portrait_dagger_imp.png` — small wiry red imp dual-wielding oversized daggers, grinning
2. `portrait_sellsword.png` — grizzled human mercenary, dented breastplate, resting sword on shoulder
3. `portrait_twinfang.png` — two-headed serpent, fangs bared, coiled strike pose
4. `portrait_brood_wisp.png` — glowing pale-green spectral wisp with tiny eggs visible inside its glow
5. `portrait_hex_hurler.png` — hunched goblin shaman mid-throw of a crackling purple hex bolt
6. `portrait_tax_collector.png` — smug potbellied demon bureaucrat with abacus and coin pouch
7. `portrait_chrono_imp.png` — blue imp with brass clockwork wings and an hourglass
8. `portrait_gate_crasher.png` — burly horned brute charging shoulder-first through a splintering gate
9. `portrait_leeching_tick.png` — grotesque swollen tick creature, bloated red abdomen, dripping mandibles
10. `portrait_squire.png` — eager young page holding a banner too big for him
11. `portrait_spiteful_imp.png` — scrawny grey imp clutching a lit bomb, malicious grin
12. `portrait_scout.png` — hooded figure with a spyglass, crouched, eyes gleaming from shadow
13. `portrait_road_ogre.png` — massive tusked ogre with a wooden club, moss on shoulders
14. `portrait_aegis_knight.png` — knight in pale plate behind a glowing golden tower shield
15. `portrait_venom_hound.png` — lean black hound, dripping green fangs, glowing green eyes
16. `portrait_plague_bearer.png` — robed figure carrying a bubbling cauldron of green miasma, masked
17. `portrait_warlord.png` — scarred orc commander raising a notched axe, war-banner behind
18. `portrait_bulwark.png` — walking wall: a shield with legs and glaring eye-slits
19. `portrait_duelist.png` — elegant masked fencer with rapier, theatrical bow
20. `portrait_hexblade.png` — dark swordsman whose blade warps and shrinks everything near it, violet glow
21. `portrait_gravedigger.png` — hunched shovel-bearing ghoul in a foggy graveyard, lanterns
22. `portrait_meddler.png` — grinning trickster sprite tugging glowing puppet strings
23. `portrait_colossus.png` — towering stone giant, rune-cracked skin, tiny trees at its feet for scale
24. `portrait_inquisitor.png` — severe hooded judge figure with a blazing censer-flail
25. `portrait_brood_queen.png` — massive spider-matriarch, egg sacs glowing, smaller spiders swarming
26. `portrait_doomcaller.png` — gaunt robed figure pointing forward, black void portal opening at its fingertip
27. `portrait_copycat.png` — mirror-skinned humanoid reflecting a distorted warrior, quicksilver surface
28. `portrait_overlord.png` — regal armored demon on a floating throne, commanding gesture
29. `portrait_cultist.png` — wild-eyed cultist with a sacrificial dagger over a dark altar
30. `portrait_cataclysm.png` — tiny hooded figure at the center of a swirling world-ending firestorm

**Bosses & heroes (512×512)**
31. `portrait_boss_hivematron.png` — Fight 2 boss: bloated insectoid matron, birthing sacs pulsing, crimson rim light
32. `portrait_boss_warherald.png` — Fight 3 boss: hulking armored herald with a war-horn and banner that empowers troops, gold-crimson
33. `hero_player.png` — hooded wanderer with a glowing teal deck of cards fanned in hand
34. `hero_enemy_raider.png` — Fight 1: scarred bandit warlord, crude iron armor, crimson rim light
35. `hero_enemy_hivelord.png` — Fight 2: chitin-armored cult leader serving the Hivematron
36. `hero_enemy_dreadlord.png` — Fight 3: black-and-gold armored tyrant, horned helm

**Battlefield & UI**
| File | Size | Prompt notes |
|---|---|---|
| `bg_battlefield.png` | 1920×1080 | Scorched war-camp plain at dusk seen top-down-ish, scorched dueling strip down the middle, braziers flanking, near-black violet sky, heavy vignette, center kept empty and dark for slots |
| `banner_draft.png` | 1024×256 | Ornate horizontal banner plaque, dark wood and gold trim, empty center for "CHOOSE ONE" text |
| `banner_victory.png` | 1024×256 | Same banner, triumphant gold rays variant |
| `btn_primary.png` | 320×96 | Rectangular button, dark violet fill, gold beveled border, subtle inner glow, no text |
| `panel_hp.png` | 480×64 | Horizontal bar frame, dark metal with accent gem sockets at each end, empty fill channel |
| `slot_charger.png` | 160×240 | Dashed-outline ethereal slot frame, faint teal/crimson-neutral rune circle |
| `icon_ds.png` | 64×64 | Divine Shield: golden kite shield with light burst, flat icon |
| `icon_poison.png` | 64×64 | Poisonous: green dripping fang, flat icon |
| `icon_dr.png` | 64×64 | Deathrattle: cracked skull with rising wisp, flat icon |
| `icon_aura.png` | 64×64 | Aura: radiant concentric rings around a gem, flat icon |
| `icon_wf.png` | 64×64 | Windfury: two crossed wind-slashes, flat icon |
| `icon_bc.png` | 64×64 | Battlecry: lightning bolt striking a horn, flat icon |

**Execution notes for the build agent:** generate portraits in batches of 5 with the shared style preamble pasted verbatim into every prompt to keep consistency; reject any portrait with text, borders, or a second focal character; UI chrome and frames should be generated on plain backgrounds and can be recolored/trimmed in CSS if generation drifts. Total: 47 raster assets.
