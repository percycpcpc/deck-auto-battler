const PREMIUM_SKU = 'premium';

// PURCHASE ROUTE CONTRACT (B5): every current or future checkout/payment
// route must resolve a Bearer session before doing any purchase work. Guest
// checkout is forbidden; the entitlement is bound to that session's user_id
// at checkout. B6's payment webhook must call grantPremium rather than write
// to entitlements directly.

export async function grantPremium(env, userId, source = 'manual') {
  const purchasedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO entitlements (user_id, sku, purchased_at) VALUES (?, 'premium', ?) ON CONFLICT(user_id) DO UPDATE SET sku = 'premium', purchased_at = COALESCE(entitlements.purchased_at, excluded.purchased_at)",
  ).bind(userId, purchasedAt).run();

  // Source is intentionally not persisted by the B1 schema. Keeping it in
  // this API makes the single write path ready for B6 webhook attribution.
  void source;
  return env.DB.prepare('SELECT user_id, sku, purchased_at FROM entitlements WHERE user_id = ?')
    .bind(userId).first();
}

export async function getEntitlements(env, userId) {
  const { results = [] } = await env.DB.prepare(
    'SELECT sku, purchased_at FROM entitlements WHERE user_id = ?',
  ).bind(userId).all();
  return results;
}

export const isPremium = rows => rows.some(row => row.sku === PREMIUM_SKU);
