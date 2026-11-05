import { atomicBatch } from '../db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_DAYS = 30;

export const validToken = value => typeof value === 'string' && UUID.test(value);

const publicUser = row => ({
  id: row.id,
  provider: row.provider,
  providerId: row.provider_id,
  email: row.email ?? null,
  name: row.name ?? null,
  avatarColor: row.avatar_color ?? null,
});

export async function createLogin(env, identity, guestToken = null, now = new Date()) {
  const db = env.DB;
  const existing = await db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .bind(identity.provider, identity.providerId).first();
  let linkedGuest = null;
  if (!existing && validToken(guestToken)) {
    linkedGuest = await db.prepare('SELECT * FROM users WHERE guest_token = ?').bind(guestToken).first();
  }
  const id = existing?.id || linkedGuest?.id || crypto.randomUUID();
  const createdAt = existing?.created_at || linkedGuest?.created_at || now.toISOString();
  const avatarColor = existing?.avatar_color || linkedGuest?.avatar_color || '#46c2cb';
  const row = {
    id,
    provider: identity.provider,
    provider_id: identity.providerId,
    email: identity.email ?? null,
    name: identity.name ?? null,
    avatar_color: avatarColor,
    guest_token: existing?.guest_token || linkedGuest?.guest_token || (validToken(guestToken) ? guestToken : null),
    created_at: createdAt,
  };
  const token = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString();
  const statements = [];
  if (!existing) {
    if (linkedGuest) {
      statements.push(db.prepare('UPDATE users SET provider = ?, provider_id = ?, email = ?, name = ?, avatar_color = ? WHERE id = ?')
        .bind(row.provider, row.provider_id, row.email, row.name, row.avatar_color, row.id));
    } else {
      statements.push(db.prepare('INSERT INTO users (id, provider, provider_id, email, name, avatar_color, guest_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.id, row.provider, row.provider_id, row.email, row.name, row.avatar_color, row.guest_token, row.created_at));
    }
  }
  statements.push(db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, row.id, now.toISOString(), expiresAt));
  await atomicBatch(db, statements);
  return { token, user: publicUser(row) };
}

export async function createGuestLogin(env, guestToken, now = new Date()) {
  if (!validToken(guestToken)) throw new TypeError('invalid guest token');
  const linked = await env.DB.prepare('SELECT * FROM users WHERE guest_token = ?').bind(guestToken).first();
  if (linked) {
    return createLogin(env, {
      provider: linked.provider,
      providerId: linked.provider_id,
      email: linked.email,
      name: linked.name,
    }, guestToken, now);
  }
  const identity = { provider: 'guest', providerId: guestToken, email: null, name: 'Guest Warrior' };
  return createLogin(env, identity, guestToken, now);
}

export async function readSession(env, token, now = new Date()) {
  if (!validToken(token)) return null;
  const row = await env.DB.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?')
    .bind(token, now.toISOString()).first();
  return row ? publicUser(row) : null;
}
