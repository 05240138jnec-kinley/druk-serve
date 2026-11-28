'use strict';
// Turns database rows (snake_case) into the JSON the frontend already uses (camelCase).
// Example: the frontend reads  provider.rate  and  booking.payMethod , so that is what we send.

const { timeAgo, toBhutanParts } = require('./dates');

const parseDays = text => String(text || '').split(',').filter(x => x !== '').map(Number);
const toNumberOrNull = v => (v === null || v === undefined ? null : Number(v));

function toCategory(r) {
  return { id: r.service_id, name: r.name, icon: r.icon, desc: r.description };
}

// Public provider data. Email and phone are only added when includeContact is true (admin / the provider).
function toProvider(r, { includeContact = false } = {}) {
  const out = {
    id: r.provider_id,
    name: r.name,
    category: r.service_name,
    rating: Number(r.rating),
    reviews: r.reviews_count,
    experience: r.experience_years,
    rate: Number(r.hourly_rate),
    location: r.location,
    bio: r.bio || '',
    verified: !!r.is_verified,
    available: !!r.is_available,
    suspended: !!r.is_suspended,
    days: parseDays(r.work_days),
    from: r.work_from,
    to: r.work_to,
    photo: r.photo || null
  };
  if (includeContact) { out.email = r.email; out.phone = r.phone_number; }
  return out;
}

function toBooking(r) {
  const online = r.pay_method && r.pay_status !== 'Failed';
  return {
    id: r.booking_id,
    customerId: r.customer_id,
    providerId: r.provider_id,
    service: r.service_name,
    date: String(r.booking_date).slice(0, 10),
    time: String(r.booking_date).slice(11, 16),
    hours: r.hours,
    address: r.service_address,
    notes: r.notes || '',
    amount: Number(r.total_amount),
    status: r.status,
    payMethod: online ? r.pay_method : '',
    paid: r.pay_status === 'Paid',
    txn: r.pay_ref || null,
    paidAt: r.pay_status === 'Paid' && r.pay_date ? toBhutanParts(r.pay_date) : null,   // when the payment was received (Bhutan time)
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    providerName: r.provider_name,
    providerPhone: r.provider_phone,
    rating: toNumberOrNull(r.fb_rating),
    createdAt: r.created_at
  };
}

function toFeedback(r) {
  return {
    id: r.feedback_id,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    providerId: r.provider_id,
    rating: r.rating,
    comment: r.comment || '',
    date: String(r.feedback_date).slice(0, 10),
    reply: r.reply || null,
    replyDate: r.reply_date ? String(r.reply_date).slice(0, 10) : null
  };
}

function toNotification(r, now = new Date()) {
  return {
    id: r.notification_id,
    icon: r.icon,
    title: r.title,
    text: r.message,
    read: !!r.is_read,
    time: timeAgo(r.created_at, now),
    createdAt: r.created_at,
    when: toBhutanParts(r.created_at),               // date and clock time in Bhutan, for the detail page
    relatedType: r.related_type || null,             // 'booking' | 'feedback' | null (older notifications)
    relatedId: r.related_id === null || r.related_id === undefined ? null : Number(r.related_id)
  };
}

module.exports = { parseDays, toCategory, toProvider, toBooking, toFeedback, toNotification };