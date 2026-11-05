import { getDeck, parseDeck } from './decks.js';

export class SlotError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function slotLimitFor(env, user) {
  const entitlement = await env.DB.prepare('SELECT sku FROM entitlements WHERE user_id = ?')
    .bind(user.id).first();
  return entitlement?.sku === 'premium' ? 4 : 1;
}

export async function listSlots(env, user) {
  const limit = await slotLimitFor(env, user);
  const { results = [] } = await env.DB.prepare(
    'SELECT save_slots.slot, save_slots.updated_at, decks.* FROM save_slots JOIN decks ON decks.id = save_slots.deck_id WHERE save_slots.owner_id = ? ORDER BY save_slots.slot ASC, save_slots.updated_at DESC',
  ).bind(user.id).all();
  const slots = Array(limit).fill(null);
  for (const row of results) {
    if (Number.isInteger(row.slot) && row.slot >= 0 && row.slot < limit && slots[row.slot] === null) {
      slots[row.slot] = { slot: row.slot, deck: parseDeck(row) };
    }
  }
  return { limit, slots };
}

export async function saveDeckToSlot(env, user, slot, deckId) {
  const limit = await slotLimitFor(env, user);
  if (!Number.isInteger(slot) || slot < 0 || slot >= limit) {
    throw new SlotError('slot out of range for your tier', 403);
  }
  const deck = await getDeck(env, user, deckId);
  const updatedAt = new Date().toISOString();
  // Overwrites are unconditional once authorized. The client owns the explicit
  // confirmation gate, including replacement of the free tier's single slot.
  await env.DB.prepare(
    'INSERT INTO save_slots (owner_id, slot, deck_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, slot) DO UPDATE SET deck_id = excluded.deck_id, updated_at = excluded.updated_at',
  ).bind(user.id, slot, deck.id, updatedAt).run();
  return { slot, deck, updatedAt };
}
