'use strict';
// Bookings (document 3.3.3 "Book a service by selecting a date, time and address" + "Track booking status";
// 3.3.2 "Receive, accept or decline service booking requests"; frontend js/booking.js and js/provider.js).
//
// Status flow (document 3.7 Booking Table):
//   Pending --provider accepts--> Confirmed --provider marks done--> Completed
//   Pending / Confirmed --customer cancels--> Cancelled          Pending --provider declines--> Cancelled

const { BOOKING_SELECT } = require('../db/queries');
const { PROVIDER_SELECT } = require('../db/queries');
const { toBooking } = require('../utils/serialize');
const { parseDays } = require('../utils/serialize');
const dates = require('../utils/dates');
const { str, toInt, Validator } = require('../utils/validate');
const { AppError, notFound, forbidden, conflict } = require('../utils/errors');
const { MAX_HOURS, ALL_STATUSES, ACTIVE_STATUSES } = require('../constants');
const { withArticle } = require('../utils/format');
const notifications = require('./notifications');

// Who may change a booking from which status to which status
const ALLOWED_CHANGES = {
  customer: { Pending: ['Cancelled'], Confirmed: ['Cancelled'] },
  provider: { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['Completed'] }
};

const canSee = (actor, row) =>
  actor.role === 'admin' ||
  (actor.role === 'customer' && row.customer_id === actor.id) ||
  (actor.role === 'provider' && row.provider_id === actor.id);

async function getOne(db, actor, id) {
  const row = await db.get(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [id]);
  if (!row || !canSee(actor, row)) throw notFound('Booking not found.');   // same answer for "missing" and "not yours"
  return toBooking(row);
}

// Customers see their bookings, providers see theirs, the admin sees all. Optional ?status=Pending,Confirmed
async function list(db, actor, query = {}) {
  const where = [];
  const params = [];
  if (actor.role === 'customer') { where.push('b.customer_id = ?'); params.push(actor.id); }
  if (actor.role === 'provider') { where.push('b.provider_id = ?'); params.push(actor.id); }

  if (str(query.status)) {
    const wanted = str(query.status).split(',').map(s => s.trim()).filter(Boolean);
    if (wanted.length === 0 || wanted.some(s => !ALL_STATUSES.includes(s))) {
      throw new AppError(400, `Status must be one of: ${ALL_STATUSES.join(', ')}.`);
    }
    where.push(`b.status IN (${wanted.map(() => '?').join(', ')})`);
    params.push(...wanted);
  }

  const rows = await db.all(
    `${BOOKING_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY b.booking_date DESC, b.booking_id DESC`, params);
  return rows.map(toBooking);
}

