'use strict';
// Demo data copied from the frontend (js/data.js) so the website looks the same as before:
// 7 categories, 8 providers (the last one is not verified yet), 1 customer, 1 admin, 4 bookings, 1 review.
// ALL demo passwords are for testing only. Never use this data on a real website.

const { hashPassword } = require('../utils/password');
const { nowSql } = require('../utils/dates');

const SERVICES = [
  ['Plumbing',         'bi-droplet-fill',          'Leaks, pipes, taps and bathroom fittings'],
  ['Electrical',       'bi-lightning-charge-fill', 'Wiring, switches, lights and repairs'],
  ['Cleaning',         'bi-stars',                 'House, kitchen and deep cleaning'],
  ['Carpentry',        'bi-hammer',                'Doors, furniture and wood repair'],
  ['Painting',         'bi-palette-fill',          'Interior and exterior painting'],
  ['Appliance Repair', 'bi-tools',                 'Washing machines, fridges, heaters'],
  ['Pest Control',     'bi-bug-fill',              'Safe removal of insects and rodents']
];

// name, category, rating, reviews, experience, rate, location, verified, phone, email, bio
const PROVIDERS = [
  ['Sonam Tobgay',    'Electrical',       4.8, 42, 6, 400, 'Thimphu',       1, '17111111', 'provider@drukserve.bt', 'Licensed electrician for homes and small offices.'],
  ['Tenzin Dorji',    'Plumbing',         4.6, 35, 4, 350, 'Thimphu',       1, '17222222', 'tenzin@drukserve.bt',   'Fixes leaks, installs taps and bathroom fittings.'],
  ['Dechen Wangmo',   'Cleaning',         4.9, 58, 5, 250, 'Paro',          1, '17333333', 'dechen@drukserve.bt',   'Careful and reliable house cleaning.'],
  ['Karma Phuntsho',  'Carpentry',        4.5, 21, 8, 450, 'Phuentsholing', 1, '17444444', 'karma@drukserve.bt',    'Doors, windows and custom furniture.'],
  ['Yangchen Lhamo',  'Painting',         4.7, 30, 5, 300, 'Thimphu',       1, '17555555', 'yangchen@drukserve.bt', 'Neat interior and exterior painting.'],
  ['Ugyen Dorji',     'Appliance Repair', 4.4, 18, 3, 380, 'Punakha',       1, '17666666', 'ugyen@drukserve.bt',    'Repairs washing machines, fridges and heaters.'],
  ['Pema Zangmo',     'Cleaning',         4.3, 12, 2, 220, 'Dewathang',     1, '17777777', 'pema@drukserve.bt',     'Deep cleaning for kitchens and bathrooms.'],
  ['Namgay Tshering', 'Pest Control',     4.2,  9, 4, 500, 'Thimphu',       0, '17888888', 'namgay@drukserve.bt',   'Safe pest control for homes.']
];

const DEMO_PASSWORDS = { admin: 'Admin@123', customer: 'Customer@123', provider: 'Provider@123' };

