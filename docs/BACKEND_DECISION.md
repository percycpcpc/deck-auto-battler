# Backend hosting decision: Cloudflare Workers + D1

## Status

Accepted for B1. The API will run on Cloudflare Workers and persist relational data in D1. The existing static game site remains on Railway and communicates with the Worker over HTTPS.

## Context

The roadmap defines multiplayer as fully asynchronous: a battle is `simulate(deckA, deckB, seed)`, with no real-time session or continuously connected server. PvE remains client-side. The backend is responsible for durable deck snapshots, Google OAuth sessions, premium entitlement, matchmaking/simulation requests, and replay storage.

The combat contract remains the client engine's `simulate(deckA, deckB, seed)` semantics. A future simulation endpoint must import and invoke that same engine module in a server-compatible runtime rather than fork or reimplement combat rules. B1 does not change the engine.

## Decision

Use Cloudflare Workers for the HTTP API and D1 for relational persistence.

Workers' request-oriented execution model fits a zero-real-time workload: each deck, auth, entitlement, simulation, or replay operation can complete as an independent request. A stateless simulation handler can load two authoritative deck snapshots, validate the request, invoke the shared seeded engine, persist the result, and return a replay reference. There is no need to keep an application process alive between battles.

D1's SQLite data model fits deck snapshots and finite save slots naturally as rows, while also supporting the account and replay relationships needed by later issues. Workers and D1 avoid idle application-server cost. They also keep the API deploy independent from the static game site: Railway continues to host the site and only calls the API.

## Constraint mapping

| Requirement | Worker/D1 design |
| --- | --- |
| Deck storage | Authoritative snapshots in the D1 `decks` table; `save_slots` maps each account slot to a deck ID. |
| Google OAuth | OAuth integration runs in Worker request handlers; future provider/account data and the scaffolded `sessions` table hold server-side login state. Secrets are Wrangler secrets, not committed variables. |
| Entitlement | Account-bound purchase state lives in `entitlements`; later handlers must verify provider state and apply grants idempotently. |
| Matchmaking/sim endpoint | A stateless Worker handler resolves deck IDs, validates ownership/eligibility, and invokes the shared `simulate(deckA, deckB, seed)` engine semantics. |
| Replay store | Inputs and serialized results live in `replays`, keyed by a shareable replay ID. |

## Rejected alternative

An always-on API service on Railway is valid and would offer a conventional long-running Node process. It is not selected because it adds another Railway deploy surface and idle cost without an advantage for this workload: the roadmap requires no real-time connections, resident matchmaking loop, or in-memory session authority. If later requirements introduce sustained connections or long-running coordination that Workers cannot support cleanly, this decision can be revisited with measured evidence.

## Deploy path

1. From `server/`, install the pinned project dependencies with `npm install`.
2. Create the D1 database with `npx wrangler d1 create deck_auto_battler` and replace the marked `database_id` placeholder in `wrangler.toml` with the returned ID.
3. Apply the schema with `npx wrangler d1 migrations apply deck_auto_battler --remote`.
4. Add OAuth and payment credentials with `npx wrangler secret put <NAME>` as those integrations land. Do not commit secrets in `[vars]`.
5. Run `npm test` and `npm run dev` for local validation.
6. Deploy the API with `npm run deploy`, then configure the Railway-hosted static site with the deployed API base URL and the Worker with the site's allowed origin when CORS is implemented.

The B1 health endpoint executes `SELECT 1` through the `DB` binding and reports `db: "up"` or `db: "down"`, providing a deploy-time binding smoke test. A reported `down` keeps the endpoint responsive while making the database wiring failure visible.
