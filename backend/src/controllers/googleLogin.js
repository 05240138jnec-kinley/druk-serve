'use strict';
// "Sign in with Google" (login page).
//   - Google proves who the person is (name + a verified email address).
//   - Email already registered (customer or provider)  -> log in to that account.
//   - New email                                        -> a Customer account is created (the phone and address are added later on the profile page).
//   - Admin accounts never use Google (they use email and password only).
// Providers still register on the normal page, because they must give a service category and an hourly rate.

const crypto = require('node:crypto');
const { findAccountByEmail, toSessionUser } = require('./auth');
const { hashPassword } = require('../utils/password');
const { isEmail } = require('../utils/validate');
const { nowSql } = require('../utils/dates');
const { AppError, forbidden, unauthorized } = require('../utils/errors');
const googleAuth = require('../utils/googleAuth');

async function googleLogin(db, config, input = {}) {
  if (!config.googleClientId) throw new AppError(503, 'Google sign-in is not set up on this server yet. Please use your email and password.');
  const credential = typeof input.credential === 'string' ? input.credential : '';
  if (!credential || credential.length > 4096) throw new AppError(400, 'Google sign-in did not send any login information. Please try again.');

  let payload;
  try { payload = await googleAuth.verify(config, credential); } catch (e) { payload = null; }
  const email = payload && typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!payload || payload.email_verified !== true || !isEmail(email)) {
    throw unauthorized('Google sign-in could not be verified. Please try again.');
  }

  let found = await findAccountByEmail(db, email);
  let created = false;
  if (found) {
    if (found.role === 'admin') throw forbidden('Admin accounts must log in with email and password.');
    if (found.row.is_suspended) throw forbidden('This account has been suspended. Please contact the admin.');
  } else {
    let name = String(payload.name || '').trim().slice(0, 100);
    if (name.length < 3) name = `${email.split('@')[0]} User`.slice(0, 100);
    // A Google account has no Druk Serve password: store a long random one that nobody knows (they can use "Forgot password?" to set their own).
    const passwordHash = await hashPassword(crypto.randomBytes(24).toString('hex') + 'aA1!');
    await db.run(
      `INSERT INTO customers (name, email, phone_number, location, address, password_hash, is_suspended, created_at)
       VALUES (?, ?, '', 'Thimphu', '', ?, 0, ?)`,
      [name, email, passwordHash, nowSql()]);
    found = await findAccountByEmail(db, email);
    created = true;
  }

  const user = toSessionUser(found.role, found.row);
  const pic = await db.get('SELECT photo_url FROM profile_photos WHERE role = ? AND account_id = ?', [found.role, user.id]);
  return { user: { ...user, photo: pic ? pic.photo_url : null }, created };
}

module.exports = { googleLogin };