// Adds everything to an EMPTY database. `db` is the normal db (or the SQLite one in the tests).
async function seedDemo(db, now = new Date()) {
  const created = nowSql(now);
  const ago = ms => nowSql(new Date(now.getTime() - ms));
  const H = 3600000, D = 24 * H;

  const adminHash = await hashPassword(DEMO_PASSWORDS.admin);
  const customerHash = await hashPassword(DEMO_PASSWORDS.customer);
  const providerHash = await hashPassword(DEMO_PASSWORDS.provider);

  await db.run('INSERT INTO admins (name, email, phone_number, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ['Admin', 'admin@drukserve.bt', '17000000', adminHash, created]);

  const serviceId = {};
  for (const [name, icon, desc] of SERVICES) {
    const r = await db.run('INSERT INTO services (name, icon, description) VALUES (?, ?, ?)', [name, icon, desc]);
    serviceId[name] = r.insertId;
  }

  await db.run(
    `INSERT INTO customers (name, email, phone_number, location, address, password_hash, is_suspended, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ['Pema Choden', 'customer@drukserve.bt', '17999999', 'Thimphu', 'Norzin Lam, Thimphu', customerHash, created]);

  const providerId = [];
  for (const [name, category, rating, reviews, exp, rate, location, verified, phone, email, bio] of PROVIDERS) {
    const r = await db.run(
      `INSERT INTO service_providers
         (name, email, phone_number, service_id, location, experience_years, hourly_rate, bio, rating, reviews_count,
          is_verified, is_available, work_days, work_from, work_to, password_hash, is_suspended, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '1,2,3,4,5,6', '08:00', '17:00', ?, 0, ?)`,
      [name, email, phone, serviceId[category], location, exp, rate, bio, rating, reviews, verified, providerHash, created]);
    providerId.push(r.insertId);
  }

  // customer, provider index, category, date time, hours, notes, status
  const bookings = [
    [0, 'Electrical', '2026-11-02 10:00:00', 2, 'Light switch not working in the living room.', 'Confirmed'],
    [2, 'Cleaning',   '2026-11-05 14:00:00', 4, 'Full house cleaning.',                         'Pending'],
    [1, 'Plumbing',   '2026-10-12 09:00:00', 2, 'Kitchen tap leaking.',                         'Completed'],
    [4, 'Painting',   '2026-09-20 11:00:00', 5, 'Bedroom wall painting.',                       'Cancelled']
  ];
  const bookingId = [];
  for (const [pi, category, when, hours, notes, status] of bookings) {
    const rate = PROVIDERS[pi][5];
    const r = await db.run(
      `INSERT INTO bookings (customer_id, provider_id, service_id, booking_date, hours, service_address, notes,
                             total_amount, status, created_at)
       VALUES (1, ?, ?, ?, ?, 'Norzin Lam, Thimphu', ?, ?, ?, ?)`,
      [providerId[pi], serviceId[category], when, hours, notes, rate * hours, status, created]);
    bookingId.push(r.insertId);
  }

  // Booking 1: cash on service (not paid yet). Booking 3: paid online with mPay.
  await db.run(`INSERT INTO payments (booking_id, amount, payment_date, method, status, transaction_ref)
                VALUES (?, 800, ?, 'Cash', 'Pending', NULL)`, [bookingId[0], created]);
  await db.run(`INSERT INTO payments (booking_id, amount, payment_date, method, status, transaction_ref)
                VALUES (?, 700, ?, 'mPay', 'Paid', 'DS10000003')`, [bookingId[2], created]);

  await db.run(
    `INSERT INTO feedback (booking_id, customer_id, rating, comment, feedback_date)
     VALUES (?, 1, 5, 'Fast and very professional work.', '2026-10-13')`, [bookingId[2]]);

  const notes = [
    ['customer', 1, 'bi-check-circle-fill', 'Job Accepted',  'Your electrical job has been accepted by Sonam Tobgay.', 0, ago(2 * H)],
    ['customer', 1, 'bi-tools',             'Job Completed', 'Your plumbing job has been completed.',                 0, ago(1 * D)],
    ['customer', 1, 'bi-credit-card-fill',  'Payment',       'Your payment was successful.',                          1, ago(3 * D)],
    ['provider', providerId[0], 'bi-calendar-plus', 'New Request',  'Pema Choden requested an electrical job.', 0, ago(1 * H)],
    ['provider', providerId[0], 'bi-star-fill',     'New Feedback', 'A customer gave you 5 stars.',             0, ago(1 * D)]
  ];
  for (const [role, id, icon, title, message, read, at] of notes) {
    await db.run(
      'INSERT INTO notifications (recipient_role, recipient_id, icon, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [role, id, icon, title, message, read, at]);
  }
}

module.exports = { seedDemo, DEMO_PASSWORDS };
