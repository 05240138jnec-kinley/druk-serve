// Helpers for the three kinds of user: customer, provider, admin.
// Each kind lives in its own table. Table and column names below are fixed
// in this file (never taken from the user), so building the SQL with them is safe.
const pool = require("../config/db");

const ROLES = {
  customer: { table: "customer", idColumn: "customer_id" },
  provider: { table: "service_provider", idColumn: "provider_id" },
  admin: { table: "admin", idColumn: "admin_id" }
};

const isRole = role => typeof role === "string" && Object.hasOwn(ROLES, role);

async function findById(role, id) {
  const r = ROLES[role];
  const [rows] = await pool.execute(`SELECT * FROM ${r.table} WHERE ${r.idColumn} = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByEmail(role, email) {
  const r = ROLES[role];
  const [rows] = await pool.execute(`SELECT * FROM ${r.table} WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

// One email can only belong to ONE account across all three tables.
async function emailTaken(email) {
  for (const r of Object.values(ROLES)) {
    const [rows] = await pool.execute(`SELECT 1 FROM ${r.table} WHERE email = ? LIMIT 1`, [email]);
    if (rows.length) return true;
  }
  return false;
}

// The version of a user that is safe to send to the website (never the password hash).
function publicUser(role, row) {
  const user = { id: row[ROLES[role].idColumn], role: role, name: row.name, email: row.email };
  if (role === "customer") {
    user.phone = row.phone_number;
    user.location = row.location;
    user.address = row.address;
  }
  if (role === "provider") {
    user.phone = row.phone_number;
    user.location = row.location;
    user.category = row.category;
    user.isVerified = row.is_verified;
  }
  return user;
}

module.exports = { ROLES, isRole, findById, findByEmail, emailTaken, publicUser };
