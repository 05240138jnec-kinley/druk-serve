'use strict';
// Integration tests: the real controllers + real SQL (schema.sql) on SQLite.
// Follows the "whole journey" in the frontend TESTING.md and the test types in document 5.3.1.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSqliteDb, available } = require('./helpers/sqliteDb');
const { seedDemo } = require('../src/seed/demoData');
const { sandboxGateway, liveGateway } = require('../src/payments/gateway');
const dates = require('../src/utils/dates');

const auth = require('../src/controllers/auth');
const profile = require('../src/controllers/profile');
const categories = require('../src/controllers/categories');
const providers = require('../src/controllers/providers');
const bookings = require('../src/controllers/bookings');
const payments = require('../src/controllers/payments');
const feedback = require('../src/controllers/feedback');
const notifications = require('../src/controllers/notifications');
const admin = require('../src/controllers/admin');

// A date in the future that falls on the wanted weekday (1 = Monday ... 0 = Sunday)
function futureDate(weekdayWanted, minDaysAhead = 2) {
  const [y, m, d] = dates.todayISO().split('-').map(Number);
  for (let i = minDaysAhead; i < minDaysAhead + 14; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    if (dt.getUTCDay() === weekdayWanted) return dt.toISOString().slice(0, 10);
  }
}

// Check that a promise fails with a certain HTTP status (and optionally a field name)
async function rejects(promise, status, field) {
  await assert.rejects(promise, e => {
    assert.equal(e.status, status, `expected ${status} but got ${e.status}: ${e.message}`);
    if (field) assert.ok(e.fields && e.fields[field], `expected a message for field "${field}"`);
    return true;
  });
}

