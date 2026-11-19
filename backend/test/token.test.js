'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { signToken, verifyToken } = require('../src/utils/token');
const { loadConfig, parseDuration } = require('../src/config');
const { matchPath } = require('../src/http/handler');
const { withArticle } = require('../src/utils/format');

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

test('token: a genuine token is accepted and carries who you are', () => {
  const token = signToken({ sub: 5, role: 'customer' }, SECRET, 3600, NOW);
  assert.equal(token.split('.').length, 3);
  const payload = verifyToken(token, SECRET, NOW + 1000);
  assert.equal(payload.sub, 5);
  assert.equal(payload.role, 'customer');
});

test('token: expired, wrong secret, changed payload and garbage are all refused', () => {
  const token = signToken({ sub: 5, role: 'customer' }, SECRET, 3600, NOW);
  assert.equal(verifyToken(token, SECRET, NOW + 3600 * 1000), null, 'expired exactly at exp');
  assert.equal(verifyToken(token, SECRET, NOW + 7200 * 1000), null, 'expired');
  assert.equal(verifyToken(token, 'another-secret-another-secret-another', NOW), null, 'wrong secret');

  // Try to turn a customer token into an admin token: change the payload but keep the old signature
  const [h, , sig] = token.split('.');
  const evil = Buffer.from(JSON.stringify({ sub: 1, role: 'admin', iat: NOW / 1000, exp: NOW / 1000 + 99999 })).toString('base64url');
  assert.equal(verifyToken(`${h}.${evil}.${sig}`, SECRET, NOW), null, 'changed payload');

  for (const junk of ['', 'abc', 'a.b', 'a.b.c', null, undefined, 12345, 'a.b.c.d']) {
    assert.equal(verifyToken(junk, SECRET, NOW), null, `garbage: ${junk}`);
  }
});

test('token: the "alg none" trick and other algorithms are refused', () => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = { sub: 1, role: 'admin', exp: NOW / 1000 + 3600 };
  assert.equal(verifyToken(`${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`, SECRET, NOW), null);

  // Correctly signed, but claims a different algorithm
  const data = `${b64({ alg: 'HS512', typ: 'JWT' })}.${b64(payload)}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  assert.equal(verifyToken(`${data}.${sig}`, SECRET, NOW), null);
});

test('config: weak or missing secret stops the server, defaults are sensible', () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
  assert.throws(() => loadConfig({ JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ JWT_SECRET: 'change-this-to-a-long-random-text-of-32-or-more-characters' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ JWT_SECRET: SECRET, PAYMENT_MODE: 'free' }), /PAYMENT_MODE/);

  const c = loadConfig({ JWT_SECRET: SECRET });
  assert.equal(c.port, 5000);
  assert.equal(c.db.name, 'druk_serve');
  assert.equal(c.jwtExpiresInSeconds, 86400);
  assert.equal(c.paymentMode, 'sandbox');
  assert.deepEqual(c.corsOrigins, ['http://127.0.0.1:5500', 'http://localhost:5500']);

  const d = loadConfig({ JWT_SECRET: SECRET, PORT: '8080', DB_NAME: 'x', CORS_ORIGINS: 'http://a.bt, http://b.bt', PAYMENT_MODE: 'LIVE' });
  assert.equal(d.port, 8080);
  assert.deepEqual(d.corsOrigins, ['http://a.bt', 'http://b.bt']);
  assert.equal(d.paymentMode, 'live');
});

test('config: durations', () => {
  assert.equal(parseDuration('1d', 1), 86400);
  assert.equal(parseDuration('8h', 1), 28800);
  assert.equal(parseDuration('30m', 1), 1800);
  assert.equal(parseDuration('3600', 1), 3600);
  assert.equal(parseDuration('soon', 7), 7);
});

test('router: path matching with parameters', () => {
  const seg = p => p.split('/').filter(Boolean);
  assert.deepEqual(matchPath(seg('/api/providers/:id'), '/api/providers/7'), { id: '7' });
  assert.deepEqual(matchPath(seg('/api/admin/users/:role/:id/status'), '/api/admin/users/provider/3/status'), { role: 'provider', id: '3' });
  assert.deepEqual(matchPath(seg('/api/providers'), '/api/providers/'), {}, 'trailing slash is fine');
  assert.equal(matchPath(seg('/api/providers/:id'), '/api/providers'), null);
  assert.equal(matchPath(seg('/api/providers/:id'), '/api/providers/7/extra'), null);
  assert.equal(matchPath(seg('/api/health'), '/api/healthz'), null);
  assert.equal(matchPath(seg('/api/providers/:id'), '/api/providers/%E0%A4%A'), null, 'broken % text does not crash');
});

test('notification grammar: a / an', () => {
  assert.equal(withArticle('electrical'), 'an electrical');
  assert.equal(withArticle('plumbing'), 'a plumbing');
  assert.equal(withArticle('appliance repair'), 'an appliance repair');
});
