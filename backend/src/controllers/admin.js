'use strict';
// Admin module (document 3.3.1 and 2.2 "Admin Module": user management, provider verification,
// category management, reports; frontend js/admin.js). Every route here needs the admin role.

const { PROVIDER_SELECT, BOOKING_SELECT, TABLES } = require('../db/queries');
const { toProvider, toBooking } = require('../utils/serialize');
const { notFound, AppError } = require('../utils/errors');
const { str } = require('../utils/validate');
const notifications = require('./notifications');

/* ---------------- Overview tab ---------------- */
async function overview(db) {
  const n = async sql => Number((await db.get(sql)).n);
  const revenue = await db.get("SELECT COALESCE(SUM(total_amount), 0) AS v FROM bookings WHERE status = 'Completed'");
  const pending = await db.all(`${PROVIDER_SELECT} WHERE p.is_verified = 0 ORDER BY p.provider_id`);
  const recent = await db.all(`${BOOKING_SELECT} ORDER BY b.booking_id DESC LIMIT 5`);

  return {
    stats: {
      customers: await n('SELECT COUNT(*) AS n FROM customers'),
      providers: await n('SELECT COUNT(*) AS n FROM service_providers'),
      awaitingVerification: pending.length,
      totalBookings: await n('SELECT COUNT(*) AS n FROM bookings'),
      completedJobs: await n("SELECT COUNT(*) AS n FROM bookings WHERE status = 'Completed'"),
      completedValue: Number(revenue.v)
    },
    pendingProviders: pending.map(r => toProvider(r, { includeContact: true })),
    recentBookings: recent.map(toBooking)
  };
}

/* ---------------- Provider Verification tab ---------------- */
async function listProviders(db, query = {}) {
  let where = '';
  if (query.status === 'pending') where = ' WHERE p.is_verified = 0';
  if (query.status === 'verified') where = ' WHERE p.is_verified = 1';
  const rows = await db.all(`${PROVIDER_SELECT}${where} ORDER BY p.provider_id`);
  return rows.map(r => toProvider(r, { includeContact: true }));
}

async function setVerified(db, providerId, verified, now = new Date()) {
  if (typeof verified !== 'boolean') throw new AppError(400, 'Send { "verified": true } or { "verified": false }.');
  const p = await db.get('SELECT provider_id, name FROM service_providers WHERE provider_id = ?', [providerId]);
  if (!p) throw notFound('Provider not found.');

  await db.transaction(async tx => {
    await tx.run('UPDATE service_providers SET is_verified = ? WHERE provider_id = ?', [verified, providerId]);
    await notifications.add(tx, { role: 'provider', id: providerId }, verified
      ? { icon: 'bi-patch-check-fill', title: 'Profile Verified', message: 'Your profile has been verified. Customers can now book you.' }
      : { icon: 'bi-exclamation-triangle-fill', title: 'Verification Removed', message: 'Your verification was removed by the admin.' }, now);
  });
  const row = await db.get(`${PROVIDER_SELECT} WHERE p.provider_id = ?`, [providerId]);
  return toProvider(row, { includeContact: true });
}

/* ---------------- Users tab ---------------- */
// Customers and providers (not admins). Query: role (customer | provider), q (search in name / email)
async function listUsers(db, query = {}) {
  const role = str(query.role);
  const q = str(query.q).toLowerCase();

  const counts = async (column) => {
    const rows = await db.all(`SELECT ${column} AS id, COUNT(*) AS n FROM bookings GROUP BY ${column}`);
    return new Map(rows.map(r => [r.id, Number(r.n)]));
  };

  const users = [];
  if (!role || role === 'customer') {
    const bookingCount = await counts('customer_id');
    const rows = await db.all('SELECT customer_id, name, email, phone_number, location, is_suspended FROM customers ORDER BY customer_id');
    rows.forEach(r => users.push({
      id: r.customer_id, role: 'customer', name: r.name, email: r.email, phone: r.phone_number,
      location: r.location, suspended: !!r.is_suspended, bookings: bookingCount.get(r.customer_id) || 0
    }));
  }
  if (!role || role === 'provider') {
    const bookingCount = await counts('provider_id');
    const rows = await db.all('SELECT provider_id, name, email, phone_number, location, is_suspended FROM service_providers ORDER BY provider_id');
    rows.forEach(r => users.push({
      id: r.provider_id, role: 'provider', providerId: r.provider_id, name: r.name, email: r.email, phone: r.phone_number,
      location: r.location, suspended: !!r.is_suspended, bookings: bookingCount.get(r.provider_id) || 0
    }));
  }
  return q ? users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(q)) : users;
}

