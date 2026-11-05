import { getDeckById } from './decks.js';
import { simulateDeckBattle } from './sim.js';

const START_RATING = 1500;
const K_FACTOR = 32;
const MATCH_WINDOW = 200;

const roundHalfAwayFromZero = value => Math.sign(value) * Math.floor(Math.abs(value) + 0.5);

export function eloDelta(ratingA, ratingB, scoreA) {
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return roundHalfAwayFromZero(K_FACTOR * (scoreA - expected));
}

export function getCurrentSeason() {
  return 'season-1'; // D1 replaces this constant when season rotation lands.
}

const ratingRow = async (env, userId, deckId, season) => {
  await env.DB.prepare(
    'INSERT INTO ratings (user_id, deck_id, season, rating, games, wins) VALUES (?, ?, ?, ?, 0, 0) ON CONFLICT(user_id, deck_id, season) DO NOTHING',
  ).bind(userId, deckId, season, START_RATING).run();
  return env.DB.prepare(
    'SELECT rating, games, wins FROM ratings WHERE user_id = ? AND deck_id = ? AND season = ?',
  ).bind(userId, deckId, season).first();
};

const isPremium = async (env, userId) => {
  const entitlement = await env.DB.prepare('SELECT sku FROM entitlements WHERE user_id = ?').bind(userId).first();
  return entitlement?.sku === 'premium';
};

const isSlotted = async (env, userId, deckId) => Boolean(await env.DB.prepare(
  'SELECT 1 AS slotted FROM save_slots WHERE owner_id = ? AND deck_id = ? LIMIT 1',
).bind(userId, deckId).first());

const updateRating = async (env, { userId, deckId, season, before, delta, won }) => {
  await env.DB.prepare(
    'UPDATE ratings SET rating = ?, games = games + 1, wins = wins + ? WHERE user_id = ? AND deck_id = ? AND season = ?',
  ).bind(before + delta, won ? 1 : 0, userId, deckId, season).run();
};

export class RankedError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function queueRanked(env, user, deckId) {
  if (!(await isPremium(env, user.id))) throw new RankedError('ranked requires premium', 403);
  const deck = await getDeckById(env, deckId);
  if (deck.ownerId !== user.id || !(await isSlotted(env, user.id, deck.id))) {
    throw new RankedError('deck must be in one of your save slots', 403);
  }

  const season = getCurrentSeason();
  const mySeasonal = await ratingRow(env, user.id, deck.id, season);
  const myEternal = await ratingRow(env, user.id, deck.id, 'eternal');
  const opponent = await env.DB.prepare(
    'SELECT user_id, deck_id, rating, enqueued_at FROM ranked_queue WHERE user_id != ? AND ABS(rating - ?) <= ? ORDER BY enqueued_at ASC LIMIT 1',
  ).bind(user.id, mySeasonal.rating, MATCH_WINDOW).first();

  if (!opponent) {
    await env.DB.prepare(
      'INSERT INTO ranked_queue (user_id, deck_id, rating, enqueued_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET deck_id = excluded.deck_id, rating = excluded.rating, enqueued_at = excluded.enqueued_at',
    ).bind(user.id, deck.id, mySeasonal.rating, new Date().toISOString()).run();
    return { status: 'queued' };
  }

  const opponentDeck = await getDeckById(env, opponent.deck_id);
  const opponentSeasonal = await ratingRow(env, opponent.user_id, opponentDeck.id, season);
  const opponentEternal = await ratingRow(env, opponent.user_id, opponentDeck.id, 'eternal');
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const simulation = simulateDeckBattle({ cardIdsA: deck.cardIds, cardIdsB: opponentDeck.cardIds, seed });
  const meWon = simulation.winner === 'player';
  const myDelta = eloDelta(mySeasonal.rating, opponentSeasonal.rating, meWon ? 1 : 0);
  const opponentDelta = eloDelta(opponentSeasonal.rating, mySeasonal.rating, meWon ? 0 : 1);
  const myEternalDelta = eloDelta(myEternal.rating, opponentEternal.rating, meWon ? 1 : 0);
  const opponentEternalDelta = eloDelta(opponentEternal.rating, myEternal.rating, meWon ? 0 : 1);
  const replayId = crypto.randomUUID();
  const result = {
    winner: simulation.winner,
    rounds: simulation.rounds,
    ranked: {
      season,
      userA: user.id,
      userB: opponent.user_id,
      deckAId: deck.id,
      deckBId: opponentDeck.id,
      ratingA: mySeasonal.rating,
      ratingB: opponentSeasonal.rating,
      deltaA: myDelta,
      deltaB: opponentDelta,
    },
  };

  await env.DB.prepare('DELETE FROM ranked_queue WHERE user_id IN (?, ?)').bind(user.id, opponent.user_id).run();
  await env.DB.prepare(
    'INSERT INTO replays (id, deck_a, deck_b, seed, result, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(replayId, deck.id, opponentDeck.id, seed, JSON.stringify(result), new Date().toISOString()).run();
  // These are deliberately sequential: each update uses the rating row read above,
  // and ordering keeps the four dependent writes explicit for D1/fake-D1 parity.
  await updateRating(env, { userId: user.id, deckId: deck.id, season, before: mySeasonal.rating, delta: myDelta, won: meWon });
  await updateRating(env, { userId: user.id, deckId: deck.id, season: 'eternal', before: myEternal.rating, delta: myEternalDelta, won: meWon });
  await updateRating(env, { userId: opponent.user_id, deckId: opponentDeck.id, season, before: opponentSeasonal.rating, delta: opponentDelta, won: !meWon });
  await updateRating(env, { userId: opponent.user_id, deckId: opponentDeck.id, season: 'eternal', before: opponentEternal.rating, delta: opponentEternalDelta, won: !meWon });

  return { status: 'matched', replayId, winner: meWon ? 'me' : 'them', myRating: mySeasonal.rating + myDelta, ratingDelta: myDelta, opponentRating: opponentSeasonal.rating };
}

export async function unqueueRanked(env, user) {
  const result = await env.DB.prepare('DELETE FROM ranked_queue WHERE user_id = ?').bind(user.id).run();
  if (!result.meta?.changes) throw new RankedError('not queued', 404);
  return { queued: false };
}

export async function rankedStatus(env, user) {
  const season = getCurrentSeason();
  const queued = await env.DB.prepare('SELECT deck_id FROM ranked_queue WHERE user_id = ?').bind(user.id).first();
  const deckId = queued?.deck_id || (await env.DB.prepare(
    'SELECT deck_id FROM ratings WHERE user_id = ? AND season = ? ORDER BY games DESC LIMIT 1',
  ).bind(user.id, season).first())?.deck_id;
  const empty = { rating: START_RATING, games: 0, wins: 0 };
  const seasonal = deckId ? await ratingRow(env, user.id, deckId, season) : empty;
  const eternal = deckId ? await ratingRow(env, user.id, deckId, 'eternal') : empty;
  const replay = await env.DB.prepare(
    'SELECT replays.* FROM replays JOIN decks a ON a.id = replays.deck_a JOIN decks b ON b.id = replays.deck_b WHERE a.owner_id = ? OR b.owner_id = ? ORDER BY replays.created_at DESC LIMIT 1',
  ).bind(user.id, user.id).first();
  return { queued: Boolean(queued), ratings: { seasonal, eternal }, ...(replay ? { lastMatch: { replayId: replay.id, ...JSON.parse(replay.result) } } : {}) };
}
