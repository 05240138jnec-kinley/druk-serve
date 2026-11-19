'use strict';
// Notifications (document 2.2 "Notification System", frontend js/account.js notification page).
// Each notification belongs to ONE person (the frontend demo shared them by role).
//
// Firebase: the document names Firebase for real-time alerts. Here every notification is saved in MySQL
// and the website reads them from the API (it can refresh every 30 seconds). To add Firebase push later,
// call it from add() below - every notification in the system is created in that one place.

const { notFound } = require('../utils/errors');
const { nowSql } = require('../utils/dates');
const { toNotification, toBooking, toFeedback } = require('../utils/serialize');
const { BOOKING_SELECT, REVIEW_SELECT } = require('../db/queries');

// Create a notification. `db` can be the normal db or a transaction.
// to = { role: 'customer' | 'provider', id: 5 }
// related = { type: 'booking' | 'feedback', id: 12 } is the thing the notification is about (optional).
// It lets the detail page show the booking or the review behind the message.
async function add(db, to, { icon, title, message, related }, now = new Date()) {
  await db.run(
    `INSERT INTO notifications (recipient_role, recipient_id, icon, title, message, is_read, related_type, related_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [to.role, to.id, icon, title, String(message).slice(0, 255),
     related ? related.type : null, related ? related.id : null, nowSql(now)]
  );
}

async function list(db, actor, now = new Date()) {
  const rows = await db.all(
    `SELECT * FROM notifications WHERE recipient_role = ? AND recipient_id = ?
     ORDER BY created_at DESC, notification_id DESC`,
    [actor.role, actor.id]
  );
  return rows.map(r => toNotification(r, now));
}

// One notification with the booking or review it is about (the "notification details" page).
// Only the owner can open it. If the booking or review was deleted, `related` is null.
async function getOne(db, actor, id, now = new Date()) {
  const row = await db.get(
    'SELECT * FROM notifications WHERE notification_id = ? AND recipient_role = ? AND recipient_id = ?',
    [id, actor.role, actor.id]
  );
  if (!row) throw notFound('Notification not found.');

  const out = toNotification(row, now);
  out.related = null;
  if (row.related_type === 'booking') {
    const b = await db.get(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [row.related_id]);
    if (b && belongsTo(actor, b)) out.related = { type: 'booking', booking: toBooking(b) };
  }
  if (row.related_type === 'feedback') {
    const f = await db.get(`${REVIEW_SELECT} WHERE f.feedback_id = ?`, [row.related_id]);
    const b = f ? await db.get(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [f.booking_id]) : null;
    if (f && b && belongsTo(actor, b)) out.related = { type: 'feedback', feedback: toFeedback(f), booking: toBooking(b) };
  }
  return out;
}

const belongsTo = (actor, booking) =>
  (actor.role === 'customer' && booking.customer_id === actor.id) ||
  (actor.role === 'provider' && booking.provider_id === actor.id);

async function unreadCount(db, actor) {
  const row = await db.get(
    'SELECT COUNT(*) AS n FROM notifications WHERE recipient_role = ? AND recipient_id = ? AND is_read = 0',
    [actor.role, actor.id]
  );
  return Number(row.n);
}

async function markRead(db, actor, id) {
  const row = await db.get(
    'SELECT notification_id FROM notifications WHERE notification_id = ? AND recipient_role = ? AND recipient_id = ?',
    [id, actor.role, actor.id]
  );
  if (!row) throw notFound('Notification not found.');
  await db.run('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [id]);
}

async function markAllRead(db, actor) {
  await db.run(
    'UPDATE notifications SET is_read = 1 WHERE recipient_role = ? AND recipient_id = ?',
    [actor.role, actor.id]
  );
}

async function clearAll(db, actor) {
  await db.run('DELETE FROM notifications WHERE recipient_role = ? AND recipient_id = ?', [actor.role, actor.id]);
}

module.exports = { add, list, getOne, unreadCount, markRead, markAllRead, clearAll };