// A suspended person cannot log in, and their next request is refused (see controllers/auth.js loadAccount).
async function setSuspended(db, role, id, suspended) {
  if (role !== 'customer' && role !== 'provider') throw notFound('User not found.');
  if (typeof suspended !== 'boolean') throw new AppError(400, 'Send { "suspended": true } or { "suspended": false }.');
  const { table, idColumn } = TABLES[role];
  const row = await db.get(`SELECT ${idColumn} AS id, name FROM ${table} WHERE ${idColumn} = ?`, [id]);
  if (!row) throw notFound('User not found.');
  await db.run(`UPDATE ${table} SET is_suspended = ? WHERE ${idColumn} = ?`, [suspended, id]);
  return { id: row.id, role, name: row.name, suspended };
}

/* ---------------- Reports tab (document 3.3.1 "View and generate reports on bookings, payments and user activity") ---------------- */
async function reports(db) {
  const rows = await db.all(
    `SELECT b.status, b.total_amount, s.name AS service_name, pay.method AS pay_method, pay.status AS pay_status
       FROM bookings b
       JOIN services s ON s.service_id = b.service_id
       LEFT JOIN payments pay ON pay.booking_id = b.booking_id`);
  const amount = r => Number(r.total_amount);
  const sum = list => list.reduce((s, r) => s + amount(r), 0);
  const group = (list, key, value) => {
    const o = {};
    list.forEach(r => { o[r[key]] = (o[r[key]] || 0) + value(r); });
    return Object.entries(o).map(([label, v]) => ({ label, value: v })).sort((a, b) => b.value - a.value);
  };

  const byStatus = ['Pending', 'Confirmed', 'Completed', 'Cancelled']
    .map(s => ({ label: s, value: rows.filter(r => r.status === s).length }));

  const paid = rows.filter(r => r.pay_status === 'Paid');
  const online = paid.filter(r => r.pay_method !== 'Cash');
  const cash = paid.filter(r => r.pay_method === 'Cash');
  const waiting = rows.filter(r => r.pay_status !== 'Paid' && r.status !== 'Cancelled');

  const top = await db.all(
    `SELECT p.provider_id, p.name, s.name AS service_name, p.rating, p.reviews_count,
            COUNT(b.booking_id) AS jobs, COALESCE(SUM(b.total_amount), 0) AS earned
       FROM service_providers p
       JOIN services s ON s.service_id = p.service_id
       LEFT JOIN bookings b ON b.provider_id = p.provider_id AND b.status = 'Completed'
      GROUP BY p.provider_id, p.name, s.name, p.rating, p.reviews_count
      ORDER BY earned DESC, p.rating DESC
      LIMIT 5`);

  return {
    bookingsByStatus: byStatus,
    bookingsByCategory: group(rows, 'service_name', () => 1),
    revenueByCategory: group(rows.filter(r => r.status === 'Completed'), 'service_name', amount),
    payments: {
      online:  { count: online.length,  amount: sum(online) },
      cash:    { count: cash.length,    amount: sum(cash) },
      notPaid: { count: waiting.length, amount: sum(waiting) }
    },
    topProviders: top.map(r => ({
      id: r.provider_id, name: r.name, category: r.service_name, rating: Number(r.rating),
      reviews: r.reviews_count, jobs: Number(r.jobs), earned: Number(r.earned)
    }))
  };
}

module.exports = { overview, listProviders, setVerified, listUsers, setSuspended, reports };
