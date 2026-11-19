'use strict';
// Tests the WHOLE API the way the frontend uses it: address + token + JSON in, status + JSON out.
// It goes through src/http/handler.js (routes, login token, roles) down to the real SQL on SQLite.
// At the end it checks that EVERY address in src/http/routes.js was used at least once.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSqliteDb, available } = require('./helpers/sqliteDb');
const { seedDemo } = require('../src/seed/demoData');
const { sandboxGateway } = require('../src/payments/gateway');
const { createHandler } = require('../src/http/handler');
const { ROUTES } = require('../src/http/routes');
const dates = require('../src/utils/dates');

const config = { jwtSecret: 'a-test-secret-that-is-long-enough-for-hs256', jwtExpiresInSeconds: 3600 };

function futureDate(weekdayWanted, minDaysAhead = 2) {
  const [y, m, d] = dates.todayISO().split('-').map(Number);
  for (let i = minDaysAhead; i < minDaysAhead + 14; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    if (dt.getUTCDay() === weekdayWanted) return dt.toISOString().slice(0, 10);
  }
}

test('Druk Serve HTTP API', { skip: !available && 'node:sqlite needs Node 22.5 or newer' }, async t => {
  const db = createSqliteDb();
  await seedDemo(db);
  t.after(() => db.close());

  let clockMs = Date.now();
  const handle = createHandler({ db, gateway: sandboxGateway, config, clock: () => new Date(clockMs), log: () => {} });
  const used = new Set();

  // Like fetch(): returns { status, body }
  async function call(method, path, { token, body, query } = {}) {
    const res = await handle({ method, path, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (res.route) used.add(res.route);
    return res;
  }
  async function login(email, password, role) {
    const res = await call('POST', '/api/login', { body: { email, password, role } });
    assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.body)}`);
    return res.body;   // { token, user }
  }
  const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.body)); return res.body; };

  const admin = await login('admin@drukserve.bt', 'Admin@123', 'admin');
  const pema = await login('customer@drukserve.bt', 'Customer@123', 'customer');
  const sonam = await login('provider@drukserve.bt', 'Provider@123', 'provider');

  await t.test('system: health, unknown address, wrong method, bad id', async () => {
    assert.deepEqual(ok(await call('GET', '/api/health')), { status: 'ok' });
    assert.equal((await call('GET', '/api/nothing-here')).status, 404);
    assert.equal((await call('DELETE', '/api/health')).status, 405);
    assert.equal((await call('GET', '/api/providers/abc')).status, 404);
    assert.equal((await call('GET', '/api/providers/0')).status, 404);
    assert.equal((await call('GET', '/api/providers/9999')).status, 404);
  });

  await t.test('login answers: token + user, one general error, no clues about which emails exist', async () => {
    assert.equal(pema.user.role, 'customer');
    assert.equal(pema.user.email, 'customer@drukserve.bt');
    assert.equal(sonam.user.providerId, sonam.user.id);
    assert.equal(pema.user.password, undefined, 'never send a password or hash');
    assert.equal(pema.user.password_hash, undefined);

    const wrongPw = await call('POST', '/api/login', { body: { email: 'customer@drukserve.bt', password: 'Wrong@123', role: 'customer' } });
    const noUser = await call('POST', '/api/login', { body: { email: 'nobody@drukserve.bt', password: 'Wrong@123', role: 'customer' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.body.error, noUser.body.error);

    // right password but wrong role: the message names the real role (safe, the person proved who they are)
    const wrongRole = await call('POST', '/api/login', { body: { email: 'customer@drukserve.bt', password: 'Customer@123', role: 'provider' } });
    assert.equal(wrongRole.status, 403);
    assert.match(wrongRole.body.error, /registered as a customer/);

    assert.equal((await call('POST', '/api/login', { body: {} })).status, 400);
    assert.equal((await call('POST', '/api/login', { body: ['x'] })).status, 400, 'a JSON list is not a valid body');
  });

  await t.test('tokens: needed, checked, and /api/me', async () => {
    assert.equal((await call('GET', '/api/me')).status, 401);
    assert.equal((await call('GET', '/api/me', { token: 'garbage' })).status, 401);
    const me = ok(await call('GET', '/api/me', { token: pema.token }));
    assert.equal(me.user.id, pema.user.id);

    // a token whose payload was changed to say "admin" is refused
    const [h, , s] = pema.token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 1, role: 'admin', exp: 99999999999 })).toString('base64url');
    assert.equal((await call('GET', '/api/admin/overview', { token: `${h}.${evil}.${s}` })).status, 401);

    // the same token one day later is expired
    clockMs += 2 * 3600 * 1000;
    assert.equal((await call('GET', '/api/me', { token: pema.token })).status, 401);
    clockMs = Date.now();
    assert.equal((await call('GET', '/api/me', { token: pema.token })).status, 200);
  });

  await t.test('roles are checked on the server for every address', async () => {
    assert.equal((await call('GET', '/api/admin/overview', { token: pema.token })).status, 403);
    assert.equal((await call('GET', '/api/admin/reports', { token: sonam.token })).status, 403);
    assert.equal((await call('GET', '/api/admin/overview')).status, 401);
    assert.equal((await call('POST', '/api/bookings', { token: sonam.token, body: {} })).status, 403, 'providers cannot book');
    assert.equal((await call('POST', '/api/feedback', { token: sonam.token, body: {} })).status, 403);
    assert.equal((await call('PUT', '/api/provider/services', { token: pema.token, body: {} })).status, 403);
    assert.equal((await call('GET', '/api/provider/stats', { token: pema.token })).status, 403);
    assert.equal((await call('GET', '/api/notifications', { token: admin.token })).status, 403, 'admin has no notifications');
    assert.equal((await call('PUT', '/api/bookings/1', { token: admin.token, body: { status: 'Cancelled' } })).status, 403);
    assert.equal((await call('POST', '/api/admin/categories', { token: pema.token, body: { name: 'Hack', desc: 'x' } })).status, 403);
  });

  await t.test('register: errors per field, then a real account', async () => {
    const bad = await call('POST', '/api/register', { body: { role: 'customer', name: 'A', email: 'x', phone: '1', password: 'abc' } });
    assert.equal(bad.status, 400);
    for (const f of ['name', 'email', 'phone', 'password', 'address']) assert.ok(bad.body.fields[f], `field ${f}`);

    const created = ok(await call('POST', '/api/register', {
      body: { role: 'customer', name: 'Kinley Tshering', email: 'Kinley@Example.bt', phone: '17123456', location: 'Paro', address: 'Main Street, Paro', password: 'Test@1234' }
    }), 201);
    assert.equal(created.role, 'customer');

    const dup = await call('POST', '/api/register', {
      body: { role: 'customer', name: 'Kinley Again', email: 'kinley@example.bt', phone: '17123456', address: 'Main Street, Paro', password: 'Test@1234' } });
    assert.equal(dup.status, 409, 'same email in a different letter case is the same email');
    assert.ok(dup.body.fields.email);
  });

  await t.test('public: categories, providers search, provider profile', async () => {
    assert.equal(ok(await call('GET', '/api/categories')).length, 7);
    const all = ok(await call('GET', '/api/providers'));
    assert.equal(all.length, 7, 'the unverified provider is hidden');
    assert.ok(all.every(p => p.verified && p.email === undefined && p.phone === undefined), 'no email or phone is public');
    assert.equal(ok(await call('GET', '/api/providers', { query: { service: 'Plumbing' } })).length, 1);
    assert.equal(ok(await call('GET', '/api/providers', { query: { q: 'leaking tap' } }))[0].name, 'Tenzin Dorji');
    assert.equal(ok(await call('GET', '/api/providers', { query: { maxPrice: '300', sort: 'priceLow', limit: '2' } })).length, 2);

    const one = ok(await call('GET', `/api/providers/${sonam.user.id}`));
    assert.equal(one.name, 'Sonam Tobgay');
    assert.ok(Array.isArray(one.reviewList));
  });

  await t.test('SQL injection attempts do nothing', async () => {
    const evil = "'; DROP TABLE services; --";
    assert.equal((await call('POST', '/api/login', { body: { email: "' OR '1'='1", password: evil, role: 'admin' } })).status, 400);
    assert.equal((await call('POST', '/api/login', { body: { email: "x@y.bt' OR '1'='1", password: evil, role: 'admin' } })).status, 400);
    ok(await call('GET', '/api/providers', { query: { q: evil, service: evil, location: evil, sort: evil, limit: evil } }));
    assert.equal((await call('GET', '/api/providers/1 OR 1=1')).status, 404);
    assert.equal(ok(await call('GET', '/api/categories')).length, 7, 'the table is still there');
  });

  // ---------------- the whole journey of document 5.3.1 "System Testing" ----------------
  let providerId, bookingId, feedbackId, newProvider, kinley;

  await t.test('journey 1: a new provider registers, the admin verifies, customers can find them', async () => {
    const reg = ok(await call('POST', '/api/register', {
      body: { role: 'provider', name: 'Lhaki Wangmo', email: 'lhaki@example.bt', phone: '17555000', location: 'Thimphu',
              category: 'Cleaning', rate: '300', experience: '3', bio: 'Home cleaning', password: 'Test@1234' } }), 201);
    providerId = reg.id;
    newProvider = await login('lhaki@example.bt', 'Test@1234', 'provider');

    const mine = ok(await call('GET', '/api/provider/me', { token: newProvider.token }));
    assert.equal(mine.verified, false);
    assert.equal(mine.email, 'lhaki@example.bt', 'the provider sees their own email');
    assert.ok(!ok(await call('GET', '/api/providers')).some(p => p.id === providerId), 'hidden until verified');

    const pending = ok(await call('GET', '/api/admin/providers', { token: admin.token, query: { status: 'pending' } }));
    assert.ok(pending.some(p => p.id === providerId && p.email));
    assert.equal((await call('PUT', `/api/admin/providers/${providerId}/verify`, { token: admin.token, body: { verified: 'yes' } })).status, 400);
    assert.equal(ok(await call('PUT', `/api/admin/providers/${providerId}/verify`, { token: admin.token, body: { verified: true } })).verified, true);
    assert.ok(ok(await call('GET', '/api/providers')).some(p => p.id === providerId));

    // provider sets working days and hours on "My Services"
    const saved = ok(await call('PUT', '/api/provider/services', { token: newProvider.token, body: {
      category: 'Cleaning', rate: 300, experience: 3, bio: 'Home cleaning', available: true, days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '17:00' } }));
    assert.deepEqual(saved.days, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal((await call('PUT', '/api/provider/services', { token: newProvider.token, body: {
      category: 'Cleaning', rate: 10, experience: 3, available: true, days: [1], from: '17:00', to: '08:00' } })).status, 400);

    // the provider got a "Profile Verified" notification
    const count = ok(await call('GET', '/api/notifications/unread-count', { token: newProvider.token }));
    assert.equal(count.count, 1);
  });

  await t.test('journey 2: customer books (server works out the price), pays, provider is told', async () => {
    kinley = await login('kinley@example.bt', 'Test@1234', 'customer');
    const date = futureDate(3);   // a Wednesday

    // missing fields, past date, hours out of range: all refused
    const bad = await call('POST', '/api/bookings', { token: kinley.token, body: { providerId, date: '2020-01-01', time: '10:00', hours: 99, address: 'x' } });
    assert.equal(bad.status, 400);
    for (const f of ['date', 'hours', 'address']) assert.ok(bad.body.fields[f], `field ${f}`);

    // the browser tries to set its own price: ignored
    const b = ok(await call('POST', '/api/bookings', { token: kinley.token, body: {
      providerId, date, time: '10:00', hours: 2, address: 'Main Street, Paro', notes: 'Full clean', amount: 1, status: 'Completed', customerId: 1 } }), 201);
    bookingId = b.id;
    assert.equal(b.amount, 600);
    assert.equal(b.status, 'Pending');
    assert.equal(b.customerId, kinley.user.id);
    assert.equal(b.paid, false);

    // overlapping time with the same provider is refused
    const clash = await call('POST', '/api/bookings', { token: pema.token, body: { providerId, date, time: '11:00', hours: 1, address: 'Norzin Lam, Thimphu' } });
    assert.equal(clash.status, 409);

    // only the people involved can see it
    assert.equal(ok(await call('GET', `/api/bookings/${bookingId}`, { token: kinley.token })).id, bookingId);
    assert.equal(ok(await call('GET', `/api/bookings/${bookingId}`, { token: newProvider.token })).customerName, 'Kinley Tshering');
    assert.equal(ok(await call('GET', `/api/bookings/${bookingId}`, { token: admin.token })).id, bookingId);
    assert.equal((await call('GET', `/api/bookings/${bookingId}`, { token: pema.token })).status, 404);
    assert.equal((await call('GET', `/api/bookings/${bookingId}`, { token: sonam.token })).status, 404);

    // lists: each person sees only their own; ?status= filters
    assert.equal(ok(await call('GET', '/api/bookings', { token: kinley.token })).length, 1);
    assert.equal(ok(await call('GET', '/api/bookings', { token: pema.token })).length, 4);
    assert.equal(ok(await call('GET', '/api/bookings', { token: admin.token })).length, 5);
    assert.equal(ok(await call('GET', '/api/bookings', { token: pema.token, query: { status: 'Pending,Confirmed' } })).length, 2);
    assert.equal((await call('GET', '/api/bookings', { token: pema.token, query: { status: 'Nope' } })).status, 400);

    // the provider's notification list and red number
    const notes = ok(await call('GET', '/api/notifications', { token: newProvider.token }));
    assert.match(notes[0].text, /Kinley Tshering requested a cleaning job/);
    assert.equal(ok(await call('GET', '/api/notifications/unread-count', { token: newProvider.token })).count, 2);

    // payment: invalid method, then pay online
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'Bitcoin' } })).status, 400);
    assert.equal((await call('POST', '/api/payments', { token: pema.token, body: { bookingId, method: 'mPay' } })).status, 404, 'not your booking');
    const paid = ok(await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'mPay' } }));
    assert.equal(paid.paid, true);
    assert.equal(paid.payMethod, 'mPay');
    assert.match(paid.txn, /^DS\d{8}$/);
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'mPay' } })).status, 409, 'cannot pay twice');

    const history = ok(await call('GET', '/api/payments', { token: kinley.token }));
    assert.equal(history.length, 1);
    assert.equal(history[0].amount, 600);
  });

  await t.test('journey 3: provider accepts and completes, customer cannot do the provider\'s steps', async () => {
    assert.equal((await call('PUT', `/api/bookings/${bookingId}`, { token: kinley.token, body: { status: 'Completed' } })).status, 409);
    assert.equal((await call('PUT', `/api/bookings/${bookingId}`, { token: sonam.token, body: { status: 'Confirmed' } })).status, 404, 'another provider');
    assert.equal((await call('PUT', `/api/bookings/${bookingId}`, { token: newProvider.token, body: { status: 'Completed' } })).status, 409, 'must accept first');
    assert.equal((await call('PUT', `/api/bookings/${bookingId}`, { token: newProvider.token, body: { status: 'Banana' } })).status, 400);

    assert.equal(ok(await call('PUT', `/api/bookings/${bookingId}`, { token: newProvider.token, body: { status: 'Confirmed' } })).status, 'Confirmed');
    const stats = ok(await call('GET', '/api/provider/stats', { token: newProvider.token }));
    assert.equal(stats.confirmedJobs, 1);

    assert.equal(ok(await call('PUT', `/api/bookings/${bookingId}`, { token: newProvider.token, body: { status: 'Completed' } })).status, 'Completed');

    const earn = ok(await call('GET', '/api/provider/payments', { token: newProvider.token }));
    assert.equal(earn.total, 600);
    assert.equal(earn.online, 600);
    assert.equal(earn.cash, 0);
    assert.equal(earn.payments.length, 1);

    // the customer was told at each step
    const mine = ok(await call('GET', '/api/notifications', { token: kinley.token }));
    const titles = mine.map(n => n.title);
    assert.ok(titles.includes('Job Accepted') && titles.includes('Job Completed') && titles.includes('Payment'));
  });

  await t.test('journey 4: rating, provider reply, public profile, notification buttons', async () => {
    assert.equal((await call('POST', '/api/feedback', { token: kinley.token, body: { bookingId, rating: 9 } })).status, 400);
    const fb = ok(await call('POST', '/api/feedback', { token: kinley.token, body: { bookingId, rating: 4, comment: 'Very clean, thank you.' } }), 201);
    feedbackId = fb.id;
    assert.equal(fb.rating, 4);
    assert.equal((await call('POST', '/api/feedback', { token: kinley.token, body: { bookingId, rating: 5 } })).status, 409, 'rate once');

    assert.equal(ok(await call('GET', '/api/feedback', { token: newProvider.token })).length, 1);
    assert.equal(ok(await call('GET', '/api/feedback', { token: kinley.token })).length, 1);

    assert.equal((await call('PUT', `/api/feedback/${feedbackId}/reply`, { token: newProvider.token, body: { reply: '' } })).status, 400);
    assert.equal((await call('PUT', `/api/feedback/${feedbackId}/reply`, { token: sonam.token, body: { reply: 'Not mine' } })).status, 404);
    assert.equal(ok(await call('PUT', `/api/feedback/${feedbackId}/reply`, { token: newProvider.token, body: { reply: 'Thank you!' } })).reply, 'Thank you!');
    assert.equal((await call('PUT', `/api/feedback/${feedbackId}/reply`, { token: newProvider.token, body: { reply: 'Again' } })).status, 409);

    const profile = ok(await call('GET', `/api/providers/${providerId}`));
    assert.equal(profile.rating, 4, 'the server worked out the average');
    assert.equal(profile.reviews, 1);
    assert.equal(profile.reviewList[0].reply, 'Thank you!');

    // notifications: read one, read all, clear all (each person has their own)
    const list = ok(await call('GET', '/api/notifications', { token: kinley.token }));
    assert.ok(list.some(n => n.read === false));
    ok(await call('PUT', `/api/notifications/${list[0].id}/read`, { token: kinley.token }));
    assert.equal((await call('PUT', `/api/notifications/${list[0].id}/read`, { token: newProvider.token })).status, 404, "not someone else's");
    ok(await call('PUT', '/api/notifications/read-all', { token: kinley.token }));
    assert.equal(ok(await call('GET', '/api/notifications/unread-count', { token: kinley.token })).count, 0);
    assert.ok(ok(await call('GET', '/api/notifications', { token: newProvider.token })).length > 0, 'the provider still has theirs');
    ok(await call('DELETE', '/api/notifications', { token: kinley.token }));
    assert.equal(ok(await call('GET', '/api/notifications', { token: kinley.token })).length, 0);
  });

  await t.test('cancel: the customer cancels, the provider is told', async () => {
    const date = futureDate(4);
    const b = ok(await call('POST', '/api/bookings', { token: kinley.token, body: { providerId, date, time: '09:00', hours: 1, address: 'Main Street, Paro' } }), 201);
    const cash = ok(await call('POST', '/api/payments', { token: kinley.token, body: { bookingId: b.id, method: 'Cash' } }));
    assert.equal(cash.payMethod, 'Cash');
    assert.equal(cash.paid, false);
    assert.equal(ok(await call('PUT', `/api/bookings/${b.id}`, { token: kinley.token, body: { status: 'Cancelled' } })).status, 'Cancelled');
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId: b.id, method: 'mPay' } })).status, 409, 'cancelled bookings cannot be paid');
    assert.equal((await call('PUT', `/api/bookings/${b.id}`, { token: kinley.token, body: { status: 'Cancelled' } })).status, 409, 'cannot cancel twice');
    assert.ok(ok(await call('GET', '/api/notifications', { token: newProvider.token })).some(n => n.title === 'Booking Cancelled'));
  });

  await t.test('profile and password', async () => {
    const p = ok(await call('GET', '/api/profile', { token: kinley.token }));
    assert.equal(p.name, 'Kinley Tshering');
    assert.equal(p.address, 'Main Street, Paro');

    assert.equal((await call('PUT', '/api/profile', { token: kinley.token, body: { name: 'Kinley T', phone: '12', location: 'Paro', address: 'Main Street, Paro' } })).status, 400);
    assert.equal(ok(await call('PUT', '/api/profile', { token: kinley.token, body: { name: 'Kinley T', phone: '17123457', location: 'Thimphu', address: 'New Road, Thimphu' } })).name, 'Kinley T');
    assert.equal((await call('PUT', '/api/profile', { token: admin.token, body: { name: 'Boss' } })).status, 403);

    const wrong = await call('PUT', '/api/profile/password', { token: kinley.token, body: { currentPassword: 'Nope@1234', newPassword: 'New@12345' } });
    assert.equal(wrong.status, 400);
    assert.ok(wrong.body.fields.currentPassword);
    assert.ok((await call('PUT', '/api/profile/password', { token: kinley.token, body: { currentPassword: 'Test@1234', newPassword: 'abc' } })).body.fields.newPassword);
    assert.ok((await call('PUT', '/api/profile/password', { token: kinley.token, body: { currentPassword: 'Test@1234', newPassword: 'Test@1234' } })).body.fields.newPassword, 'must be different');
    ok(await call('PUT', '/api/profile/password', { token: kinley.token, body: { currentPassword: 'Test@1234', newPassword: 'New@12345' } }));

    assert.equal((await call('POST', '/api/login', { body: { email: 'kinley@example.bt', password: 'Test@1234', role: 'customer' } })).status, 401, 'old password no longer works');
    kinley = await login('kinley@example.bt', 'New@12345', 'customer');
  });

  await t.test('admin: overview, users, suspend, reports, categories', async () => {
    const ov = ok(await call('GET', '/api/admin/overview', { token: admin.token }));
    assert.equal(ov.stats.customers, 2);
    assert.equal(ov.stats.providers, 9);
    assert.equal(ov.stats.awaitingVerification, 1);
    assert.equal(ov.stats.completedJobs, 2);
    assert.equal(ov.stats.completedValue, 700 + 600);

    assert.equal(ok(await call('GET', '/api/admin/users', { token: admin.token, query: { role: 'provider', q: 'lhaki' } })).length, 1);

    // suspend: the customer's CURRENT token stops working at once, and login says why
    ok(await call('PUT', `/api/admin/users/customer/${kinley.user.id}/status`, { token: admin.token, body: { suspended: true } }));
    assert.equal((await call('GET', '/api/bookings', { token: kinley.token })).status, 401);
    const blocked = await call('POST', '/api/login', { body: { email: 'kinley@example.bt', password: 'New@12345', role: 'customer' } });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /suspended/);
    ok(await call('PUT', `/api/admin/users/customer/${kinley.user.id}/status`, { token: admin.token, body: { suspended: false } }));
    assert.equal((await call('GET', '/api/bookings', { token: kinley.token })).status, 200);
    assert.equal((await call('PUT', '/api/admin/users/admin/1/status', { token: admin.token, body: { suspended: true } })).status, 404, 'the admin cannot be suspended');
    assert.equal((await call('PUT', `/api/admin/users/customer/${kinley.user.id}/status`, { token: admin.token, body: { suspended: 'x' } })).status, 400);

    // an admin-revoked provider disappears from search
    ok(await call('PUT', `/api/admin/providers/${providerId}/verify`, { token: admin.token, body: { verified: false } }));
    assert.ok(!ok(await call('GET', '/api/providers')).some(p => p.id === providerId));
    ok(await call('PUT', `/api/admin/providers/${providerId}/verify`, { token: admin.token, body: { verified: true } }));

    const rep = ok(await call('GET', '/api/admin/reports', { token: admin.token }));
    assert.equal(rep.bookingsByStatus.find(s => s.label === 'Completed').value, 2);
    assert.ok(rep.revenueByCategory.some(r => r.label === 'Cleaning' && r.value === 600));
    assert.equal(rep.payments.online.amount, 1300);
    assert.equal(rep.topProviders.length, 5);

    // categories: add, rename, duplicate, delete
    const cat = ok(await call('POST', '/api/admin/categories', { token: admin.token, body: { name: 'Gardening', desc: 'Lawns and plants', icon: 'bi-tree-fill' } }), 201);
    assert.equal((await call('POST', '/api/admin/categories', { token: admin.token, body: { name: 'gardening', desc: 'x' } })).status, 400, 'duplicate name');
    assert.equal(ok(await call('PUT', `/api/admin/categories/${cat.id}`, { token: admin.token, body: { name: 'Garden Care', desc: 'Lawns', icon: 'bi-tree-fill' } })).name, 'Garden Care');
    assert.equal(ok(await call('GET', '/api/categories')).length, 8);
    const plumbing = ok(await call('GET', '/api/categories')).find(c => c.name === 'Plumbing');
    assert.equal((await call('DELETE', `/api/admin/categories/${plumbing.id}`, { token: admin.token })).status, 409, 'in use');
    ok(await call('DELETE', `/api/admin/categories/${cat.id}`, { token: admin.token }));
    assert.equal((await call('DELETE', `/api/admin/categories/${cat.id}`, { token: admin.token })).status, 404);
  });

  await t.test('every address in routes.js was used by these tests', () => {
    const missing = ROUTES.map(r => `${r.method} ${r.path}`).filter(r => !used.has(r));
    assert.deepEqual(missing, [], `these addresses were never tested: ${missing.join(', ')}`);
  });
});
