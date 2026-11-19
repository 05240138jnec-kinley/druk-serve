'use strict';
// "Sign in with Google" (login page). It is only a faster way to LOG IN. It never creates an account.
//   - The person must first register with the normal form (that is where phone, address, category and rate are given).
//   - Google proves who the person is (a verified email address).
//   - The role chosen on the login page (Customer / Provider) decides WHICH account opens, because the same email can have
//     one Customer account and one Provider account.
//   - Admin accounts never use Google (they use email and password only).

const { findAccount, findAccountsByEmail, toSessionUser } = require('./auth');
const { isEmail } = require('../utils/validate');
const { AppError, forbidden, unauthorized, badRequest } = require('../utils/errors');
const { capitalize } = require('../utils/format');
const googleAuth = require('../utils/googleAuth');

async function googleLogin(db, config, input = {}) {
  if (!config.googleClientId) throw new AppError(503, 'Google sign-in is not set up on this server yet. Please use your email and password.');
  const credential = typeof input.credential === 'string' ? input.credential : '';
  if (!credential || credential.length > 4096) throw new AppError(400, 'Google sign-in did not send any login information. Please try again.');

  const role = input.role;
  if (role === 'admin') throw forbidden('Admin accounts must log in with email and password.');
  if (role !== 'customer' && role !== 'provider') throw badRequest('Please choose Customer or Provider above, then use Google.');

  let payload;
  try { payload = await googleAuth.verify(config, credential); } catch (e) { payload = null; }
  const email = payload && typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!payload || payload.email_verified !== true || !isEmail(email)) {
    throw unauthorized('Google sign-in could not be verified. Please try again.');
  }

  const found = await findAccount(db, email, role);
  if (!found) {
    const others = (await findAccountsByEmail(db, email)).filter(a => a.role !== 'admin');
    if (others.length) {
      const other = others[0].role;
      throw new AppError(404, `There is no ${capitalize(role)} account for ${email}. You have a ${capitalize(other)} account: select "${capitalize(other)}" above, or register as a ${capitalize(role)} first.`);
    }
    throw new AppError(404, `No Druk Serve account was found for ${email}. Please register first with the sign-up form, then use Google to log in.`);
  }
  if (found.row.is_suspended) throw forbidden('This account has been suspended. Please contact the admin.');

  const user = toSessionUser(found.role, found.row);
  const pic = await db.get('SELECT photo_url FROM profile_photos WHERE role = ? AND account_id = ?', [found.role, user.id]);
  return { user: { ...user, photo: pic ? pic.photo_url : null } };
}

module.exports = { googleLogin };