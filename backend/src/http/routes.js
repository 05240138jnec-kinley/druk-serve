'use strict';
// THE LIST OF ALL API ADDRESSES. Each line says:  method, path, who may use it, and what to run.
//   access: 'public'  = anyone, even without logging in
//           'any'     = any logged-in person
//           ['customer', 'provider', 'admin'] = only these roles (checked on the SERVER for every request)
// The handler receives { db, gateway, actor, params, query, body, now, config } and returns the JSON answer.
// All real work happens in src/controllers. This file only connects an address to a controller.

const auth = require('../controllers/auth');
const profile = require('../controllers/profile');
const passwordReset = require('../controllers/passwordReset');
const googleLogin = require('../controllers/googleLogin');
const categories = require('../controllers/categories');
const providers = require('../controllers/providers');
const bookings = require('../controllers/bookings');
const payments = require('../controllers/payments');
const feedback = require('../controllers/feedback');
const notifications = require('../controllers/notifications');
const admin = require('../controllers/admin');
const { signToken } = require('../utils/token');
const { toInt } = require('../utils/validate');
const { notFound } = require('../utils/errors');

// "/api/providers/abc" or "/api/providers/0" is simply "not found"
function idOf(value) {
  const id = toInt(value);
  if (!(id >= 1)) throw notFound('Not found.');
  return id;
}

const CUSTOMER = ['customer'];
const PROVIDER = ['provider'];
const ADMIN = ['admin'];
const PEOPLE = ['customer', 'provider'];   // roles that have notifications

