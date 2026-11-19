'use strict';
// Register and login (document 3.3.3 "Register a new account or log in", frontend js/auth.js).
// Controllers take plain values and return plain values. They know nothing about Express,
// so they are easy to test. The routes folder connects them to HTTP.

const { TABLES } = require('../db/queries');
const { hashPassword, verifyPassword, dummyHash } = require('../utils/password');
const { nowSql } = require('../utils/dates');
const { capitalize } = require('../utils/format');
const { LOCATIONS, MIN_RATE, MAX_RATE, MAX_EXPERIENCE } = require('../constants');
const {
  str, isEmail, isPhone, isStrongPassword, toInt, toNumber, Validator
} = require('../utils/validate');
const { badRequest, unauthorized, forbidden, conflict, isDuplicateError } = require('../utils/errors');

const ROLE_ORDER = ['customer', 'provider', 'admin'];

// The SAME email may own one Customer account and one Service Provider account (two separate accounts, two passwords).
// So an email alone does not identify an account: the email AND the role do.

// The account of this email in ONE role. Returns { role, row } or null.
async function findAccount(db, email, role) {
  if (!TABLES[role]) return null;
  const row = await db.get(`SELECT * FROM ${TABLES[role].table} WHERE email = ?`, [email]);
  return row ? { role, row } : null;
}

// Every account that uses this email (0 to 3 of them). Returns [{ role, row }].
async function findAccountsByEmail(db, email) {
  const all = [];
  for (const role of ROLE_ORDER) {
    const found = await findAccount(db, email, role);
    if (found) all.push(found);
  }
  return all;
}

// The small object the frontend keeps as its "session" (same fields as DS.login in js/app.js).
function toSessionUser(role, row) {
  const id = row[TABLES[role].idColumn];
  return { id, role, name: row.name, email: row.email, providerId: role === 'provider' ? id : null };
}

// Used on EVERY protected request: is this person still allowed in?
// Returns null when the account was deleted or suspended by the admin (so a suspension works immediately).
async function loadAccount(db, role, id) {
  if (!TABLES[role]) return null;
  const row = await db.get(`SELECT * FROM ${TABLES[role].table} WHERE ${TABLES[role].idColumn} = ?`, [id]);
  if (!row || row.is_suspended) return null;
  return row;
}

/* ---------------- REGISTER ---------------- */
async function register(db, input = {}) {
  const role = input.role;
  if (role !== 'customer' && role !== 'provider') {
    throw badRequest('Please choose Customer or Service Provider.', { role: 'Choose a role.' });
  }

  const v = new Validator();
  const name = str(input.name);
  const email = str(input.email).toLowerCase();
  const phone = str(input.phone);
  const location = str(input.location) || 'Thimphu';

  if (name.length < 3 || name.length > 100) v.fail('name', 'Enter your full name (at least 3 characters).');
  if (!isEmail(email)) v.fail('email', 'Please enter a valid email.');
  if (!isPhone(phone)) v.fail('phone', 'Enter an 8-digit phone number, for example 17123456.');
  if (!LOCATIONS.includes(location)) v.fail('location', 'Choose a location from the list.');
  if (!isStrongPassword(input.password)) v.fail('password', 'Use at least 8 characters, one number and one symbol.');

  let address = '';
  let service = null, rate = 0, experience = 0, bio = '';
  if (role === 'customer') {
    address = str(input.address);
    if (address.length < 5 || address.length > 255) v.fail('address', 'Enter your full address (at least 5 characters).');
  } else {
    service = await db.get('SELECT service_id FROM services WHERE name = ?', [str(input.category)]);
    if (!service) v.fail('category', 'Choose a service category from the list.');
    rate = toNumber(input.rate);
    if (!(rate >= MIN_RATE && rate <= MAX_RATE)) v.fail('rate', `Enter your hourly rate (at least Nu. ${MIN_RATE}).`);
    experience = input.experience === undefined || input.experience === '' ? 0 : toInt(input.experience);
    if (!(experience >= 0 && experience <= MAX_EXPERIENCE)) v.fail('experience', `Experience must be 0 to ${MAX_EXPERIENCE} years.`);
    bio = str(input.bio);
    if (bio.length > 500) v.fail('bio', 'Keep the description under 500 characters.');
  }
  v.throwIfInvalid();

  // Taken only if the same email already has an account in THIS role (or belongs to the admin).
  // A customer email may still register as a provider, and the other way round.
  const taken = (await findAccount(db, email, role)) || (await findAccount(db, email, 'admin'));
  if (taken) {
    const msg = taken.role === role ? `This email is already registered as a ${role}.` : 'This email is already registered.';
    throw conflict(msg, { email: msg });
  }

  const passwordHash = await hashPassword(input.password);   // the real password is never saved
  const now = nowSql();
  try {
    let result;
    if (role === 'customer') {
      result = await db.run(
        `INSERT INTO customers (name, email, phone_number, location, address, password_hash, is_suspended, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [name, email, phone, location, address, passwordHash, now]
      );
    } else {
      // New providers start NOT verified. The admin must verify them before customers can see them.
      result = await db.run(
        `INSERT INTO service_providers
           (name, email, phone_number, service_id, location, experience_years, hourly_rate, bio,
            rating, reviews_count, is_verified, is_available, work_days, work_from, work_to,
            password_hash, is_suspended, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, '1,2,3,4,5,6', '08:00', '17:00', ?, 0, ?)`,
        [name, email, phone, service.service_id, location, experience, rate, bio, passwordHash, now]
      );
    }
    return { id: result.insertId, role };
  } catch (e) {
    if (isDuplicateError(e)) throw conflict('This email is already registered.', { email: 'This email is already registered.' });
    throw e;
  }
}

/* ---------------- LOGIN ---------------- */
// Returns the session user. The route adds the JWT token.
async function login(db, input = {}) {
  const email = str(input.email).toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';
  const role = input.role;

  if (!isEmail(email) || !password || !ROLE_ORDER.includes(role)) {
    throw badRequest('Please enter your email, password and role.');
  }

  const accounts = await findAccountsByEmail(db, email);
  const found = accounts.find(a => a.role === role) || null;      // the account of the role chosen on the login page
  const passwordOk = await verifyPassword(password, found ? found.row.password_hash : await dummyHash());

  if (!found) {
    // No account in this role. If the password fits the person's OTHER account, say which role to pick (they have proven who they are).
    for (const other of accounts) {
      if (await verifyPassword(password, other.row.password_hash) && !other.row.is_suspended) {
        throw forbidden(`This email is registered as a ${other.role}. Please select "${capitalize(other.role)}" above.`);
      }
    }
    throw unauthorized('Wrong email or password.');
  }
  // ONE general message for "no such email" and "wrong password" (README: do not reveal which one).
  if (!passwordOk) throw unauthorized('Wrong email or password.');

  // From here the person has proven they own the account, so specific messages are safe.
  if (found.row.is_suspended) throw forbidden('This account has been suspended. Please contact the admin.');
  const user = toSessionUser(found.role, found.row);
  const pic = await db.get('SELECT photo_url FROM profile_photos WHERE role = ? AND account_id = ?', [found.role, user.id]);
  return { ...user, photo: pic ? pic.photo_url : null };       // for the round picture in the top menu
}

module.exports = { findAccount, findAccountsByEmail, toSessionUser, loadAccount, register, login };