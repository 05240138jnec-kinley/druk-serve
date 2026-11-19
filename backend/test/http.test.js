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

const config = { jwtSecret: 'a-test-secret-that-is-long-enough-for-hs256', jwtExpiresInSeconds: 3600, mail: { siteUrl: 'http://127.0.0.1:5500' }, googleClientId: 'test-client.apps.googleusercontent.com' };

function futureDate(weekdayWanted, minDaysAhead = 2) {
  const [y, m, d] = dates.todayISO().split('-').map(Number);
  for (let i = minDaysAhead; i < minDaysAhead + 14; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    if (dt.getUTCDay() === weekdayWanted) return dt.toISOString().slice(0, 10);
  }
}

const os = require('node:os');
process.env.UPLOAD_DIR = require('node:fs').mkdtempSync(require('node:path').join(os.tmpdir(), 'ds-uploads-'));

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

    // payment: invalid method, not your booking, and too early (pay AFTER the work is done)
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'Bitcoin' } })).status, 400);
    assert.equal((await call('POST', '/api/payments', { token: pema.token, body: { bookingId, method: 'mPay' } })).status, 404, 'not your booking');
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'mPay' } })).status, 409, 'cannot pay before the job is finished');
    assert.equal(ok(await call('GET', '/api/payments', { token: kinley.token })).length, 0);
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

    // finished but not paid yet: nothing counted as earned, 600 is awaiting payment
    let earn = ok(await call('GET', '/api/provider/payments', { token: newProvider.token }));
    assert.equal(earn.total, 0);
    assert.equal(earn.awaiting, 600);

    // now the customer pays (online)
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'Bitcoin' } })).status, 400);
    const paid = ok(await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'mPay' } }));
    assert.equal(paid.paid, true);
    assert.equal(paid.payMethod, 'mPay');
    assert.match(paid.txn, /^DS\d{8}$/);
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId, method: 'mPay' } })).status, 409, 'cannot pay twice');
    const history = ok(await call('GET', '/api/payments', { token: kinley.token }));
    assert.equal(history.length, 1);
    assert.equal(history[0].amount, 600);

    earn = ok(await call('GET', '/api/provider/payments', { token: newProvider.token }));
    assert.equal(earn.total, 600);
    assert.equal(earn.online, 600);
    assert.equal(earn.cash, 0);
    assert.equal(earn.awaiting, 0);
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

    // notification details: the review, the booking and the provider's name behind each message
    const feed = ok(await call('GET', '/api/notifications', { token: kinley.token }));
    const replied = feed.find(n => n.title === 'Provider Replied');
    assert.equal(replied.relatedType, 'feedback');
    const detail = ok(await call('GET', `/api/notifications/${replied.id}`, { token: kinley.token }));
    assert.equal(detail.related.type, 'feedback');
    assert.equal(detail.related.feedback.reply, 'Thank you!');
    assert.equal(detail.related.feedback.comment, 'Very clean, thank you.');
    assert.equal(detail.related.booking.providerName, newProvider.user.name);
    assert.match(detail.when.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(detail.when.time, /^\d{2}:\d{2}$/);
    assert.equal((await call('GET', `/api/notifications/${replied.id}`, { token: newProvider.token })).status, 404, "not someone else's");
    assert.equal((await call('GET', `/api/notifications/${replied.id}`)).status, 401, 'login needed');
    const done = feed.find(n => n.title === 'Job Completed');
    assert.equal(ok(await call('GET', `/api/notifications/${done.id}`, { token: kinley.token })).related.booking.id, bookingId);
    const newFb = ok(await call('GET', '/api/notifications', { token: newProvider.token })).find(n => n.title === 'New Feedback');
    assert.equal(ok(await call('GET', `/api/notifications/${newFb.id}`, { token: newProvider.token })).related.feedback.rating, 4);

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
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId: b.id, method: 'Cash' } })).status, 409, 'not finished, so not payable');
    assert.equal(ok(await call('PUT', `/api/bookings/${b.id}`, { token: kinley.token, body: { status: 'Cancelled' } })).status, 'Cancelled');
    assert.equal((await call('POST', '/api/payments', { token: kinley.token, body: { bookingId: b.id, method: 'mPay' } })).status, 409, 'cancelled bookings cannot be paid');
    assert.equal((await call('PUT', `/api/bookings/${b.id}`, { token: kinley.token, body: { status: 'Cancelled' } })).status, 409, 'cannot cancel twice');
    assert.ok(ok(await call('GET', '/api/notifications', { token: newProvider.token })).some(n => n.title === 'Booking Cancelled'));
  });

  await t.test('profile photo: saved as a file, path kept in the database, JPG/PNG/WEBP only', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const url = (type, bytes) => `data:image/${type};base64,` + Buffer.from(bytes).toString('base64');
    const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0];
    const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    const WEBP = [...Buffer.from('RIFF'), 4, 0, 0, 0, ...Buffer.from('WEBPVP8 ')];
    const fileOf = u => path.join(process.env.UPLOAD_DIR, 'avatars', path.basename(u));

    assert.equal(ok(await call('GET', '/api/profile', { token: kinley.token })).photo, null, 'default: no photo');
    const bad = {
      empty: '', text: 'hello', svg: 'data:image/svg+xml;base64,PHN2Zy8+', gif: url('gif', JPG),
      fake: url('png', JPG), notReal: url('jpeg', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
      big: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from(JPG), Buffer.alloc(2.5 * 1024 * 1024)]).toString('base64'),
      script: 'data:image/jpeg;base64,/9j/"><script>'
    };
    for (const [name, photo] of Object.entries(bad)) {
      const r = await call('PUT', '/api/profile/photo', { token: kinley.token, body: { photo } });
      if (name === 'fake') { assert.equal(r.status, 200, 'png label on a jpeg file is still a real picture'); continue; }
      assert.equal(r.status, 400, name);
      assert.ok(r.body.fields.photo, name);
    }
    ok(await call('DELETE', '/api/profile/photo', { token: kinley.token }));
    assert.equal((await call('PUT', '/api/profile/photo', { body: { photo: url('jpeg', JPG) } })).status, 401);
    assert.equal((await call('PUT', '/api/profile/photo', { token: admin.token, body: { photo: url('jpeg', JPG) } })).status, 403);

    // upload: a real file appears and the profile, login and provider lists show its path
    const first = ok(await call('PUT', '/api/profile/photo', { token: kinley.token, body: { photo: url('jpeg', JPG) } })).photo;
    assert.match(first, /^\/uploads\/avatars\/customer-\d+-[0-9a-f]{12}\.jpg$/);
    assert.ok(fs.existsSync(fileOf(first)));
    assert.deepEqual([...fs.readFileSync(fileOf(first))], JPG, 'the saved file is the uploaded picture');
    assert.equal(ok(await call('GET', '/api/profile', { token: kinley.token })).photo, first, 'still there on the next visit');
    assert.equal(ok(await call('GET', '/api/profile', { token: newProvider.token })).photo, null, 'each person has their own');
    const again = await call('POST', '/api/login', { body: { email: 'kinley@example.bt', password: 'Test@1234', role: 'customer' } });
    assert.equal(again.body.user.photo, first, 'login brings the photo back');

    // replace (png) deletes the old file; webp works too
    const second = ok(await call('PUT', '/api/profile/photo', { token: kinley.token, body: { photo: url('png', PNG) } })).photo;
    assert.match(second, /\.png$/);
    assert.ok(!fs.existsSync(fileOf(first)), 'the old file was removed');
    const third = ok(await call('PUT', '/api/profile/photo', { token: kinley.token, body: { photo: url('webp', WEBP) } })).photo;
    assert.match(third, /\.webp$/);

    // provider photo is public, customer photo is not part of any public data
    const pPhoto = ok(await call('PUT', '/api/profile/photo', { token: newProvider.token, body: { photo: url('jpeg', JPG) } })).photo;
    assert.equal(ok(await call('GET', `/api/providers/${providerId}`)).photo, pPhoto);
    assert.equal(ok(await call('GET', '/api/providers')).find(p => p.id === providerId).photo, pPhoto);
    assert.equal(ok(await call('PUT', '/api/profile', { token: newProvider.token, body: { name: newProvider.user.name, phone: '17000000', location: 'Thimphu' } })).photo, pPhoto, 'editing the profile keeps the photo');

    // remove
    assert.equal(ok(await call('DELETE', '/api/profile/photo', { token: newProvider.token })).photo, null);
    assert.ok(!fs.existsSync(fileOf(pPhoto)));
    assert.equal(ok(await call('GET', `/api/providers/${providerId}`)).photo, null);
    ok(await call('DELETE', '/api/profile/photo', { token: kinley.token }));
    assert.deepEqual(fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'avatars')), [], 'no files left behind');
  });

  await t.test('forgot password: emailed one-time link, 30 minutes, same answer for every email', async () => {
    const mailer = require('../src/utils/mailer');
    const outbox = [];
    mailer.setTransport(async m => { outbox.push(m); });
    t.after(() => mailer.setTransport(null));
    const tokenOf = mail => /reset-password\.html\?token=([0-9a-f]{64})/.exec(mail.text)[1];
    const forgot = email => call('POST', '/api/forgot-password', { body: { email } });
    const reset = (token, newPassword) => call('POST', '/api/reset-password', { body: { token, newPassword } });

    assert.equal((await forgot('not-an-email')).status, 400);
    const unknown = await forgot('nobody@example.bt');
    assert.equal(unknown.status, 200);
    assert.equal(outbox.length, 0, 'no email for an unknown address');
    const known = await forgot('customer@drukserve.bt');
    assert.deepEqual(known.body, unknown.body, 'the answer never reveals whether the email exists');
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'customer@drukserve.bt');
    assert.match(outbox[0].text, /^.*http:\/\/127\.0\.0\.1:5500\/reset-password\.html\?token=/m);
    const token = tokenOf(outbox[0]);
    const stored = await db.get('SELECT token_hash FROM password_resets');
    assert.notEqual(stored.token_hash, token, 'only a hash of the secret is stored');

    // refused: weak password, wrong token
    assert.ok((await reset(token, 'abc')).body.fields.newPassword);
    assert.equal((await reset('abc', 'Reset@1234')).status, 400);
    assert.equal((await reset('0'.repeat(64), 'Reset@1234')).status, 400);

    // a newer request replaces the older link
    await forgot('customer@drukserve.bt');
    assert.equal(outbox.length, 2);
    assert.equal((await reset(token, 'Reset@1234')).status, 400, 'the old link no longer works');

    // an expired link
    const late = tokenOf(outbox[1]);
    clockMs += 31 * 60 * 1000;
    assert.equal((await reset(late, 'Reset@1234')).status, 400, 'expired after 30 minutes');
    clockMs -= 31 * 60 * 1000;

    // a suspended account gets no email
    ok(await call('PUT', `/api/admin/users/customer/${pema.user.id}/status`, { token: admin.token, body: { suspended: true } }));
    await forgot('customer@drukserve.bt');
    assert.equal(outbox.length, 2);
    ok(await call('PUT', `/api/admin/users/customer/${pema.user.id}/status`, { token: admin.token, body: { suspended: false } }));

    // the good link works once
    assert.equal((await reset(late, 'Reset@1234')).status, 200);
    assert.equal((await call('POST', '/api/login', { body: { email: 'customer@drukserve.bt', password: 'Customer@123', role: 'customer' } })).status, 401, 'old password is gone');
    assert.equal((await call('POST', '/api/login', { body: { email: 'customer@drukserve.bt', password: 'Reset@1234', role: 'customer' } })).status, 200);
    assert.equal((await reset(late, 'Another@1234')).status, 400, 'a link works only once');
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

  await t.test('google sign-in: only logs in existing accounts, by role; one email can be a customer AND a provider', async () => {
    const googleAuth = require('../src/utils/googleAuth');
    let google = null;                                   // what the fake "Google" says about the token
    googleAuth.setVerifier(async credential => { if (credential === 'bad') throw new Error('bad token'); return google; });
    t.after(() => googleAuth.setVerifier(null));
    const go = (credential, role) => call('POST', '/api/google-login', { body: { credential, role } });
    const countCustomers = async () => ok(await call('GET', '/api/admin/users', { token: admin.token, query: { role: 'customer' } })).length;

    assert.equal(ok(await call('GET', '/api/auth-config')).googleClientId, config.googleClientId);
    assert.equal((await go('', 'customer')).status, 400);
    assert.equal((await go('x', undefined)).status, 400, 'a role is needed');
    assert.equal((await go('bad', 'customer')).status, 401, 'a token Google does not accept');
    google = { email: 'tashi@gmail.com', email_verified: false, name: 'Tashi Dorji' };
    assert.equal((await go('x', 'customer')).status, 401, 'unverified email');

    // Google can NOT register anybody
    const before = await countCustomers();
    google = { email: 'Tashi@Gmail.com', email_verified: true, name: 'Tashi Dorji' };
    const refused = await go('x', 'customer');
    assert.equal(refused.status, 404);
    assert.match(refused.body.error, /register first/i);
    assert.equal((await go('x', 'provider')).status, 404);
    assert.equal(await countCustomers(), before, 'no account was created');

    // register normally (customer), then Google logs in
    ok(await call('POST', '/api/register', { body: { role: 'customer', name: 'Tashi Dorji', email: 'tashi@gmail.com', phone: '17123456', address: 'Thimphu town', password: 'Test@1234' } }), 201);
    const viaGoogle = ok(await go('x', 'customer'));
    assert.equal(viaGoogle.user.role, 'customer');
    assert.equal(viaGoogle.user.email, 'tashi@gmail.com');
    assert.equal(viaGoogle.created, undefined);
    assert.equal(ok(await call('GET', '/api/me', { token: viaGoogle.token })).user.id, viaGoogle.user.id, 'the token works');

    // the customer has no provider account yet: the message points to the right choice
    const wrongRole = await go('x', 'provider');
    assert.equal(wrongRole.status, 404);
    assert.match(wrongRole.body.error, /no Provider account/i);
    assert.match(wrongRole.body.error, /Customer/);

    // the SAME email now registers as a provider too (own password, own account)
    ok(await call('POST', '/api/register', { body: { role: 'provider', name: 'Tashi Dorji', email: 'tashi@gmail.com', phone: '17123456', category: 'Plumbing', rate: 300, password: 'Prov@12345' } }), 201);
    const dup = await call('POST', '/api/register', { body: { role: 'provider', name: 'Tashi Dorji', email: 'tashi@gmail.com', phone: '17123456', category: 'Plumbing', rate: 300, password: 'Prov@12345' } });
    assert.equal(dup.status, 409, 'the same email cannot be a provider twice');
    assert.match(dup.body.error, /already registered as a provider/);
    const cust = ok(await go('x', 'customer'));
    const prov = ok(await go('x', 'provider'));
    assert.equal(cust.user.role, 'customer');
    assert.equal(prov.user.role, 'provider');
    assert.notEqual(prov.token, cust.token);
    assert.equal(ok(await call('GET', '/api/me', { token: prov.token })).user.role, 'provider');
    assert.equal(prov.user.providerId, prov.user.id);

    // password login picks the account by role, each with its own password
    const pwLogin = (password, role) => call('POST', '/api/login', { body: { email: 'tashi@gmail.com', password, role } });
    assert.equal(ok(await pwLogin('Test@1234', 'customer')).user.id, cust.user.id);
    assert.equal(ok(await pwLogin('Prov@12345', 'provider')).user.id, prov.user.id);
    assert.equal((await pwLogin('Prov@12345', 'customer')).status, 401, 'provider password does not open the customer account');
    assert.equal((await pwLogin('Test@1234', 'provider')).status, 401, 'customer password does not open the provider account');

    // forgot password: one link per account, each changes only its own account
    const sent = [];
    require('../src/utils/mailer').setTransport(async mail => { sent.push(mail); });
    t.after(() => require('../src/utils/mailer').setTransport(null));
    ok(await call('POST', '/api/forgot-password', { body: { email: 'tashi@gmail.com' } }));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(sent.length, 2, 'two accounts, two emails');
    const customerMail = sent.find(m => /customer account/.test(m.text));
    const providerMail = sent.find(m => /provider account/.test(m.text));
    const tokenOf = m => m.text.match(/token=([0-9a-f]{64})/)[1];
    ok(await call('POST', '/api/reset-password', { body: { token: tokenOf(providerMail), newPassword: 'Newer@12345' } }));
    assert.equal(ok(await pwLogin('Newer@12345', 'provider')).user.id, prov.user.id);
    assert.equal(ok(await pwLogin('Test@1234', 'customer')).user.id, cust.user.id, 'customer password unchanged');
    assert.ok(tokenOf(customerMail));

    // an existing provider logs in as a provider; admin never
    google = { email: 'provider@drukserve.bt', email_verified: true, name: 'Sonam Dorji' };
    assert.equal(ok(await go('x', 'provider')).user.role, 'provider');
    assert.equal((await go('x', 'customer')).status, 404);
    google = { email: 'admin@drukserve.bt', email_verified: true, name: 'Admin' };
    assert.equal((await go('x', 'admin')).status, 403, 'admin must use email and password');
    assert.equal((await go('x', 'customer')).status, 404, 'the admin email is not a customer');

    ok(await call('PUT', `/api/admin/users/customer/${cust.user.id}/status`, { token: admin.token, body: { suspended: true } }));
    google = { email: 'tashi@gmail.com', email_verified: true, name: 'Tashi Dorji' };
    assert.equal((await go('x', 'customer')).status, 403, 'suspended customer account');
    assert.equal(ok(await go('x', 'provider')).user.role, 'provider', 'the provider account is separate and still works');
    ok(await call('PUT', `/api/admin/users/customer/${cust.user.id}/status`, { token: admin.token, body: { suspended: false } }));

    const saved = config.googleClientId;
    config.googleClientId = '';
    assert.equal((await go('x', 'customer')).status, 503, 'switched off when there is no Client ID');
    assert.equal(ok(await call('GET', '/api/auth-config')).googleClientId, null);
    config.googleClientId = saved;
  });

  await t.test('every address in routes.js was used by these tests', () => {
    const missing = ROUTES.map(r => `${r.method} ${r.path}`).filter(r => !used.has(r));
    assert.deepEqual(missing, [], `these addresses were never tested: ${missing.join(', ')}`);
  });
});