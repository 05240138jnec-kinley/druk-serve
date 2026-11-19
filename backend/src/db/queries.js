'use strict';
// SQL pieces used in many places. Only plain, standard SQL is used here.
// Every value that comes from a user is passed as a "?" parameter, never glued into the text.
// That is what stops SQL injection (document 5.3.1 Security Testing).

// Which table holds which kind of account
const TABLES = {
  customer: { table: 'customers',         idColumn: 'customer_id' },
  provider: { table: 'service_providers', idColumn: 'provider_id' },
  admin:    { table: 'admins',            idColumn: 'admin_id' }
};

// A provider together with the name of its category. Add  " WHERE ..."  after it.
const PROVIDER_SELECT = `
  SELECT p.provider_id, p.name, p.email, p.phone_number, p.service_id, p.location,
         p.experience_years, p.hourly_rate, p.bio, p.rating, p.reviews_count,
         p.is_verified, p.is_available, p.work_days, p.work_from, p.work_to, p.is_suspended,
         s.name AS service_name, ph.photo_url AS photo
  FROM service_providers p
  JOIN services s ON s.service_id = p.service_id
  LEFT JOIN profile_photos ph ON ph.role = 'provider' AND ph.account_id = p.provider_id`;

// A booking with everything the screens need: names, phones, payment and rating.
const BOOKING_SELECT = `
  SELECT b.booking_id, b.customer_id, b.provider_id, b.service_id, b.booking_date, b.hours,
         b.service_address, b.notes, b.total_amount, b.status, b.created_at,
         s.name AS service_name,
         c.name AS customer_name, c.phone_number AS customer_phone,
         p.name AS provider_name, p.phone_number AS provider_phone,
         pay.method AS pay_method, pay.status AS pay_status, pay.transaction_ref AS pay_ref,
         fb.rating AS fb_rating
  FROM bookings b
  JOIN services s          ON s.service_id  = b.service_id
  JOIN customers c         ON c.customer_id = b.customer_id
  JOIN service_providers p ON p.provider_id = b.provider_id
  LEFT JOIN payments pay   ON pay.booking_id = b.booking_id
  LEFT JOIN feedback fb    ON fb.booking_id  = b.booking_id`;

// Reviews with the customer name. Add  " WHERE ..."  after it.
const REVIEW_SELECT = `
  SELECT f.feedback_id, f.booking_id, f.customer_id, f.rating, f.comment, f.feedback_date,
         f.reply, f.reply_date, c.name AS customer_name, b.provider_id
  FROM feedback f
  JOIN bookings b  ON b.booking_id  = f.booking_id
  JOIN customers c ON c.customer_id = f.customer_id`;

module.exports = { TABLES, PROVIDER_SELECT, BOOKING_SELECT, REVIEW_SELECT };