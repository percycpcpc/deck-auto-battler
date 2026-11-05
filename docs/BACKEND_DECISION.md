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
| Deck API (B3) | `POST /api/decks` and owner-scoped `GET /api/decks[/:id]` are live with Bearer-session validation. |
| Save slots (B4) | `GET /api/slots` and `POST /api/slots/:slot/deck` are live; limits are server-derived from the locked `premium` entitlement SKU (4 slots, otherwise 1). |
| Entitlements (B5) | Account-bound `premium` grants and authenticated entitlement reads are live; server state survives session and cookie loss. |

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

## Auth & session model (B2, mock provider — real Google OAuth deferred by owner 2026-11-05)

B2 deliberately implements the account contract without contacting Google. `POST /api/auth/google` currently selects the mock provider, which resolves a login payload to the normalized `{ provider, providerId, email, name }` identity used by the rest of the backend. A future Google provider must verify a Google ID token server-side and return that same shape; routes, users, sessions, and entitlement consumers must not depend on provider-specific fields. No OAuth redirect, Google client ID, or Google endpoint is part of B2.

Sessions use opaque Web Crypto UUIDs as bearer tokens. Only the token is returned to the client; the server stores its `user_id`, creation time, and an expiry 30 days after issuance. `GET /api/auth/session` joins the token to its user and rejects missing, unknown, malformed, or expired tokens with 401. Tokens are sent as `Authorization: Bearer <token>`.

Guests generate a UUID in local storage and exchange it at `POST /api/auth/guest`. The users row initially has `provider = 'guest'`, `provider_id = guest token`, and the same `guest_token`. On first mock login, the `X-Guest-Token` header identifies that row; the transaction converts it to the provider identity while preserving its user ID and guest token, so later deck/save data keyed to the user survives the link. A guest token already owned by another row is never copied. Login changes identity durability only: entitlement remains a separate account-bound decision.

User and session writes are submitted in one D1 batch so a request cannot leave a user without its session. The client treats every auth request as fail-soft: local PvE remains playable when the API is unavailable.

## Entitlement model (B5)

A user is Premium exactly when `entitlements` contains a row for that `user_id` with `sku = 'premium'`. `grantPremium(env, userId, source)` is the sole entitlement write path: grants are idempotent, preserve the first `purchased_at`, and B6's payment webhook must call it rather than writing the table directly. `GET /api/entitlement` exposes the signed-in user's server-owned entitlement state.

`POST /api/entitlement/dev-grant` is a test-only stand-in guarded by both a Bearer session and `DEV_GRANT_TOKEN`. It fails closed when that variable is unset. **Never set `DEV_GRANT_TOKEN` in production; B6's payment webhook replaces this hook.**

Every checkout route must require a Google-linked Bearer session before doing purchase work, and entitlement binds to that session's `user_id` at checkout. Stripe is the recommended provider for B6, subject to owner veto; B5 adds no Stripe or payment-provider code. Entitlements are durable server-side account state, independent of a particular session or browser cookie, and survive session/cookie loss when the same guest identity is linked back to the same user row.