/* ---------------- create ---------------- */
// The price is worked out HERE from the provider's rate. The browser's price is never trusted.
async function create(db, actor, input = {}, now = new Date()) {
  const v = new Validator();
  const providerId = toInt(input.providerId);
  const date = str(input.date);
  const time = str(input.time);
  const hours = toInt(input.hours === undefined || input.hours === '' ? 1 : input.hours);
  const address = str(input.address);
  const notes = str(input.notes);

  if (!(providerId >= 1)) v.fail('providerId', 'Choose a provider.');
  if (!dates.isValidDate(date)) v.fail('date', 'Choose a date.');
  else if (date < dates.todayISO(now)) v.fail('date', 'Choose today or a future date.');
  if (!dates.isValidTime(time)) v.fail('time', 'Choose a time.');
  if (!(hours >= 1 && hours <= MAX_HOURS)) v.fail('hours', `Choose 1 to ${MAX_HOURS} hours.`);
  if (address.length < 5 || address.length > 255) v.fail('address', 'Enter the full address (at least 5 characters).');
  if (notes.length > 500) v.fail('notes', 'Keep the notes under 500 characters.');
  v.throwIfInvalid();

  const bookingId = await db.transaction(async tx => {
    // Lock this provider's row for the rest of the transaction. If two customers try to book the same
    // provider at the same moment, the second one waits here, then sees the first booking in the clash check.
    await tx.run('UPDATE service_providers SET provider_id = provider_id WHERE provider_id = ?', [providerId]);

    const p = await tx.get(`${PROVIDER_SELECT} WHERE p.provider_id = ?`, [providerId]);
    if (!p || !p.is_verified || !p.is_available || p.is_suspended) {
      throw new AppError(409, 'This provider is not available for booking.');
    }

    const fail = new Validator();
    if (!parseDays(p.work_days).includes(dates.weekday(date))) fail.fail('date', 'This provider does not work on that day.');
    if (time < p.work_from || time >= p.work_to) {
      fail.fail('time', `Choose a time between ${p.work_from} and ${p.work_to}.`);
    }
    if (date === dates.todayISO(now) && time <= dates.nowTime(now)) fail.fail('time', 'That time has already passed today.');
    fail.throwIfInvalid();

    // Clash check: the provider cannot be booked twice at overlapping times.
    const start = dates.toMinutes(time);
    const end = start + hours * 60;
    const sameDay = await tx.all(
      `SELECT booking_date, hours FROM bookings
        WHERE provider_id = ? AND status IN ('Pending', 'Confirmed') AND booking_date >= ? AND booking_date <= ?`,
      [providerId, `${date} 00:00:00`, `${date} 23:59:59`]);
    const clash = sameDay.some(b => {
      const s = dates.toMinutes(String(b.booking_date).slice(11, 16));
      return start < s + b.hours * 60 && s < end;
    });
    if (clash) throw conflict('This provider is already booked at that time. Please choose another time.', { time: 'Already booked.' });

    const total = Number(p.hourly_rate) * hours;
    const result = await tx.run(
      `INSERT INTO bookings (customer_id, provider_id, service_id, booking_date, hours, service_address, notes,
                             total_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [actor.id, providerId, p.service_id, `${date} ${time}:00`, hours, address, notes, total, dates.nowSql(now)]);

    await notifications.add(tx, { role: 'provider', id: providerId }, {
      icon: 'bi-calendar-plus',
      title: 'New Request',
      message: `${actor.name} requested ${withArticle(p.service_name.toLowerCase())} job on ${dates.niceDate(date)}.`,
      related: { type: 'booking', id: result.insertId }
    }, now);
    return result.insertId;
  });

  return getOne(db, actor, bookingId);
}

/* ---------------- change status ---------------- */
async function updateStatus(db, actor, id, newStatus, now = new Date()) {
  if (actor.role === 'admin') throw forbidden('The admin cannot change a booking.');
  if (!ALL_STATUSES.includes(newStatus) || newStatus === 'Pending') {
    throw new AppError(400, 'Status must be Confirmed, Completed or Cancelled.', { status: 'Invalid status.' });
  }

  await db.transaction(async tx => {
    const b = await tx.get(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [id]);
    if (!b || !canSee(actor, b)) throw notFound('Booking not found.');

    const allowed = (ALLOWED_CHANGES[actor.role] || {})[b.status] || [];
    if (!allowed.includes(newStatus)) {
      throw conflict(`A ${b.status.toLowerCase()} booking cannot be changed to ${newStatus.toLowerCase()}.`);
    }

    // "AND status = ?" makes sure nobody changed it a moment ago (for example the customer cancelled while the provider accepted)
    const changed = await tx.run(
      'UPDATE bookings SET status = ?, updated_at = ? WHERE booking_id = ? AND status = ?',
      [newStatus, dates.nowSql(now), id, b.status]);
    if (!changed.affectedRows) throw conflict('This booking was just changed. Please refresh the page.');

    const service = b.service_name.toLowerCase();
    const toCustomer = { role: 'customer', id: b.customer_id };
    const toProvider = { role: 'provider', id: b.provider_id };

    if (newStatus === 'Confirmed') {
      await notifications.add(tx, toCustomer, {
        icon: 'bi-check-circle-fill', title: 'Job Accepted',
        message: `Your ${service} job has been accepted by ${b.provider_name}.`,
        related: { type: 'booking', id }
      }, now);
    }

    if (newStatus === 'Cancelled' && actor.role === 'provider') {
      await notifications.add(tx, toCustomer, {
        icon: 'bi-x-circle-fill', title: 'Job Declined',
        message: `${b.provider_name} could not take your ${service} job. Please book another provider.`,
        related: { type: 'booking', id }
      }, now);
    }

    if (newStatus === 'Cancelled' && actor.role === 'customer') {
      await notifications.add(tx, toProvider, {
        icon: 'bi-x-circle-fill', title: 'Booking Cancelled',
        message: `A customer cancelled ${withArticle(service)} booking.`,
        related: { type: 'booking', id }
      }, now);
    }

    if (newStatus === 'Completed') {
      await notifications.add(tx, toCustomer, {
        icon: 'bi-tools', title: 'Job Completed',
        message: `Your ${service} job has been completed. Please pay and rate the service.`,
        related: { type: 'booking', id }
      }, now);
    }
  });

  return getOne(db, actor, id);
}

module.exports = { list, getOne, create, updateStatus, ACTIVE_STATUSES };