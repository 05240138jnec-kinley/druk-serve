// Sample data for testing. Same people and bookings as the frontend's js/data.js.
// Passwords are HASHED with bcrypt before they are saved (your documentation requires this).
const bcrypt = require("bcryptjs");

async function seed(conn) {
  const adminHash = await bcrypt.hash("Admin@123", 10);
  const customerHash = await bcrypt.hash("Customer@123", 10);
  const providerHash = await bcrypt.hash("Provider@123", 10);

  // ---- admin ----
  await conn.query(
    "INSERT INTO admin (admin_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    [1, "Admin", "admin@drukserve.bt", adminHash]
  );

  // ---- customer ----
  await conn.query(
    "INSERT INTO customer (customer_id, name, email, phone_number, location, address, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [1, "Pema Choden", "customer@drukserve.bt", "17999999", "Thimphu", "Norzin Lam, Thimphu", customerHash]
  );

  // ---- services (categories) ----
  await conn.query("INSERT INTO service (service_id, name, description, icon) VALUES ?", [[
    [1, "Plumbing", "Leaks, pipes, taps and bathroom fittings", "bi-droplet-fill"],
    [2, "Electrical", "Wiring, switches, lights and repairs", "bi-lightning-charge-fill"],
    [3, "Cleaning", "House, kitchen and deep cleaning", "bi-stars"],
    [4, "Carpentry", "Doors, furniture and wood repair", "bi-hammer"],
    [5, "Painting", "Interior and exterior painting", "bi-palette-fill"],
    [6, "Appliance Repair", "Washing machines, fridges, heaters", "bi-tools"],
    [7, "Pest Control", "Safe removal of insects and rodents", "bi-bug-fill"]
  ]]);

  // ---- service providers ----
  // id, name, email, phone, category, rating, reviews, verified, location, experience, rate, bio
  const providers = [
    [1, "Sonam Tobgay", "provider@drukserve.bt", "17111111", "Electrical", 4.8, 42, true, "Thimphu", 6, 400, "Licensed electrician for homes and small offices."],
    [2, "Tenzin Dorji", "tenzin@drukserve.bt", "17222222", "Plumbing", 4.6, 35, true, "Thimphu", 4, 350, "Fixes leaks, installs taps and bathroom fittings."],
    [3, "Dechen Wangmo", "dechen@drukserve.bt", "17333333", "Cleaning", 4.9, 58, true, "Paro", 5, 250, "Careful and reliable house cleaning."],
    [4, "Karma Phuntsho", "karma@drukserve.bt", "17444444", "Carpentry", 4.5, 21, true, "Phuentsholing", 8, 450, "Doors, windows and custom furniture."],
    [5, "Yangchen Lhamo", "yangchen@drukserve.bt", "17555555", "Painting", 4.7, 30, true, "Thimphu", 5, 300, "Neat interior and exterior painting."],
    [6, "Ugyen Dorji", "ugyen@drukserve.bt", "17666666", "Appliance Repair", 4.4, 18, true, "Punakha", 3, 380, "Repairs washing machines, fridges and heaters."],
    [7, "Pema Zangmo", "pema@drukserve.bt", "17777777", "Cleaning", 4.3, 12, true, "Dewathang", 2, 220, "Deep cleaning for kitchens and bathrooms."],
    [8, "Namgay Tshering", "namgay@drukserve.bt", "17888888", "Pest Control", 4.2, 9, false, "Thimphu", 4, 500, "Safe pest control for homes."]
  ];
  await conn.query(
    "INSERT INTO service_provider (provider_id, name, email, phone_number, password_hash, category, rating, review_count, is_verified, location, experience_years, rate_per_hour, bio) VALUES ?",
    [providers.map(p => [p[0], p[1], p[2], p[3], providerHash, p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]])]
  );

  // ---- bookings ----
  await conn.query(
    "INSERT INTO booking (booking_id, customer_id, provider_id, service_id, booking_date, status, service_address, hours, notes, amount) VALUES ?",
    [[
      [1, 1, 1, 2, "2026-11-02 10:00:00", "Confirmed", "Norzin Lam, Thimphu", 2, "Light switch not working in the living room.", 800],
      [2, 1, 3, 3, "2026-11-05 14:00:00", "Pending",   "Norzin Lam, Thimphu", 4, "Full house cleaning.", 1000],
      [3, 1, 2, 1, "2026-10-12 09:00:00", "Completed", "Norzin Lam, Thimphu", 2, "Kitchen tap leaking.", 700],
      [4, 1, 5, 5, "2026-09-20 11:00:00", "Cancelled", "Norzin Lam, Thimphu", 5, "Bedroom wall painting.", 1500]
    ]]
  );

  // ---- payments ----
  await conn.query(
    "INSERT INTO payment (booking_id, amount, payment_date, method, status, transaction_ref) VALUES ?",
    [[
      [3, 700, "2026-10-12 11:00:00", "mPay", "Paid", "DS10120001"],
      [1, 800, "2026-10-25 09:00:00", "Cash", "Pending", null]
    ]]
  );

  // ---- feedback ----
  await conn.query(
    "INSERT INTO feedback (booking_id, customer_id, rating, comment, `date`) VALUES (?, ?, ?, ?, ?)",
    [3, 1, 5, "Fast and very professional work.", "2026-10-13"]
  );

  // ---- notifications (customer_id OR provider_id) ----
  await conn.query(
    "INSERT INTO notification (customer_id, provider_id, title, message, icon, is_read) VALUES ?",
    [[
      [1, null, "Job Accepted",  "Your electrical job has been accepted by Sonam Tobgay.", "bi-check-circle-fill", false],
      [1, null, "Job Completed", "Your plumbing job has been completed.",                  "bi-tools",             false],
      [1, null, "Payment",       "Your payment was successful.",                           "bi-credit-card-fill",  true],
      [null, 1, "New Request",   "Pema Choden requested an electrical job.",               "bi-calendar-plus",     false],
      [null, 1, "New Feedback",  "A customer gave you 5 stars.",                           "bi-star-fill",         false]
    ]]
  );
}

module.exports = seed;
