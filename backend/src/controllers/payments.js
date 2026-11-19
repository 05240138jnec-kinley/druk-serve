'use strict';
// Payments (document 3.3.3 "Make secure online payments", 4.2.6 Payment Page; frontend js/booking.js PAYMENT PAGE).
// The customer pays AFTER the provider marks the job Completed (pay after the work is done).
//   Cash   -> the customer handed the money to the provider; the payment is saved as "Paid".
//   Online -> the gateway charges the customer. The payment is saved as "Paid" (or "Failed").
// The amount always comes from the booking in the database, never from the browser.

const { BOOKING_SELECT } = require('../db/queries');
const { toBooking } = require('../utils/serialize');
const { nowSql } = require('../utils/dates');
const { money } = require('../utils/format');
const { PAYMENT_METHODS } = require('../constants');
const { AppError, notFound, conflict } = require('../utils/errors');
const notifications = require('./notifications');

async function pay(db, gateway, actor, input = {}, now = new Date()) {
  const bookingId = Number(input.bookingId);
  const method = input.method;
  if (!Number.isInteger(bookingId) || bookingId < 1) throw new AppError(400, 'Choose a booking to pay.', { bookingId: 'Required.' });
  if (!PAYMENT_METHODS.includes(method)) {
    throw new AppError(400, `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`, { method: 'Invalid method.' });
  }

  // Step 1 - check the booking and save the payment as Pending
  const booking = await db.transaction(async tx => {
    const b = await tx.get(`${BOOKING_SELECT} WHERE b.booking_id = ? AND b.customer_id = ?`, [bookingId, actor.id]);
    if (!b) throw notFound('Booking not found.');
    if (b.status === 'Cancelled') throw conflict('This booking was cancelled, so it cannot be paid.');
    if (b.status !== 'Completed') throw conflict('You can pay once the provider has finished the job.');
    if (b.pay_status === 'Paid') throw conflict('This booking is already paid.');

    const existing = await tx.get('SELECT payment_id FROM payments WHERE booking_id = ?', [bookingId]);
    if (existing) {
      await tx.run('UPDATE payments SET amount = ?, method = ?, status = ?, payment_date = ?, transaction_ref = NULL WHERE booking_id = ?',
        [b.total_amount, method, 'Pending', nowSql(now), bookingId]);
    } else {
      await tx.run('INSERT INTO payments (booking_id, amount, payment_date, method, status, transaction_ref) VALUES (?, ?, ?, ?, ?, NULL)',
        [bookingId, b.total_amount, nowSql(now), method, 'Pending']);
    }
    return b;
  });

  // Step 2 - ask the gateway (outside the transaction, because a bank call can be slow). Cash needs no gateway.
  let result;
  try {
    result = method === 'Cash'
      ? { ok: true, reference: null }
      : await gateway.charge({ amount: Number(booking.total_amount), method, bookingId, customerId: actor.id });
  } catch (e) {
    console.error('Payment gateway error:', e.message);
    result = { ok: false, message: 'The payment service is not available right now. Please try again.' };
  }

  // Step 3 - save the result and tell both people
  if (!result.ok) {
    await db.run("UPDATE payments SET status = 'Failed', payment_date = ? WHERE booking_id = ?", [nowSql(now), bookingId]);
    throw new AppError(402, result.message || 'Payment failed. Please try again or choose cash.');
  }

  await db.transaction(async tx => {
    await tx.run("UPDATE payments SET status = 'Paid', transaction_ref = ?, payment_date = ? WHERE booking_id = ?",
      [result.reference, nowSql(now), bookingId]);
    await notifications.add(tx, { role: 'customer', id: booking.customer_id }, {
      icon: 'bi-credit-card-fill', title: 'Payment',
      message: `Your ${method === 'Cash' ? 'cash ' : ''}payment of ${money(booking.total_amount)} was successful.`,
      related: { type: 'booking', id: bookingId }
    }, now);
    await notifications.add(tx, { role: 'provider', id: booking.provider_id }, {
      icon: 'bi-cash-coin', title: 'Payment Received',
      message: `A customer paid ${money(booking.total_amount)} ${method === 'Cash' ? 'in cash' : 'online'}.`,
      related: { type: 'booking', id: bookingId }
    }, now);
  });

  return getBooking(db, actor, bookingId);
}

async function getBooking(db, actor, bookingId) {
  const row = await db.get(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [bookingId]);
  return toBooking(row);
}

// The customer's payment history (receipts)
async function listMine(db, actor) {
  const rows = await db.all(
    `SELECT pay.payment_id, pay.booking_id, pay.amount, pay.payment_date, pay.method, pay.status, pay.transaction_ref,
            s.name AS service_name, p.name AS provider_name
       FROM payments pay
       JOIN bookings b          ON b.booking_id  = pay.booking_id
       JOIN services s          ON s.service_id  = b.service_id
       JOIN service_providers p ON p.provider_id = b.provider_id
      WHERE b.customer_id = ?
      ORDER BY pay.payment_date DESC, pay.payment_id DESC`, [actor.id]);
  return rows.map(r => ({
    id: r.payment_id,
    bookingId: r.booking_id,
    service: r.service_name,
    providerName: r.provider_name,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    txn: r.transaction_ref || null,
    date: r.payment_date
  }));
}

module.exports = { pay, listMine };