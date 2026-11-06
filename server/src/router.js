import { RUN_CONFIG } from '../../src/engine.js';
import { unionPool } from '../../src/seasons.js';
import { readSession } from './auth/service.js';
import { simulateSoloFight } from './sim.js';

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilePath(pattern) {
  const keys = [];
  const segments = pattern.split('/').map(segment => {
    if (!segment.startsWith(':')) return escapePattern(segment);
    keys.push(segment.slice(1));
    return '([^/]+)';
  });
  return { keys, expression: new RegExp(`^${segments.join('/')}/?$`) };
}

export function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export function error(message, status = 500) {
  return json({ error: message }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new TypeError('invalid JSON body');
  }
}

export function createRouter() {
  const routes = [];

  const soloPattern = compilePath('/api/sim/solo');
  routes.push({ method: 'POST', ...soloPattern, handler: async ({ request, env }) => {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
    const user = match && await readSession(env, match[1]);
    if (!user) return json({ error: 'unauthorized' }, { status: 401 });

    const { deckCardIds, seed, fight } = await readJson(request);
    if (!Array.isArray(deckCardIds) || deckCardIds.some(id => typeof id !== 'string')) {
      return json({ error: 'deckCardIds must be an array of card ids' }, { status: 400 });
    }
    const legalIds = new Set(unionPool().map(card => card.id));
    if (deckCardIds.some(id => !legalIds.has(id))) {
      return json({ error: 'deck contains an unknown card id' }, { status: 400 });
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      return json({ error: 'seed must be a uint32 number' }, { status: 400 });
    }
    if (!Number.isInteger(fight) || fight < 1 || fight > RUN_CONFIG.LEVELS) {
      return json({ error: `fight must be an integer from 1 to ${RUN_CONFIG.LEVELS}` }, { status: 400 });
    }
    return json(simulateSoloFight({ deckCardIds, seed, fight }));
  } });

  return {
    route(method, pattern, handler) {
      routes.push({ method: method.toUpperCase(), handler, ...compilePath(pattern) });
      return this;
    },

    async handle(request, env = {}, context = {}) {
      const pathname = new URL(request.url).pathname;

      for (const route of routes) {
        if (route.method !== request.method.toUpperCase()) continue;
        const match = route.expression.exec(pathname);
        if (!match) continue;

        const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
        try {
          return await route.handler({ request, env, context, params });
        } catch (caught) {
          return error(caught instanceof Error ? caught.message : 'internal error');
        }
      }

      return error('not found', 404);
    },
  };
}
