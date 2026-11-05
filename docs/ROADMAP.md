# ROADMAP — Runs, Async PvP, Monetization (owner-approved 2026-11-05)

Product plan layered on top of v0 SPEC. Where this doc and `SPEC.md`
conflict, treat SPEC as the v0 combat contract and this doc as the
target architecture; every item below lands as its own scoped pass.
`RULINGS.md` still wins on ambiguity.

## 1. Product model

### Free tier (guest, no registration)
- PvE roguelite run: ~20 escalating levels, level 20 boss. Lose at any
  level = run ends. HP resets every level; difficulty comes from enemy
  scripts, not attrition.
- **One deck, always the latest.** Starting a new run destroys the
  previous deck snapshot. Friendlies allowed; ranked locked.
- Saves live in a cookie / localStorage (guest token); decks are stored
  server-side, keyed to the token.

### Premium (one-time purchase, ~US$4.99)
- **Google login is a hard precondition for purchase.** Entitlement
  binds to `user_id` at checkout; no guest checkout, no purchase
  recovery problem.
- 4 save slots (finite; expandable later à la carte). Saved decks are
  permanent, reusable, and **grandfathered forever** — season rotation
  never kills a paid deck.
- x3–x10 battle speed (gated on the `dur()` speed helper).
- Ranked ladder access — only decks in save slots can queue ranked.
- Login changes durability, not entitlement: linked free players still
  have 1 slot, just cloud-synced and multi-device.

### Deck lifecycle
- Deck snapshot taken at run end (win or lose). Paid players choose the
  slot; free players' snapshot is the only deck.
- A6 emits the ordered client-side run-end snapshot for the latest guest deck.
- Season 4-week cadence, soft rotation: new starter deck(s) + 6–10 new
  draft cards. Nothing removed until pool ≈60, then evaluate a
  Standard/Open split.
- Beat level 20: deck saves + seasonal cosmetic banner/icon trophy.

## 2. Run structure (scales v0's 3 fights → 20 levels)

- Draft 1-of-3 every gap (tier weights 50/35/15 as v0), **1 redraw
  charge per draft, charges do not stack**, skip allowed.
- Every 3rd gap, the draft is **replaced** by a special event,
  alternating: **Remove** (player picks any card) → **Transform**
  (remove one card, add a random card of the **same tier**).
- Starter deck selectable per season (swap `STARTER_IDS`; pipeline
  already supports it). No persistent card collection day one.
- Level 20 = boss fight using existing pre-boarded boss mechanics.
- Post-alpha deferred: deck ordering at save-time (async-safe, saved
  with the deck), player-choice event screen, hard rotation.

## 3. Multiplayer — fully async, server-simulated

- No real-time anywhere. A battle is `simulate(deckA, deckB, seed)`.
- **Ranked (Premium):** submit deck ID → server finds opponent by
  rating → seeded deterministic sim → result + rating update. Rating =
  deckbuilding quality (no piloting — accepted, TFT-style). Seasonal
  resets; legacy decks carry a separate eternal rating.
- **Friendlies (free):** generate a battle/replay link between two
  decks; watchable by anyone with the link. No codes, no export.
- Replay = full information (replay links reveal both decks). Live
  scouting rules (`UI_ARCHITECTURE.md`) apply only to in-run fights.
- Rewards: rating, seasonal leaderboard, profile icons/banners.
  Cosmetic shop with Bazar-style rotations; seasonal skins later.
  No power rewards; no currency faucet at launch.

## 4. Tech notes

- ✅ B3 landed — Server-authoritative deck snapshots: POST snapshot at run end → deck
  ID; queueing sends ID; server validates ownership. PvE runs stay
  client-side (trust-on-first-use is acceptable — cheaters only forge
  decks that PvP then filters by skill).
- **Required engine change: seeded player shuffle** — currently the
  only unseeded RNG; replays demand `{deckA, deckB, seed}` reproduce
  exactly. Enemy order is already fixed/public.
- Combat legibility invariant: cards' AI policy must be simple and
  predictable enough that players can mentally simulate their own deck.
- Backend needed: deck storage, auth (Google OAuth), entitlement,
  matchmaking/sim endpoint, replay store. Static-site-only era is over.
- B2: mock auth layer live, real Google provider deferred.
- B4: entitlement-driven finite save slots are live.
- B5: entitlements live.
- Payment provider: TBD (issue # below).

## 5. Issue board

Scoped passes live as GitHub issues with the `codex-ready` label; the
Codex pickup protocol picks them one at a time. Phases:

- **A. Engine:** seeded RNG · 20-level run config + draft cadence +
  special events · draft skip/redraw · starter selection · run-end
  snapshot · level-20 boss + trophy
- **B. Backend:** hosting decision (Workers+D1 vs Railway service) ·
  auth · deck API · save slots · entitlement · payment provider
- **C. PvP:** sim endpoint · ranked queue + rating · replay links ·
  friendly links
- **D. Live ops:** season system · cosmetics + shop · speed gating
