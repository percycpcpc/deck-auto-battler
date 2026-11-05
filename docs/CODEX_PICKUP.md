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

## 4. Owner experiments

If a pass changes ratified behavior, mark the doc section "under owner
evaluation" in the same commit and report the revert commit if the
owner rejects it.
