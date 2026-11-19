'use strict';
// Handles ONE API request, in this order:
//   1. find the matching route          (unknown address -> 404, wrong method -> 405)
//   2. check the login token            (missing / expired / changed -> 401)
//   3. check the account is still active (deleted or suspended -> 401, so a suspension works at once)
//   4. check the role                   (wrong role -> 403)
//   5. run the controller               (errors become { error, fields } with the right status)
// It knows nothing about Express: it takes a plain request object and returns { status, body }.
// That is why the whole API can be tested without starting a server (test/http.test.js).

const { ROUTES } = require('./routes');
const { verifyToken } = require('../utils/token');
const { loadAccount, toSessionUser } = require('../controllers/auth');
const { AppError, unauthorized, forbidden } = require('../utils/errors');

// "/api/providers/:id"  ->  a matcher that also gives back { id: "5" }
function compile(route) {
  return { ...route, segments: route.path.split('/').filter(Boolean) };
}

function matchPath(segments, path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith(':')) {
      try { params[segments[i].slice(1)] = decodeURIComponent(parts[i]); } catch (e) { return null; }
    } else if (segments[i] !== parts[i]) return null;
  }
  return params;
}

function createHandler({ db, gateway, config, routes = ROUTES, clock = () => new Date(), log = console.error }) {
  const compiled = routes.map(compile);

  async function findActor(req, now) {
    const header = String((req.headers && req.headers.authorization) || '');
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    if (!m) throw unauthorized('Please log in first.');
    const payload = verifyToken(m[1], config.jwtSecret, now.getTime());
    if (!payload) throw unauthorized('Your login has expired. Please log in again.');
    const row = await loadAccount(db, payload.role, payload.sub);
    if (!row) throw unauthorized('Your account is not available. Please log in again.');
    return toSessionUser(payload.role, row);
  }

  return async function handle(req) {
    let route = null;
    try {
      const method = String(req.method || 'GET').toUpperCase();
      const path = String(req.path || '/');

      let params = null;
      let pathMatched = false;
      for (const r of compiled) {
        const p = matchPath(r.segments, path);
        if (!p) continue;
        pathMatched = true;
        if (r.method === method) { route = r; params = p; break; }
      }
      if (!route) {
        if (pathMatched) throw new AppError(405, 'This address does not accept that method.');
        throw new AppError(404, 'Not found.');
      }

      const now = clock();
      let actor = null;
      if (route.access !== 'public') {
        actor = await findActor(req, now);
        if (route.access !== 'any' && !route.access.includes(actor.role)) throw forbidden();
      }

      // The body is always a plain object, so controllers can read body.something safely.
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const query = req.query && typeof req.query === 'object' ? req.query : {};

      const result = await route.handler({ db, gateway, config, actor, params, query, body, now });
      return { status: route.status || 200, body: result === undefined ? { ok: true } : result, route: `${route.method} ${route.path}` };
    } catch (e) {
      if (e instanceof AppError) {
        const body = { error: e.message };
        if (e.fields) body.fields = e.fields;
        return { status: e.status, body, route: route ? `${route.method} ${route.path}` : null };
      }
      log('Unexpected error:', e);
      return { status: 500, body: { error: 'Something went wrong on the server. Please try again.' }, route: null };
    }
  };
}

module.exports = { createHandler, matchPath };
