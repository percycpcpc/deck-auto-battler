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
