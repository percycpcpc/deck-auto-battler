const BADGE_TIERS = Object.freeze([
  Object.freeze({ rating: 1400, id: 'bronze_sigil' }),
  Object.freeze({ rating: 1600, id: 'silver_sigil' }),
  Object.freeze({ rating: 1800, id: 'gold_sigil' }),
]);

export async function grantCosmetic(env, userId, cosmeticId, seasonId) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_cosmetics (user_id, cosmetic_id, season_id, granted_at) VALUES (?, ?, ?, ?)',
  ).bind(userId, cosmeticId, seasonId, new Date().toISOString()).run();
}

export async function ownedCosmetics(env, userId) {
  const { results = [] } = await env.DB.prepare(
    'SELECT cosmetics.id, cosmetics.kind, cosmetics.name, cosmetics.art, user_cosmetics.season_id, cosmetics.earn, user_cosmetics.granted_at FROM user_cosmetics JOIN cosmetics ON cosmetics.id = user_cosmetics.cosmetic_id WHERE user_cosmetics.user_id = ? ORDER BY user_cosmetics.granted_at ASC',
  ).bind(userId).all();
  return results.map(row => ({
    id: row.id, kind: row.kind, name: row.name, art: row.art,
    seasonId: row.season_id, earn: row.earn, grantedAt: row.granted_at,
  }));
}

export async function catalog(env) {
  const { results = [] } = await env.DB.prepare(
    'SELECT id, kind, name, art, season_id, earn FROM cosmetics ORDER BY kind, id',
  ).all();
  return results.map(row => ({
    id: row.id, kind: row.kind, name: row.name, art: row.art,
    seasonId: row.season_id, earn: row.earn,
  }));
}

export async function checkMatchBadges(env, userId, rating, seasonId) {
  for (const tier of BADGE_TIERS) {
    if (rating >= tier.rating) await grantCosmetic(env, userId, tier.id, seasonId);
  }
}

export async function checkRunTrophy(env, userId, won, levelReached, seasonId) {
  if (won && levelReached >= 20) await grantCosmetic(env, userId, `${seasonId}_trophy`, seasonId);
}
