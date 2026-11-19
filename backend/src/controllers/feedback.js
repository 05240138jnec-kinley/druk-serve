'use strict';
// Rating and feedback (document 3.3.3 "Submit ratings and written feedback after service completion",
// 3.3.2 "View and respond to customer feedback"; frontend js/account.js and js/provider.js).

const { BOOKING_SELECT, REVIEW_SELECT } = require('../db/queries');
const { toFeedback } = require('../utils/serialize');
const { todayISO, nowSql } = require('../utils/dates');
const { str, toInt, Validator } = require('../utils/validate');
const { notFound, conflict, AppError } = require('../utils/errors');
const notifications = require('./notifications');

async function create(db, actor, input = {}, now = new Date()) {
  const v = new Validator();
  const bookingId = toInt(input.bookingId);
  const rating = toInt(input.rating);
  const comment = str(input.comment);
  if (!(bookingId >= 1)) v.fail('bookingId', 'Choose a booking.');
  if (!(rating >= 1 && rating <= 5)) v.fail('rating', 'Please choose 1 to 5 stars.');
  if (comment.length > 500) v.fail('comment', 'Keep the comment under 500 characters.');
  v.throwIfInvalid();

  const feedbackId = await db.transaction(async tx => {
    const b = await tx.get(`${BOOKING_SELECT} WHERE b.booking_id = ? AND b.customer_id = ?`, [bookingId, actor.id]);
    if (!b) throw notFound('Booking not found.');
    if (b.status !== 'Completed') throw conflict('You can only rate a booking after it is completed.');
    if (b.fb_rating !== null) throw conflict('You have already rated this booking. Thank you!');

    const result = await tx.run(
      'INSERT INTO feedback (booking_id, customer_id, rating, comment, feedback_date) VALUES (?, ?, ?, ?, ?)',
      [bookingId, actor.id, rating, comment, todayISO(now)]);

    // The SERVER works out the provider's new average (the browser is never trusted for this).
    // Locking the provider row first keeps two ratings at the same moment from overwriting each other.
    await tx.run('UPDATE service_providers SET provider_id = provider_id WHERE provider_id = ?', [b.provider_id]);
    const p = await tx.get('SELECT rating, reviews_count FROM service_providers WHERE provider_id = ?', [b.provider_id]);
    const count = Number(p.reviews_count);
    const average = Math.round(((Number(p.rating) * count + rating) / (count + 1)) * 100) / 100;
    await tx.run('UPDATE service_providers SET rating = ?, reviews_count = ? WHERE provider_id = ?',
      [average, count + 1, b.provider_id]);

    await notifications.add(tx, { role: 'provider', id: b.provider_id }, {
      icon: 'bi-star-fill', title: 'New Feedback',
      message: `A customer gave you ${rating} ${rating > 1 ? 'stars' : 'star'}.`,
      related: { type: 'feedback', id: result.insertId }
    }, now);
    return result.insertId;
  });

  const row = await db.get(`${REVIEW_SELECT} WHERE f.feedback_id = ?`, [feedbackId]);
  return toFeedback(row);
}

// A provider answers one review (once).
async function reply(db, actor, feedbackId, input = {}, now = new Date()) {
  const text = str(input.reply);
  if (text.length < 1 || text.length > 300) {
    throw new AppError(400, 'Please write a reply (up to 300 characters).', { reply: 'Please write a reply first.' });
  }
  const row = await db.get(`${REVIEW_SELECT} WHERE f.feedback_id = ? AND b.provider_id = ?`, [feedbackId, actor.id]);
  if (!row) throw notFound('Feedback not found.');
  if (row.reply) throw conflict('You have already replied to this feedback.');

  await db.transaction(async tx => {
    await tx.run('UPDATE feedback SET reply = ?, reply_date = ? WHERE feedback_id = ?', [text, todayISO(now), feedbackId]);
    await notifications.add(tx, { role: 'customer', id: row.customer_id }, {
      icon: 'bi-reply-fill', title: 'Provider Replied', message: `${actor.name} replied to your feedback.`,
      related: { type: 'feedback', id: feedbackId }
    }, now);
  });
  const updated = await db.get(`${REVIEW_SELECT} WHERE f.feedback_id = ?`, [feedbackId]);
  return toFeedback(updated);
}

// Provider: reviews they received. Customer: reviews they wrote.
async function list(db, actor) {
  const column = actor.role === 'provider' ? 'b.provider_id' : 'f.customer_id';
  const rows = await db.all(
    `${REVIEW_SELECT} WHERE ${column} = ? ORDER BY f.feedback_date DESC, f.feedback_id DESC`, [actor.id]);
  return rows.map(toFeedback);
}

module.exports = { create, reply, list, nowSql };
