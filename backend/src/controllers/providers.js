'use strict';
// Provider search / profile for customers (document 3.3.3 "Browse services by category, location, price or rating",
// "View detailed profiles of service providers"; frontend js/customer.js)
// and the provider's own pages: My Services, Earnings, Dashboard numbers (document 3.3.2; frontend js/provider.js).

const { PROVIDER_SELECT, REVIEW_SELECT } = require('../db/queries');
const { toProvider, toFeedback } = require('../utils/serialize');
const { todayISO, isValidTime, toBhutanParts } = require('../utils/dates');
const { str, toInt, toNumber, Validator } = require('../utils/validate');
const { notFound } = require('../utils/errors');
const { MIN_RATE, MAX_RATE, MAX_EXPERIENCE } = require('../constants');

/* ---------------- search (public: the landing page also shows top providers) ---------------- */
// Customers only see providers that are verified, accepting bookings and not suspended.
// Query: q, service, location, maxPrice, minRating, sort (rating | priceLow | priceHigh | experience), limit
async function listProviders(db, query = {}) {
  const where = ['p.is_verified = 1', 'p.is_available = 1', 'p.is_suspended = 0'];
  const params = [];

  // Same keyword rule as the frontend: any word (first 4 letters) found in name, category, bio or location.
  // So "leaking tap" still finds "Fixes leaks, installs taps".
  const words = str(query.q).toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 3).map(w => w.slice(0, 4));
  if (words.length) {
    const one = '(LOWER(p.name) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(p.bio) LIKE ? OR LOWER(p.location) LIKE ?)';
    where.push('(' + words.map(() => one).join(' OR ') + ')');
    words.forEach(w => { const like = `%${w}%`; params.push(like, like, like, like); });
  }
  if (str(query.service))  { where.push('s.name = ?');          params.push(str(query.service)); }
  if (str(query.location)) { where.push('p.location = ?');      params.push(str(query.location)); }
  const maxPrice = toNumber(query.maxPrice);
  if (maxPrice > 0) { where.push('p.hourly_rate <= ?'); params.push(maxPrice); }
  const minRating = toNumber(query.minRating);
  if (minRating > 0) { where.push('p.rating >= ?'); params.push(minRating); }

  // The text after ORDER BY comes from this fixed list, never from the user.
  const sorts = {
    rating:     'p.rating DESC, p.reviews_count DESC',
    priceLow:   'p.hourly_rate ASC',
    priceHigh:  'p.hourly_rate DESC',
    experience: 'p.experience_years DESC'
  };
  const order = sorts[query.sort] || sorts.rating;

  let limit = '';
  const n = toInt(query.limit);
  if (n >= 1 && n <= 100) limit = ` LIMIT ${n}`;   // n is a checked whole number, safe to write into the text

  const rows = await db.all(`${PROVIDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}, p.provider_id ASC${limit}`, params);
  return rows.map(r => toProvider(r));
}

// One provider with their reviews (provider-profile.html). Email and phone are not shown publicly.
async function getProvider(db, id) {
  const row = await db.get(`${PROVIDER_SELECT} WHERE p.provider_id = ? AND p.is_suspended = 0`, [id]);
  if (!row) throw notFound('Provider not found.');
  const reviews = await db.all(
    `${REVIEW_SELECT} WHERE b.provider_id = ? ORDER BY f.feedback_date DESC, f.feedback_id DESC`, [id]);
  return { ...toProvider(row), reviewList: reviews.map(toFeedback) };
}

/* ---------------- the provider's own pages ---------------- */
async function getMine(db, actor) {
  const row = await db.get(`${PROVIDER_SELECT} WHERE p.provider_id = ?`, [actor.id]);
  if (!row) throw notFound('Your provider profile was not found.');
  return toProvider(row, { includeContact: true });
}

