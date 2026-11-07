# Codex Issue Pickup Protocol

How work moves through the launch-plan board
(https://github.com/users/percycpcpc/projects/2). One pass at a time;
the orchestrator (Hermes) dispatches, verifies, and ships — Codex never
commits and never moves board items.

## 0. Claim

1. Pick the highest-priority item in **Todo** with label `codex-ready`.
   Phase order: M → A → B → C → D (M1 first; within a phase, lowest
   issue number first). Respect dependencies listed in the issue body
   (e.g. C1 requires A1) — never start a blocked item.
   **Bounce-and-continue (owner-ratified 2026-11-07):** if the top
   candidate is blocked — unresolved dependency, Definition of Ready
   not met, or an apparent contradiction in the ticket — comment the
   evidence on the issue, return the item to Todo, and continue to the
   next candidate. Maximum 3 evaluations per turn; implement the first
   actionable item found (stop after one implementation). A stop
   because every candidate bounced must list all bounces in the final
   report. **Owner rulings pinned in issue comments supersede the
   ticket body** — check comments before judging a ticket
   contradictory.
2. Move the item to **In Progress** on the board.
3. Confirm no other pass is in flight with an overlapping write scope
   (`git status --short`; if a pass touches the same files, fold both
   into one combined brief — see hermes-codex-cli parallel-dispatch
   pitfall).

## 1. Brief

Write `.hermes/tmp/<issue>-<slug>-brief.md`:
- Verbatim issue title + body.
- Binding docs list, in this order: `SPEC.md`, `RULINGS.md` (wins on
  ambiguity), `ROADMAP.md` (product context), then
  `ART_DIRECTION.md` / `UI_ARCHITECTURE.md` / `FIGHT_UI_DESIGN.md` for
  anything touching pixels or DOM.
- Exact scope, hard invariants, verification battery, screenshot
  matrix demand (`refs/ui-audit/<feature>/`), and "no git commit".

## 2. Dispatch & verify

Follow the deck-auto-battler pass loop (skill `deck-auto-battler`):
dispatch via Codex CLI, then verify INDEPENDENTLY — engine tests,
event_snapshot, balance_sim (bisect drift before blocking),
ui_invariants + real-browser harness, engine-diff scope check. Never
trust the run's self-report.

## 3. Ship

Orchestrator commits (builder logs excluded, foreign-file scan), pushes
when the pass is a coherent unit, and moves the board item to **Done**
with the commit SHA in a closing comment. Board Status=Done means
shipped — keep Done items linked to their commit as the audit trail.

### Autonomous pickup mode (owner-ratified 2026-11-07)

When no orchestrator is in the loop (hourly pickup worker), each pass
lands on main directly — no draft-PR queue, no owner review pileup:

1. Commit on `pass/<issue>-<slug>`, then `git fetch origin` and rebase
   onto `origin/main` — never a stale base. Rebase conflicts resolve
   per the precedence rules in the delegated-dev-pipeline skill.
2. Re-run the full verification battery ON THE REBASED STATE. A
   battery that was green before the rebase proves nothing after it.
3. Green only: push to `main` (token-embedded URL — GCM is broken on
   the worker machine; never print credentials), comment the issue
   with the landed commit SHA, and move the board item to **Done**.
4. Red: main is never touched. Comment the failure evidence on the
   issue, move the item back to **Todo**, and pick the next ticket.
   Three consecutive red passes halt the worker with a full report.
5. The pass branch is deleted after landing; main history is the audit
   trail. Draft PRs are not opened in this mode.

## 4. Owner experiments

If a pass changes ratified behavior, mark the doc section "under owner
evaluation" in the same commit and report the revert commit if the
owner rejects it.

## 6. Launch-run addenda (2026-11-05)

Confirmed working conventions from the full A5→D3 run:

- **Owner overrides outrank briefs.** Example: real Google OAuth deferred →
  B2 shipped a mock auth provider behind a swappable interface; the
  deferral is recorded in the issue comment and ship report.
- **Engine freeze has exactly one exception:** D1's season wiring
  (starters/pool/keyword sourced from `src/seasons.js`, data-only
  config). All card/starter/balance data lives in `src/seasons.js`;
  flipping a season is a config edit, never engine code.
- **Verification batteries that caught real bugs:** balance_sim band
  65–78%, `event_snapshot_check.mjs`, `ui_invariants_check.mjs`
  (dur() discipline), server suite totals (48/48 at launch), and a
  real-browser Playwright matrix per ticket under `refs/ui-audit/<feature>/`.
- **Server suites at launch:** router 9, auth 5, decks 4, slots 5,
  entitlements 5, payments 4, sim 4, ranked 4, friendly 4,
  cosmetics 4. Engine 58, seasons 6, speed gating 3.
- **Auth contract:** mock Google provider + guest tokens (B2);
  `GET /api/entitlement` (B5) is the sole authority for premium
  unlocks — client never trusts localStorage for entitlement (D3
  test-asserted).
- **Locked decisions:** Workers+D1 hosting; ELO K32, seasonal +
  eternal ratings, deck-MMR (no piloting); replays full-information
  (RULINGS.md); ranked premium-gated, friendlies free; speeds 1/2/3/10
  with 3/10 premium.
