import { DeckError, getDeckById } from './decks.js';
import { simulateDeckBattle } from './sim.js';

export class FriendlyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function friendlyDeck(env, id, label) {
  try {
    return await getDeckById(env, id);
  } catch (caught) {
    if (caught instanceof DeckError && caught.status === 404) {
      throw new FriendlyError(`${label} deck not found`, 404);
    }
    throw caught;
  }
}

export async function createFriendly(env, user, { myDeckId, theirDeckId }) {
  const myDeck = await friendlyDeck(env, myDeckId, 'my');
  const theirDeck = myDeckId === theirDeckId
    ? myDeck
    : await friendlyDeck(env, theirDeckId, 'opponent');
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const simulation = simulateDeckBattle({
    cardIdsA: myDeck.cardIds,
    cardIdsB: theirDeck.cardIds,
    seed,
  });
  const replayId = crypto.randomUUID();
  const result = {
    winner: simulation.winner,
    rounds: simulation.rounds,
    kind: 'friendly',
    host: user.id,
    opponentDeck: theirDeck.id,
  };

  await env.DB.prepare(
    'INSERT INTO replays (id, deck_a, deck_b, seed, result, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    replayId,
    myDeck.id,
    theirDeck.id,
    seed,
    JSON.stringify(result),
    new Date().toISOString(),
  ).run();

  return {
    replayId,
    url: `/?replay=${replayId}`,
    winner: simulation.winner,
    rounds: simulation.rounds,
  };
}
