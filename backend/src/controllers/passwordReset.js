'use strict';
// Forgot password (login page "Forgot password?").
//   1. forgotPassword : the person types their email. We ALWAYS answer the same way (so nobody can find out which emails
//                       are registered). If the account exists we email a secret link that works once for 30 minutes.
//   2. resetPassword  : the link opens reset-password.html, the person types a new password, and we save it.
// Only a hash (fingerprint) of the secret is stored in the database, so a leaked database cannot be used to take over accounts.

const crypto = require('node:crypto');
const { findAccountsByEmail } = require('./auth');
const { TABLES } = require('../db/queries');
const { hashPassword } = require('../utils/password');
const { str, isEmail, isStrongPassword, Validator } = require('../utils/validate');
const { nowSql } = require('../utils/dates');
const { AppError } = require('../utils/errors');
const mailer = require('../utils/mailer');

const LINK_MINUTES = 30;
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const SAME_ANSWER = { message: 'If that email is registered, we have sent a link to reset the password. It works for 30 minutes.' };

async function forgotPassword(db, config, input = {}, now = new Date(), log = console.error) {
  const email = str(input.email).toLowerCase();
  if (!isEmail(email)) throw new AppError(400, 'Please enter a valid email address.', { email: 'Enter a valid email address.' });

  // One email can own a Customer account and a Provider account: each gets its own link (and its own email),
  // and each link changes the password of that one account only.
  for (const found of await findAccountsByEmail(db, email)) {
    if (found.row.is_suspended) continue;
    const { idColumn } = TABLES[found.role];
    const accountId = found.row[idColumn];
    const secret = crypto.randomBytes(32).toString('hex');
    const expires = new Date(now.getTime() + LINK_MINUTES * 60 * 1000);

    await db.transaction(async tx => {
      await tx.run('DELETE FROM password_resets WHERE role = ? AND account_id = ?', [found.role, accountId]);   // older links stop working
      await tx.run('INSERT INTO password_resets (role, account_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [found.role, accountId, sha256(secret), nowSql(expires), nowSql(now)]);
    });

    const link = `${config.mail.siteUrl}/reset-password.html?token=${secret}`;
    // Sent in the background, so the answer takes about the same time whether or not the email exists.
    Promise.resolve(mailer.send(config, {
      to: found.row.email,
      subject: `Reset your Druk Serve ${found.role} password`,
      text: `Hello ${found.row.name},\n\nSomebody asked to reset the password of your Druk Serve ${found.role} account.\n` +
        `Open this link to choose a new password (it works once, for ${LINK_MINUTES} minutes):\n\n${link}\n\n` +
        'If you did not ask for this, ignore this email. Your password stays the same.\n\nDruk Serve'
    })).catch(e => log('Could not send the reset email:', e.message));
  }
  return SAME_ANSWER;
}

async function resetPassword(db, input = {}, now = new Date()) {
  const token = typeof input.token === 'string' ? input.token : '';
  const password = input.newPassword;
  const v = new Validator();
  if (!isStrongPassword(password)) v.fail('newPassword', 'Use at least 8 characters, one number and one symbol.');
  v.throwIfInvalid();

  const bad = () => new AppError(400, 'This reset link is not valid any more. Please ask for a new one.');
  if (!/^[0-9a-f]{64}$/.test(token)) throw bad();

  await db.transaction(async tx => {
    const row = await tx.get('SELECT reset_id, role, account_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      [sha256(token), nowSql(now)]);
    if (!row) throw bad();
    const { table, idColumn } = TABLES[row.role];
    const account = await tx.get(`SELECT is_suspended FROM ${table} WHERE ${idColumn} = ?`, [row.account_id]);
    if (!account || account.is_suspended) throw bad();

    await tx.run(`UPDATE ${table} SET password_hash = ? WHERE ${idColumn} = ?`, [await hashPassword(password), row.account_id]);
    await tx.run('DELETE FROM password_resets WHERE role = ? AND account_id = ?', [row.role, row.account_id]);    // the link works only once
  });
  return { message: 'Your password was changed. You can log in now.' };
}

module.exports = { forgotPassword, resetPassword };