test('Druk Serve journey', { skip: !available && 'node:sqlite needs Node 22.5 or newer' }, async t => {
  const db = createSqliteDb();
  await seedDemo(db);
  t.after(() => db.close());

  // Sessions (what the JWT middleware would put in req.user)
  const admin1 = { id: 1, role: 'admin', name: 'Admin' };
  const pema = { id: 1, role: 'customer', name: 'Pema Choden' };        // seeded customer
  const sonam = { id: 1, role: 'provider', name: 'Sonam Tobgay' };      // seeded provider 1 (Electrical, Nu. 400/hr)
  const tenzin = { id: 2, role: 'provider', name: 'Tenzin Dorji' };     // seeded provider 2 (Plumbing)

  await t.test('register: validation, duplicates, admin cannot be registered', async () => {
    await rejects(auth.register(db, { role: 'admin', name: 'Hacker', email: 'h@x.bt', phone: '17123456', password: 'Test@1234' }), 400, 'role');
    await rejects(auth.register(db, { role: 'customer', name: 'Al', email: 'bad', phone: '12', password: 'abc', address: 'x' }), 400, 'name');
    const e = await auth.register(db, { role: 'customer', name: 'Al', email: 'bad', phone: '12', password: 'abc', address: 'x' }).catch(x => x);
    for (const f of ['name', 'email', 'phone', 'password', 'address']) assert.ok(e.fields[f], `missing message for ${f}`);
    await rejects(auth.register(db, { role: 'customer', name: 'Pema Two', email: 'CUSTOMER@drukserve.bt', phone: '17123456', address: 'Thimphu town', password: 'Test@1234' }), 409, 'email');
    // the admin's email can never be used for a new account
    await rejects(auth.register(db, { role: 'customer', name: 'Pema Two', email: 'admin@drukserve.bt', phone: '17123456', address: 'Thimphu town', password: 'Test@1234' }), 409, 'email');
    await rejects(auth.register(db, { role: 'provider', name: 'New Plumber', email: 'np@x.bt', phone: '17123456', password: 'Test@1234', category: 'Nope', rate: 300 }), 400, 'category');
    await rejects(auth.register(db, { role: 'provider', name: 'New Plumber', email: 'np@x.bt', phone: '17123456', password: 'Test@1234', category: 'Plumbing', rate: 10 }), 400, 'rate');
  });

  let newProvider, newCustomer;
  await t.test('new provider is hidden until the admin verifies, then customers can find them', async () => {
    newProvider = await auth.register(db, {
      role: 'provider', name: 'Lhaki Wangmo', email: 'Lhaki@Test.bt', phone: '17555000', location: 'Thimphu',
      password: 'Test@1234', category: 'Plumbing', rate: '320', experience: '3', bio: 'Pipes and taps'
    });
    assert.equal(newProvider.role, 'provider');
    let found = await providers.listProviders(db, { service: 'Plumbing' });
    assert.ok(!found.some(p => p.name === 'Lhaki Wangmo'), 'unverified provider must be hidden');

    const stored = await db.get('SELECT password_hash FROM service_providers WHERE provider_id = ?', [newProvider.id]);
    assert.ok(stored.password_hash.startsWith('scrypt$'), 'password must be hashed');
    assert.ok(!stored.password_hash.includes('Test@1234'));

    const pending = await admin.listProviders(db, { status: 'pending' });
    assert.ok(pending.some(p => p.id === newProvider.id && p.email === 'lhaki@test.bt'));

    await admin.setVerified(db, newProvider.id, true);
    found = await providers.listProviders(db, { service: 'Plumbing' });
    assert.ok(found.some(p => p.name === 'Lhaki Wangmo'));
    const note = (await notifications.list(db, { role: 'provider', id: newProvider.id }))[0];
    assert.equal(note.title, 'Profile Verified');
  });

  await t.test('login: one general message, role and suspension rules', async () => {
    const ok = await auth.login(db, { email: 'customer@drukserve.bt', password: 'Customer@123', role: 'customer' });
    assert.deepEqual(ok, { id: 1, role: 'customer', name: 'Pema Choden', email: 'customer@drukserve.bt', providerId: null, photo: null });
    const prov = await auth.login(db, { email: 'provider@drukserve.bt', password: 'Provider@123', role: 'provider' });
    assert.equal(prov.providerId, 1);
    const adm = await auth.login(db, { email: 'admin@drukserve.bt', password: 'Admin@123', role: 'admin' });
    assert.equal(adm.role, 'admin');

    const wrongPw = await auth.login(db, { email: 'customer@drukserve.bt', password: 'nope', role: 'customer' }).catch(e => e);
    const noUser = await auth.login(db, { email: 'ghost@drukserve.bt', password: 'nope', role: 'customer' }).catch(e => e);
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.message, noUser.message, 'must not reveal whether the email exists');

    const wrongRole = await auth.login(db, { email: 'customer@drukserve.bt', password: 'Customer@123', role: 'provider' }).catch(e => e);
    assert.equal(wrongRole.status, 403);
    assert.match(wrongRole.message, /registered as a customer/);
    await rejects(auth.login(db, { email: 'customer@drukserve.bt', role: 'customer' }), 400);
  });

  await t.test('search and provider profile', async () => {
    const all = await providers.listProviders(db, {});
    assert.equal(all.filter(p => p.id <= 8).length, 7, '7 verified seed providers (Namgay is not verified)');
    assert.ok(!all.some(p => p.name === 'Namgay Tshering'));
    assert.ok(all.every(p => p.email === undefined && p.phone === undefined), 'contact details are not public');

    assert.equal((await providers.listProviders(db, { service: 'Cleaning' })).length, 2);
    assert.equal((await providers.listProviders(db, { location: 'Paro' })).length, 1);
    assert.ok((await providers.listProviders(db, { maxPrice: '300' })).every(p => p.rate <= 300));
    assert.ok((await providers.listProviders(db, { minRating: '4.7' })).every(p => p.rating >= 4.7));
    assert.equal((await providers.listProviders(db, { sort: 'priceLow' }))[0].name, 'Pema Zangmo');
    assert.equal((await providers.listProviders(db, { sort: 'rating' }))[0].name, 'Dechen Wangmo');
    assert.equal((await providers.listProviders(db, { limit: '4' })).length, 4);
    const leaking = await providers.listProviders(db, { q: 'leaking tap' });
    assert.ok(leaking.some(p => p.name === 'Tenzin Dorji'), '"leaking tap" finds the plumber');
    // SQL injection attempt is just treated as text
    assert.deepEqual(await providers.listProviders(db, { q: "'; DROP TABLE bookings; --", service: "x' OR '1'='1" }), []);
    assert.ok(await db.get('SELECT COUNT(*) AS n FROM bookings'));

    const p2 = await providers.getProvider(db, 2);
    assert.equal(p2.reviewList.length, 1);
    assert.equal(p2.reviewList[0].customerName, 'Pema Choden');
    await rejects(providers.getProvider(db, 9999), 404);
  });

  let b1;   // the booking used for the main journey
  const monday = futureDate(1);
  const sunday = futureDate(0);

  await t.test('booking: rules and price are checked by the server', async () => {
    const base = { providerId: 1, date: monday, time: '10:00', hours: 2, address: 'Norzin Lam, Thimphu', notes: 'Fix the switch' };
    await rejects(bookings.create(db, pema, { ...base, date: '2020-01-01' }), 400, 'date');
    await rejects(bookings.create(db, pema, { ...base, date: sunday }), 400, 'date');           // provider does not work Sunday
    await rejects(bookings.create(db, pema, { ...base, time: '06:00' }), 400, 'time');          // before working hours
    await rejects(bookings.create(db, pema, { ...base, time: '17:00' }), 400, 'time');          // end time is not bookable
    await rejects(bookings.create(db, pema, { ...base, hours: 9 }), 400, 'hours');
    await rejects(bookings.create(db, pema, { ...base, address: 'x' }), 400, 'address');
    await rejects(bookings.create(db, pema, { ...base, providerId: 8 }), 409);                  // not verified
    await rejects(bookings.create(db, pema, { ...base, providerId: 9999 }), 409);

    // the browser tries to set its own price: it is ignored
    b1 = await bookings.create(db, pema, { ...base, amount: 1, totalAmount: 1 });
    assert.equal(b1.status, 'Pending');
    assert.equal(b1.amount, 800, '2 hours x Nu. 400');
    assert.equal(b1.service, 'Electrical');
    assert.equal(b1.customerId, 1);
    assert.equal(b1.date, monday);
    assert.equal(b1.time, '10:00');
    assert.equal(b1.paid, false);
    assert.equal(b1.providerPhone, '17111111');

    const note = (await notifications.list(db, sonam))[0];
    assert.equal(note.title, 'New Request');
    assert.match(note.text, /Pema Choden requested an electrical job/);
  });

  await t.test('booking: the same provider cannot be booked twice at overlapping times', async () => {
    const other = { id: 2, role: 'customer', name: 'Someone' };
    await db.run("INSERT INTO customers (name,email,phone_number,location,address,password_hash,is_suspended,created_at) VALUES ('Someone','s@x.bt','17000001','Paro','Paro town','x',0,'2026-01-01 00:00:00')");
    const clash = { providerId: 1, date: monday, time: '11:00', hours: 1, address: 'Paro town centre' };   // inside 10:00-12:00
    await rejects(bookings.create(db, other, clash), 409, 'time');
    const edge = await bookings.create(db, other, { ...clash, time: '12:00' });                            // starts when the other ends: fine
    assert.equal(edge.status, 'Pending');
    await bookings.updateStatus(db, other, edge.id, 'Cancelled');
    const again = await bookings.create(db, other, { ...clash, time: '12:00' });                           // cancelled frees the slot
    await bookings.updateStatus(db, other, again.id, 'Cancelled');
  });

  await t.test('booking: who can see and change what', async () => {
    assert.equal((await bookings.list(db, pema)).length, 5 + 0 - 0 - 0 + 0 || true, true);
    const mine = await bookings.list(db, pema);
    assert.ok(mine.every(b => b.customerId === 1));
    const theirs = await bookings.list(db, sonam);
    assert.ok(theirs.every(b => b.providerId === 1));
    assert.ok((await bookings.list(db, admin1)).length >= mine.length);
    assert.ok((await bookings.list(db, pema, { status: 'Pending,Confirmed' })).every(b => ['Pending', 'Confirmed'].includes(b.status)));
    await rejects(bookings.list(db, pema, { status: 'Hacked' }), 400);

    await rejects(bookings.getOne(db, tenzin, b1.id), 404);                        // another provider
    await rejects(bookings.getOne(db, { id: 2, role: 'customer', name: 'x' }, b1.id), 404);   // another customer
    await rejects(bookings.updateStatus(db, pema, b1.id, 'Confirmed'), 409);       // customer cannot accept
    await rejects(bookings.updateStatus(db, tenzin, b1.id, 'Confirmed'), 404);     // wrong provider
    await rejects(bookings.updateStatus(db, sonam, b1.id, 'Completed'), 409);      // must be confirmed first
    await rejects(bookings.updateStatus(db, admin1, b1.id, 'Cancelled'), 403);
    await rejects(bookings.updateStatus(db, sonam, b1.id, 'Pending'), 400);
  });

  await t.test('payment: not before the job is finished, cancelled bookings', async () => {
    await rejects(payments.pay(db, sandboxGateway, pema, { bookingId: b1.id, method: 'Bitcoin' }), 400);
    await rejects(payments.pay(db, sandboxGateway, { id: 2, role: 'customer', name: 'x' }, { bookingId: b1.id, method: 'mPay' }), 404);
    await rejects(payments.pay(db, sandboxGateway, pema, { bookingId: b1.id, method: 'mPay' }), 409);   // pay AFTER the work is done

    const date2 = futureDate(2);
    const b2 = await bookings.create(db, pema, { providerId: 1, date: date2, time: '09:00', hours: 1, address: 'Norzin Lam, Thimphu' });
    await rejects(payments.pay(db, sandboxGateway, pema, { bookingId: b2.id, method: 'Cash' }), 409);
    // cancelled bookings cannot be paid (seed booking 4)
    await rejects(payments.pay(db, sandboxGateway, pema, { bookingId: 4, method: 'mPay' }), 409);
    // customer cancels b2, provider is told
    const cancelled = await bookings.updateStatus(db, pema, b2.id, 'Cancelled');
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal((await notifications.list(db, sonam))[0].title, 'Booking Cancelled');
    await rejects(bookings.updateStatus(db, pema, b2.id, 'Cancelled'), 409);
  });

  await t.test('provider accepts, completes; customer rates; provider replies', async () => {
    await rejects(feedback.create(db, pema, { bookingId: b1.id, rating: 5 }), 409);        // not completed yet

    const accepted = await bookings.updateStatus(db, sonam, b1.id, 'Confirmed');
    assert.equal(accepted.status, 'Confirmed');
    assert.equal((await notifications.list(db, pema))[0].title, 'Job Accepted');

    const completed = await bookings.updateStatus(db, sonam, b1.id, 'Completed');
    assert.equal(completed.status, 'Completed');
    assert.equal(completed.paid, false, 'completing does not pay: the customer pays after the work');
    assert.equal(completed.payMethod, '');
    assert.equal((await notifications.list(db, pema))[0].title, 'Job Completed');
    await rejects(bookings.updateStatus(db, pema, b1.id, 'Cancelled'), 409);              // completed cannot be cancelled
    assert.equal((await providers.earnings(db, sonam)).awaiting, 800);

    // a failing gateway leaves the booking unpaid, then the customer pays online
    await rejects(payments.pay(db, liveGateway, pema, { bookingId: b1.id, method: 'BNB ePay' }), 402);
    assert.equal((await bookings.getOne(db, pema, b1.id)).paid, false);
    const paid = await payments.pay(db, sandboxGateway, pema, { bookingId: b1.id, method: 'mPay', amount: 1 });
    assert.equal(paid.paid, true);
    assert.equal(paid.payMethod, 'mPay');
    assert.match(paid.txn, /^DS\d{8}$/);
    assert.equal(paid.amount, 800);
    assert.equal((await notifications.list(db, pema))[0].title, 'Payment');
    assert.equal((await notifications.list(db, sonam))[0].title, 'Payment Received');
    await rejects(payments.pay(db, sandboxGateway, pema, { bookingId: b1.id, method: 'mPay' }), 409);
    assert.ok((await payments.listMine(db, pema)).some(h => h.bookingId === b1.id && h.status === 'Paid'));

    await rejects(feedback.create(db, pema, { bookingId: b1.id, rating: 6 }), 400, 'rating');
    const before = (await providers.getMine(db, sonam));
    const fb = await feedback.create(db, pema, { bookingId: b1.id, rating: 3, comment: 'Good work' });
    assert.equal(fb.rating, 3);
    const afterP = await providers.getMine(db, sonam);
    assert.equal(afterP.reviews, before.reviews + 1);
    const expected = Math.round(((before.rating * before.reviews + 3) / (before.reviews + 1)) * 100) / 100;
    assert.equal(afterP.rating, expected, 'the server recalculates the average');
    await rejects(feedback.create(db, pema, { bookingId: b1.id, rating: 5 }), 409);       // cannot rate twice
    assert.equal((await bookings.getOne(db, pema, b1.id)).rating, 3);
    assert.equal((await notifications.list(db, sonam))[0].title, 'New Feedback');

    await rejects(feedback.reply(db, tenzin, fb.id, { reply: 'Thanks' }), 404);           // not their review
    await rejects(feedback.reply(db, sonam, fb.id, { reply: '   ' }), 400, 'reply');
    const replied = await feedback.reply(db, sonam, fb.id, { reply: 'Thank you!' });
    assert.equal(replied.reply, 'Thank you!');
    await rejects(feedback.reply(db, sonam, fb.id, { reply: 'Again' }), 409);
    assert.equal((await notifications.list(db, pema))[0].title, 'Provider Replied');

    const mine = await feedback.list(db, sonam);
    assert.ok(mine.some(f => f.id === fb.id && f.reply));
    assert.equal((await providers.getProvider(db, 1)).reviewList[0].reply, 'Thank you!');

    const earn = await providers.earnings(db, sonam);
    assert.equal(earn.total, 800);
    assert.equal(earn.online, 800);
    assert.equal(earn.cash, 0);
    assert.equal(earn.payments[0].method, 'mPay');
    const st = await providers.stats(db, sonam);
    assert.equal(st.totalEarnings, 800);
  });

  await t.test('cash: the customer pays cash after the job is finished', async () => {
    const b = await bookings.create(db, pema, { providerId: 3, date: futureDate(3), time: '08:00', hours: 3, address: 'Norzin Lam, Thimphu' });
    const dechen = { id: 3, role: 'provider', name: 'Dechen Wangmo' };
    await bookings.updateStatus(db, dechen, b.id, 'Confirmed');
    const done = await bookings.updateStatus(db, dechen, b.id, 'Completed');
    assert.equal(done.paid, false);
    const before = await providers.earnings(db, dechen);
    const cash = await payments.pay(db, sandboxGateway, pema, { bookingId: b.id, method: 'Cash' });
    assert.equal(cash.paid, false, 'cash reported by the customer is NOT paid yet');
    assert.equal(cash.payMethod, 'Cash');
    assert.equal((await providers.earnings(db, dechen)).cash, before.cash, 'no earnings until the provider confirms');
    assert.equal((await notifications.list(db, dechen))[0].title, 'Confirm Cash Payment');
    const count = (await notifications.list(db, dechen)).length;
    await payments.pay(db, sandboxGateway, pema, { bookingId: b.id, method: 'Cash' });          // pressing it again changes nothing
    assert.equal((await notifications.list(db, dechen)).length, count);

    await rejects(payments.confirmCash(db, { id: 4, role: 'provider', name: 'Other' }, b.id), 404);   // not their job
    const paid = await payments.confirmCash(db, dechen, b.id);
    assert.equal(paid.paid, true);
    assert.equal((await providers.earnings(db, dechen)).cash, before.cash + 750);
    assert.equal((await notifications.list(db, pema))[0].title, 'Cash Payment Confirmed');
    await rejects(payments.confirmCash(db, dechen, b.id), 409);                                  // already paid
    // provider declines a pending request -> Cancelled + customer told
    const b3 = await bookings.create(db, pema, { providerId: 3, date: futureDate(4), time: '09:00', hours: 1, address: 'Norzin Lam, Thimphu' });
    await bookings.updateStatus(db, dechen, b3.id, 'Cancelled');
    assert.equal((await notifications.list(db, pema))[0].title, 'Job Declined');
  });

  await t.test('notifications belong to one person', async () => {
    const mine = await notifications.list(db, pema);
    const unread = await notifications.unreadCount(db, pema);
    assert.ok(unread > 0 && unread <= mine.length);
    const sonamsCount = await notifications.unreadCount(db, sonam);
    await notifications.markRead(db, pema, mine[0].id);
    await rejects(notifications.markRead(db, tenzin, mine[0].id), 404);                  // not theirs
    assert.equal(await notifications.unreadCount(db, pema), unread - (mine[0].read ? 0 : 1));
    await notifications.markAllRead(db, pema);
    assert.equal(await notifications.unreadCount(db, pema), 0);
    assert.equal(await notifications.unreadCount(db, sonam), sonamsCount, 'other people are not affected');
    await notifications.clearAll(db, pema);
    assert.equal((await notifications.list(db, pema)).length, 0);
    assert.ok((await notifications.list(db, sonam)).length > 0);
    assert.deepEqual(await notifications.list(db, admin1), []);
  });

  await t.test('profile and password', async () => {
    await rejects(profile.updateProfile(db, pema, { name: 'Pema Choden', phone: '123', address: 'Norzin Lam, Thimphu', location: 'Thimphu' }), 400, 'phone');
    const updated = await profile.updateProfile(db, pema, { name: 'Pema C. Choden', phone: '+97517999000', address: 'Chang Lam, Thimphu', location: 'Paro' });
    assert.equal(updated.name, 'Pema C. Choden');
    assert.equal(updated.location, 'Paro');
    assert.equal(updated.password_hash, undefined, 'never send the hash');
    await rejects(profile.updateProfile(db, admin1, { name: 'x' }), 403);

    await rejects(profile.changePassword(db, pema, { currentPassword: 'wrong', newPassword: 'New@12345' }), 400, 'currentPassword');
    await rejects(profile.changePassword(db, pema, { currentPassword: 'Customer@123', newPassword: 'weak' }), 400, 'newPassword');
    await rejects(profile.changePassword(db, pema, { currentPassword: 'Customer@123', newPassword: 'Customer@123' }), 400, 'newPassword');
    await profile.changePassword(db, pema, { currentPassword: 'Customer@123', newPassword: 'New@12345' });
    await rejects(auth.login(db, { email: 'customer@drukserve.bt', password: 'Customer@123', role: 'customer' }), 401);
    assert.equal((await auth.login(db, { email: 'customer@drukserve.bt', password: 'New@12345', role: 'customer' })).id, 1);
  });

  await t.test('provider "My Services": validation, availability hides the provider', async () => {
    const good = { category: 'Electrical', rate: 450, experience: 7, bio: 'Updated bio', available: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '16:00' };
    await rejects(providers.updateServices(db, sonam, { ...good, rate: 10 }), 400, 'rate');
    await rejects(providers.updateServices(db, sonam, { ...good, from: '16:00', to: '09:00' }), 400, 'to');
    await rejects(providers.updateServices(db, sonam, { ...good, days: [] }), 400, 'days');
    await rejects(providers.updateServices(db, sonam, { ...good, category: 'Nope' }), 400, 'category');
    const saved = await providers.updateServices(db, sonam, good);
    assert.equal(saved.rate, 450);
    assert.deepEqual(saved.days, [1, 2, 3, 4, 5]);
    assert.equal(saved.from, '09:00');
    // Saturday is now a non-working day
    await rejects(bookings.create(db, { id: 2, role: 'customer', name: 'x' }, { providerId: 1, date: futureDate(6), time: '10:00', hours: 1, address: 'Paro town centre' }), 400, 'date');

    await providers.updateServices(db, sonam, { ...good, available: false, days: [] });
    assert.ok(!(await providers.listProviders(db, {})).some(p => p.id === 1), 'not accepting bookings = hidden from search');
    await rejects(bookings.create(db, pema, { providerId: 1, date: monday, time: '10:00', hours: 1, address: 'Norzin Lam, Thimphu' }), 409);
    await providers.updateServices(db, sonam, good);
  });

  await t.test('admin: overview, reports, suspend, categories', async () => {
    const ov = await admin.overview(db);
    assert.equal(ov.stats.customers, 2);
    assert.equal(ov.stats.providers, 9);
    assert.equal(ov.stats.awaitingVerification, 1);        // Namgay
    assert.ok(ov.stats.completedJobs >= 3);
    assert.equal(ov.recentBookings.length, 5);

    const rp = await admin.reports(db);
    assert.deepEqual(rp.bookingsByStatus.map(s => s.label), ['Pending', 'Confirmed', 'Completed', 'Cancelled']);
    assert.equal(rp.bookingsByStatus.reduce((s, x) => s + x.value, 0), ov.stats.totalBookings);
    assert.ok(rp.revenueByCategory.length > 0);
    assert.ok(rp.payments.online.amount >= 1500);           // 700 seeded + 800 paid in this test
    assert.ok(rp.topProviders.length <= 5 && rp.topProviders[0].earned >= rp.topProviders[1].earned);

    const users = await admin.listUsers(db, { role: 'customer', q: 'pema' });
    assert.ok(users.length >= 1 && users.every(u => u.role === 'customer'));
    assert.equal((await admin.listUsers(db, { role: 'provider' })).length, 9);

    // suspending: the next request is refused and login is blocked
    assert.ok(await auth.loadAccount(db, 'customer', 1));
    await admin.setSuspended(db, 'customer', 1, true);
    assert.equal(await auth.loadAccount(db, 'customer', 1), null);
    await rejects(auth.login(db, { email: 'customer@drukserve.bt', password: 'New@12345', role: 'customer' }), 403);
    await admin.setSuspended(db, 'customer', 1, false);
    assert.ok(await auth.loadAccount(db, 'customer', 1));
    await rejects(admin.setSuspended(db, 'admin', 1, true), 404);
    await rejects(admin.setSuspended(db, 'customer', 999, true), 404);
    await admin.setSuspended(db, 'provider', 7, true);
    assert.ok(!(await providers.listProviders(db, {})).some(p => p.id === 7), 'suspended provider disappears from search');
    await admin.setSuspended(db, 'provider', 7, false);

    // revoke verification
    await admin.setVerified(db, 5, false);
    assert.ok(!(await providers.listProviders(db, {})).some(p => p.id === 5));
    await admin.setVerified(db, 5, true);

    // categories
    assert.equal((await categories.list(db)).length, 7);
    await rejects(categories.create(db, { name: 'plumbing', desc: 'dup', icon: 'bi-tools' }), 400, 'name');
    await rejects(categories.create(db, { name: 'Ab', desc: '', icon: 'bi-tools' }), 400, 'name');
    const garden = await categories.create(db, { name: 'Gardening', desc: 'Lawns and plants', icon: 'bi-tree-fill' });
    assert.equal((await categories.list(db)).length, 8);
    await categories.update(db, garden.id, { name: 'Garden Care', desc: 'Lawns, plants', icon: 'bi-tree-fill' });
    assert.equal((await categories.list(db))[7].name, 'Garden Care');
    await rejects(categories.remove(db, 1), 409);                                   // Plumbing is used by providers
    await categories.remove(db, garden.id);
    assert.equal((await categories.list(db)).length, 7);
    // renaming a used category shows up everywhere without extra work
    await categories.update(db, 2, { name: 'Electrical Works', desc: 'Wiring', icon: 'bi-lightning-charge-fill' });
    assert.equal((await providers.getMine(db, sonam)).category, 'Electrical Works');
    assert.equal((await bookings.getOne(db, sonam, b1.id)).service, 'Electrical Works');
  });
});