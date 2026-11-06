# CODEX_HANDOFF

## Project Goal

Establish a deterministic matched-seed starter-parity battery for issue #42 before any starter list or balance changes.

## Current Phase

- Phase: maintenance / balance evidence
- Status: implementation and scoped pickup battery complete; ready to ship as a draft PR

## Latest Completed Work

- Added `tools/starter_parity.mjs` with matched seeds across wide, tall, tempo-curve, Warherald, Hivematron, and Broodmother fixtures.
- Added a deterministic one-draft comparison using a separate seeded offer and a documented pick policy.
- Added focused coverage for starter/scenario completeness, identical seed sets, byte-identical reruns, evidence fields, and invalid seeds.
- Published the 200-seed baseline and findings without changing starter lists, card stats, engine rules, season data, UI, or server code.

## Important Modified Files

- `tools/starter_parity.mjs`
- `test/starter_parity.test.mjs`
- `docs/STARTER_PARITY.md`
- `CODEX_HANDOFF.md`

## Verification

- `node test/starter_parity.test.mjs`: 4/4 passed
- `node tools/starter_parity.mjs 200`: deterministic 7,200-fight matrix completed twice with identical results
- `node test/engine.test.mjs`: 72/72 passed
- `node tools/event_snapshot_check.mjs`: PASS
- `node tools/ui_invariants_check.mjs`: PASS (static harness wiring; no UI files touched)
- `node tools/balance_sim.mjs 1 200`: fight 1 = 100% twice; pre-existing drift proven by 70% at SHA `11542d9` and zero relevant diff from `origin/main`
- `git diff --check`: PASS
- Scope proof: no diff in engine, seasons, UI/CSS, server, or assets

## Known Risks / Untested Areas

- The requested charging fixture is a documented 1/2/3-cost tempo proxy because the owner-evaluation combat spine removed charging slots.
- A no-draft level-20 fixture is an isolation probe, not a real-run forecast; all starters correctly read 0% without the preceding drafts/events.
- This battery measures one deterministic draft policy, not optimal player drafting.

## Next Safest Task

Commit and push `pass/42-starter-parity-battery`, then open the draft PR with the verification and pre-existing tuning note.