const ROUTES = [
  /* ---------- system ---------- */
  { method: 'GET', path: '/api/health', access: 'public',
    handler: async ({ db }) => { await db.get('SELECT 1 AS ok'); return { status: 'ok' }; } },

  /* ---------- register and login (frontend js/auth.js) ---------- */
  { method: 'POST', path: '/api/register', access: 'public', status: 201,
    handler: async ({ db, body }) => {
      const created = await auth.register(db, body);
      return { ...created, message: 'Account created. Please log in.' };
    } },
  { method: 'POST', path: '/api/login', access: 'public',
    handler: async ({ db, body, config, now }) => {
      const user = await auth.login(db, body);
      const token = signToken({ sub: user.id, role: user.role }, config.jwtSecret, config.jwtExpiresInSeconds, now.getTime());
      return { token, user };
    } },
  // Sign in with Google (frontend js/auth.js). The Client ID is public (it is in every Google button), so the page can ask for it.
  { method: 'GET', path: '/api/auth-config', access: 'public', handler: ({ config }) => ({ googleClientId: config.googleClientId || null }) },
  { method: 'POST', path: '/api/google-login', access: 'public',
    handler: async ({ db, config, body, now }) => {
      const { user, created } = await googleLogin.googleLogin(db, config, body);
      const token = signToken({ sub: user.id, role: user.role }, config.jwtSecret, config.jwtExpiresInSeconds, now.getTime());
      return { token, user, created };
    } },

  // Forgot password: an email with a one-time link, then the new password (frontend forgot.html, reset-password.html)
  { method: 'POST', path: '/api/forgot-password', access: 'public',
    handler: ({ db, config, body, now }) => passwordReset.forgotPassword(db, config, body, now) },
  { method: 'POST', path: '/api/reset-password', access: 'public',
    handler: ({ db, body, now }) => passwordReset.resetPassword(db, body, now) },
  // The frontend can call this when a page opens to check that the saved login is still valid.
  { method: 'GET', path: '/api/me', access: 'any', handler: async ({ actor }) => ({ user: actor }) },

  /* ---------- categories (frontend app.js, admin.js) ---------- */
  { method: 'GET', path: '/api/categories', access: 'public', handler: ({ db }) => categories.list(db) },

  /* ---------- providers: search and profile (frontend customer.js, public.js) ---------- */
  { method: 'GET', path: '/api/providers', access: 'public', handler: ({ db, query }) => providers.listProviders(db, query) },
  { method: 'GET', path: '/api/providers/:id', access: 'public', handler: ({ db, params }) => providers.getProvider(db, idOf(params.id)) },

  /* ---------- bookings (frontend booking.js, provider.js) ---------- */
  { method: 'GET', path: '/api/bookings', access: 'any', handler: ({ db, actor, query }) => bookings.list(db, actor, query) },
  { method: 'POST', path: '/api/bookings', access: CUSTOMER, status: 201,
    handler: ({ db, actor, body, now }) => bookings.create(db, actor, body, now) },
  { method: 'GET', path: '/api/bookings/:id', access: 'any', handler: ({ db, actor, params }) => bookings.getOne(db, actor, idOf(params.id)) },
  { method: 'PUT', path: '/api/bookings/:id', access: ['customer', 'provider'],
    handler: ({ db, actor, params, body, now }) => bookings.updateStatus(db, actor, idOf(params.id), body.status, now) },

  /* ---------- payments (frontend booking.js payment page) ---------- */
  { method: 'POST', path: '/api/payments', access: CUSTOMER, handler: ({ db, gateway, actor, body, now }) => payments.pay(db, gateway, actor, body, now) },
  { method: 'GET', path: '/api/payments', access: CUSTOMER, handler: ({ db, actor }) => payments.listMine(db, actor) },

  /* ---------- feedback (frontend account.js, provider.js) ---------- */
  { method: 'POST', path: '/api/feedback', access: CUSTOMER, status: 201, handler: ({ db, actor, body, now }) => feedback.create(db, actor, body, now) },
  { method: 'GET', path: '/api/feedback', access: PEOPLE, handler: ({ db, actor }) => feedback.list(db, actor) },
  { method: 'PUT', path: '/api/feedback/:id/reply', access: PROVIDER,
    handler: ({ db, actor, params, body, now }) => feedback.reply(db, actor, idOf(params.id), body, now) },

  /* ---------- my profile and password (frontend account.js) ---------- */
  { method: 'GET', path: '/api/profile', access: 'any', handler: ({ db, actor }) => profile.getProfile(db, actor) },
  { method: 'PUT', path: '/api/profile', access: 'any', handler: ({ db, actor, body }) => profile.updateProfile(db, actor, body) },
  { method: 'PUT', path: '/api/profile/photo', access: ['customer', 'provider'], handler: ({ db, actor, body }) => profile.setPhoto(db, actor, body) },
  { method: 'DELETE', path: '/api/profile/photo', access: ['customer', 'provider'], handler: ({ db, actor }) => profile.removePhoto(db, actor) },
  { method: 'PUT', path: '/api/profile/password', access: 'any',
    handler: async ({ db, actor, body }) => { await profile.changePassword(db, actor, body); return { message: 'Password changed successfully.' }; } },

  /* ---------- notifications (frontend account.js, the red number in the menu) ---------- */
  { method: 'GET', path: '/api/notifications', access: PEOPLE, handler: ({ db, actor, now }) => notifications.list(db, actor, now) },
  { method: 'GET', path: '/api/notifications/unread-count', access: PEOPLE,
    handler: async ({ db, actor }) => ({ count: await notifications.unreadCount(db, actor) }) },
  { method: 'GET', path: '/api/notifications/:id', access: PEOPLE,
    handler: ({ db, actor, params, now }) => notifications.getOne(db, actor, idOf(params.id), now) },
  { method: 'PUT', path: '/api/notifications/read-all', access: PEOPLE,
    handler: async ({ db, actor }) => { await notifications.markAllRead(db, actor); return { ok: true }; } },
  { method: 'PUT', path: '/api/notifications/:id/read', access: PEOPLE,
    handler: async ({ db, actor, params }) => { await notifications.markRead(db, actor, idOf(params.id)); return { ok: true }; } },
  { method: 'DELETE', path: '/api/notifications', access: PEOPLE,
    handler: async ({ db, actor }) => { await notifications.clearAll(db, actor); return { ok: true }; } },

  /* ---------- the provider's own pages (frontend provider.js) ---------- */
  { method: 'GET', path: '/api/provider/me', access: PROVIDER, handler: ({ db, actor }) => providers.getMine(db, actor) },
  { method: 'PUT', path: '/api/provider/services', access: PROVIDER, handler: ({ db, actor, body }) => providers.updateServices(db, actor, body) },
  { method: 'GET', path: '/api/provider/payments', access: PROVIDER, handler: ({ db, actor }) => providers.earnings(db, actor) },
  { method: 'GET', path: '/api/provider/stats', access: PROVIDER, handler: ({ db, actor, now }) => providers.stats(db, actor, now) },

  /* ---------- admin (frontend admin.js) ---------- */
  { method: 'GET', path: '/api/admin/overview', access: ADMIN, handler: ({ db }) => admin.overview(db) },
  { method: 'GET', path: '/api/admin/providers', access: ADMIN, handler: ({ db, query }) => admin.listProviders(db, query) },
  { method: 'PUT', path: '/api/admin/providers/:id/verify', access: ADMIN,
    handler: ({ db, params, body, now }) => admin.setVerified(db, idOf(params.id), body.verified, now) },
  { method: 'GET', path: '/api/admin/users', access: ADMIN, handler: ({ db, query }) => admin.listUsers(db, query) },
  // The role is part of the address because a customer and a provider can have the same id number.
  { method: 'PUT', path: '/api/admin/users/:role/:id/status', access: ADMIN,
    handler: ({ db, params, body }) => admin.setSuspended(db, params.role, idOf(params.id), body.suspended) },
  { method: 'GET', path: '/api/admin/reports', access: ADMIN, handler: ({ db }) => admin.reports(db) },
  { method: 'POST', path: '/api/admin/categories', access: ADMIN, status: 201, handler: ({ db, body }) => categories.create(db, body) },
  { method: 'PUT', path: '/api/admin/categories/:id', access: ADMIN, handler: ({ db, params, body }) => categories.update(db, idOf(params.id), body) },
  { method: 'DELETE', path: '/api/admin/categories/:id', access: ADMIN,
    handler: async ({ db, params }) => { await categories.remove(db, idOf(params.id)); return { ok: true }; } }
];

module.exports = { ROUTES };