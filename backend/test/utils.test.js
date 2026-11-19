'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../src/utils/password');
const v = require('../src/utils/validate');
const d = require('../src/utils/dates');
const { money } = require('../src/utils/format');
const { toProvider, toBooking } = require('../src/utils/serialize');

test('passwords are hashed, salted and verified', async () => {
  const h1 = await hashPassword('Test@1234');
  const h2 = await hashPassword('Test@1234');
  assert.notEqual(h1, h2, 'same password must give different hashes (salt)');
  assert.ok(!h1.includes('Test@1234'));
  assert.equal(await verifyPassword('Test@1234', h1), true);
  assert.equal(await verifyPassword('test@1234', h1), false);
  assert.equal(await verifyPassword('Test@1234', 'garbage'), false);
});

test('password rule: 8+ characters, a number and a symbol (document 4.2.4)', () => {
  assert.equal(v.isStrongPassword('abc'), false);
  assert.equal(v.isStrongPassword('abcdefgh'), false);
  assert.equal(v.isStrongPassword('abcdefg1'), false);
  assert.equal(v.isStrongPassword('Test@1234'), true);
  assert.equal(v.isStrongPassword(12345678), false);
});

test('phone, email and number checks match the frontend', () => {
  assert.equal(v.isPhone('17123456'), true);
  assert.equal(v.isPhone('+97517123456'), true);
  assert.equal(v.isPhone('1712345'), false);
  assert.equal(v.isPhone('abcdefgh'), false);
  assert.equal(v.isEmail('a@b.bt'), true);
  assert.equal(v.isEmail('not-an-email'), false);
  assert.equal(v.toInt('3'), 3);
  assert.ok(Number.isNaN(v.toInt('3.5')));
  assert.ok(Number.isNaN(v.toInt('abc')));
  assert.equal(v.toNumber('300.50'), 300.5);
  assert.ok(Number.isNaN(v.toNumber('-5')));
});

test('dates: Bhutan time, weekday, validation', () => {
  // 20:00 UTC on 1 Nov is already 2 Nov in Bhutan (UTC+6)
  assert.equal(d.todayISO(new Date('2026-11-01T20:00:00Z')), '2026-11-02');
  assert.equal(d.nowTime(new Date('2026-11-01T20:05:00Z')), '02:05');
  assert.equal(d.weekday('2026-11-02'), 1);   // Monday
  assert.equal(d.weekday('2026-11-08'), 0);   // Sunday
  assert.equal(d.isValidDate('2026-02-30'), false);
  assert.equal(d.isValidDate('2026-11-02'), true);
  assert.equal(d.isValidTime('24:00'), false);
  assert.equal(d.isValidTime('09:30'), true);
  assert.equal(d.niceDate('2026-11-02'), '2 Nov 2026');
  assert.equal(d.nowSql(new Date('2026-11-02T08:15:30Z')), '2026-11-02 08:15:30');
});

test('timeAgo gives the same style as the frontend notification page', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(d.timeAgo('2026-11-02 11:59:30', now), 'Just now');
  assert.equal(d.timeAgo('2026-11-02 11:30:00', now), '30m ago');
  assert.equal(d.timeAgo('2026-11-02 10:00:00', now), '2h ago');
  assert.equal(d.timeAgo('2026-11-01 10:00:00', now), 'Yesterday');
  assert.equal(d.timeAgo('2026-10-30 10:00:00', now), '3 days ago');
});

test('money and serializers', () => {
  assert.equal(money(1500), 'Nu. 1,500');
  const p = toProvider({
    provider_id: 1, name: 'A', email: 'a@b.bt', phone_number: '17111111', service_name: 'Plumbing',
    rating: '4.80', reviews_count: 3, experience_years: 2, hourly_rate: '350.00', location: 'Paro', bio: null,
    is_verified: 1, is_available: 1, is_suspended: 0, work_days: '1,2,3', work_from: '08:00', work_to: '17:00'
  });
  assert.equal(p.rating, 4.8);
  assert.equal(p.rate, 350);
  assert.deepEqual(p.days, [1, 2, 3]);
  assert.equal(p.email, undefined, 'email must NOT be public');
  const b = toBooking({
    booking_id: 1, customer_id: 2, provider_id: 3, service_name: 'Plumbing', booking_date: '2026-11-02 10:00:00',
    hours: 2, service_address: 'x', notes: null, total_amount: '700.00', status: 'Pending',
    pay_method: 'mPay', pay_status: 'Failed', pay_ref: null, fb_rating: null
  });
  assert.equal(b.date, '2026-11-02');
  assert.equal(b.time, '10:00');
  assert.equal(b.payMethod, '', 'a failed online payment shows "Pay Now" again');
  assert.equal(b.paid, false);
  assert.equal(b.rating, null);
});