// "My Services" page: category, rate, experience, about, working days and hours, accepting bookings.
async function updateServices(db, actor, input = {}) {
  const v = new Validator();

  const service = await db.get('SELECT service_id FROM services WHERE name = ?', [str(input.category)]);
  if (!service) v.fail('category', 'Choose a service category from the list.');

  const rate = toNumber(input.rate);
  if (!(rate >= MIN_RATE && rate <= MAX_RATE)) v.fail('rate', `Rate must be at least Nu. ${MIN_RATE} per hour.`);

  const experience = toInt(input.experience);
  if (!(experience >= 0 && experience <= MAX_EXPERIENCE)) v.fail('experience', `Experience must be 0 to ${MAX_EXPERIENCE} years.`);

  const bio = str(input.bio);
  if (bio.length > 500) v.fail('bio', 'Keep the description under 500 characters.');

  if (typeof input.available !== 'boolean') v.fail('available', 'Say if you are accepting new bookings.');

  const days = Array.isArray(input.days) ? [...new Set(input.days.map(toInt))] : [];
  if (days.some(d => !(d >= 0 && d <= 6))) v.fail('days', 'Working days must be between 0 (Sunday) and 6 (Saturday).');
  if (input.available === true && days.length === 0) v.fail('days', 'Choose at least one working day.');

  const from = str(input.from), to = str(input.to);
  if (!isValidTime(from) || !isValidTime(to) || !(from < to)) v.fail('to', 'The end time must be after the start time.');
  v.throwIfInvalid();

  await db.run(
    `UPDATE service_providers
        SET service_id = ?, hourly_rate = ?, experience_years = ?, bio = ?, is_available = ?,
            work_days = ?, work_from = ?, work_to = ?
      WHERE provider_id = ?`,
    [service.service_id, rate, experience, bio, input.available, days.sort().join(','), from, to, actor.id]
  );
  return getMine(db, actor);
}

// Earnings page (frontend js/provider.js EARNINGS): completed jobs and totals, worked out on the server.
async function earnings(db, actor) {
  const rows = await db.all(
    `SELECT b.booking_id, b.booking_date, b.total_amount, c.name AS customer_name, s.name AS service_name,
            pay.method AS pay_method, pay.status AS pay_status, pay.transaction_ref AS pay_ref, pay.payment_date AS pay_date, pay.payment_id
       FROM bookings b
       JOIN customers c ON c.customer_id = b.customer_id
       JOIN services s  ON s.service_id  = b.service_id
       LEFT JOIN payments pay ON pay.booking_id = b.booking_id
      WHERE b.provider_id = ? AND b.status = 'Completed'
      ORDER BY pay.payment_date DESC, pay.payment_id DESC, b.booking_id DESC`, [actor.id]);   // newest payment first

  const paidRows = rows.filter(r => r.pay_status === 'Paid');
  const waitingRows = rows.filter(r => r.pay_status !== 'Paid');
  const payments = paidRows.map(r => ({
    bookingId: r.booking_id,
    date: toBhutanParts(r.pay_date).date,          // the day the payment was received, not the day of the job
    time: toBhutanParts(r.pay_date).time,
    customerName: r.customer_name,
    service: r.service_name,
    method: r.pay_method || 'Cash',
    txn: r.pay_ref || null,
    amount: Number(r.total_amount)
  }));
  const sum = list => list.reduce((s, p) => s + p.amount, 0);
  const upcoming = await db.get(
    "SELECT COALESCE(SUM(total_amount), 0) AS v FROM bookings WHERE provider_id = ? AND status = 'Confirmed'", [actor.id]);

  return {
    total: sum(payments),
    online: sum(payments.filter(p => p.method !== 'Cash')),
    cash: sum(payments.filter(p => p.method === 'Cash')),
    upcoming: Number(upcoming.v),
    awaiting: waitingRows.reduce((t, r) => t + Number(r.total_amount), 0),   // finished jobs the customer has not paid yet
    payments
  };
}

// The four numbers at the top of the provider dashboard.
async function stats(db, actor, now = new Date()) {
  const rows = await db.all(
    'SELECT status, COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS amount FROM bookings WHERE provider_id = ? GROUP BY status', [actor.id]);
  const by = s => rows.find(r => r.status === s) || { n: 0, amount: 0 };
  const today = todayISO(now);
  const todays = await db.get(
    `SELECT COUNT(*) AS n FROM bookings
      WHERE provider_id = ? AND status = 'Confirmed' AND booking_date >= ? AND booking_date <= ?`,
    [actor.id, `${today} 00:00:00`, `${today} 23:59:59`]);
  const paidTotal = await db.get(
    `SELECT COALESCE(SUM(b.total_amount), 0) AS v FROM bookings b JOIN payments pay ON pay.booking_id = b.booking_id
      WHERE b.provider_id = ? AND b.status = 'Completed' AND pay.status = 'Paid'`, [actor.id]);
  return {
    todaysJobs: Number(todays.n),
    confirmedJobs: Number(by('Confirmed').n),
    pendingRequests: Number(by('Pending').n),
    totalEarnings: Number(paidTotal.v)            // only jobs the customer has paid for
  };
}

module.exports = { listProviders, getProvider, getMine, updateServices, earnings, stats };