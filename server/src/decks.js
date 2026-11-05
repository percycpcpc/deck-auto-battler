import { CARD_POOL, STARTERS } from '../../src/engine.js';
import { chunkedInsert } from './db.js';

const CARD_ID = /^[a-z_]+$/;
const cardIds = new Set(CARD_POOL.map(card => card.id));
const starterIds = new Set(STARTERS.map(starter => starter.id));

export class DeckError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const parseDeck = row => ({
  id: row.id,
  ownerId: row.owner_id,
  cardIds: JSON.parse(row.card_ids),
  starterId: row.starter_id,
  won: Boolean(row.won),
  levelReached: row.level_reached,
  hpLeft: row.hp_left,
  createdAt: row.created_at,
});

function validateSnapshot({ cardIds: ids, starterId, won, levelReached, hpLeft }) {
  if (!Array.isArray(ids) || ids.length < 8 || ids.length > 40) {
    throw new DeckError('cardIds must contain between 8 and 40 cards');
  }
  if (ids.some(id => typeof id !== 'string' || !CARD_ID.test(id) || !cardIds.has(id))) {
    throw new DeckError('cardIds contains an unknown card');
  }
  if (typeof starterId !== 'string' || !starterIds.has(starterId)) {
    throw new DeckError('starterId is invalid');
  }
  if (typeof won !== 'boolean') throw new DeckError('won must be a boolean');
  if (!Number.isInteger(levelReached) || levelReached < 1) throw new DeckError('levelReached must be a positive integer');
  if (!Number.isInteger(hpLeft)) throw new DeckError('hpLeft must be an integer');
}

export async function createDeck(env, { user, cardIds: ids, starterId, won, levelReached, hpLeft }) {
  validateSnapshot({ cardIds: ids, starterId, won, levelReached, hpLeft });
  const row = {
    id: crypto.randomUUID(),
    owner_id: user.id,
    card_ids: JSON.stringify(ids),
    starter_id: starterId,
    won: won ? 1 : 0,
    level_reached: levelReached,
    hp_left: hpLeft,
    created_at: new Date().toISOString(),
  };
  await chunkedInsert(env.DB, {
    table: 'decks',
    columns: ['id', 'owner_id', 'card_ids', 'starter_id', 'won', 'level_reached', 'hp_left', 'created_at'],
    rows: [row],
  });
  return parseDeck(row);
}

export async function listDecks(env, user) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM decks WHERE owner_id = ? ORDER BY created_at DESC')
    .bind(user.id).all();
  return results.map(parseDeck);
}

export async function getDeck(env, user, id) {
  const deck = await getDeckById(env, id);
  if (deck.ownerId !== user.id) throw new DeckError('forbidden', 403);
  return deck;
}

export async function getDeckById(env, id) {
  const row = await env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first();
  if (!row) throw new DeckError('deck not found', 404);
  return parseDeck(row);
}
