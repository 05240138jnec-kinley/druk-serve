'use strict';
// My Profile and Change Password (document 4.2.4 / 4.2.5, frontend js/account.js).

const { TABLES } = require('../db/queries');
const { loadAccount, toSessionUser } = require('./auth');
const photoStore = require('../utils/photoStore');
const { hashPassword, verifyPassword } = require('../utils/password');
const { LOCATIONS } = require('../constants');
const { str, isPhone, isStrongPassword, Validator } = require('../utils/validate');
const { AppError, forbidden, unauthorized } = require('../utils/errors');

function toProfile(role, row, photo = null) {
  return {
    ...toSessionUser(role, row),
    photo,
    phone: row.phone_number || '',
    location: row.location || '',
    address: role === 'customer' ? row.address : ''
  };
}

async function getProfile(db, actor) {
  const row = await loadAccount(db, actor.role, actor.id);
  if (!row) throw unauthorized('Your account is not available. Please log in again.');
  return toProfile(actor.role, row, await getPhoto(db, actor));
}

async function getPhoto(db, actor) {
  const r = await db.get('SELECT photo_url FROM profile_photos WHERE role = ? AND account_id = ?', [actor.role, actor.id]);
  return r ? r.photo_url : null;
}

// Profile photo (customers and providers; the admin has no profile page).
// The browser sends the picture as text ("data URL"). The server checks that it is really a JPG, PNG or WEBP
// of a sensible size, saves it as a file, and keeps the file's path in the database.
async function setPhoto(db, actor, input = {}) {
  if (actor.role === 'admin') throw forbidden('The admin account has no profile photo.');
  const read = photoStore.readDataUrl(input.photo);
  if (read.error) throw new AppError(400, read.error, { photo: read.error });

  const old = await getPhoto(db, actor);
  const url = photoStore.save(actor.role, actor.id, read.type, read.buffer);
  if (old) await db.run('UPDATE profile_photos SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ? AND account_id = ?', [url, actor.role, actor.id]);
  else await db.run('INSERT INTO profile_photos (role, account_id, photo_url) VALUES (?, ?, ?)', [actor.role, actor.id, url]);
  if (old) photoStore.remove(old);
  return getProfile(db, actor);
}

async function removePhoto(db, actor) {
  const old = await getPhoto(db, actor);
  await db.run('DELETE FROM profile_photos WHERE role = ? AND account_id = ?', [actor.role, actor.id]);
  if (old) photoStore.remove(old);
  return getProfile(db, actor);
}

// Customers can change name, phone, location and address. Providers: name, phone, location.
async function updateProfile(db, actor, input = {}) {
  if (actor.role === 'admin') throw forbidden('Admin details cannot be changed here.');
  const row = await loadAccount(db, actor.role, actor.id);
  if (!row) throw unauthorized('Your account is not available. Please log in again.');

  const v = new Validator();
  const name = str(input.name);
  const phone = str(input.phone);
  const location = str(input.location) || row.location;
  if (name.length < 3 || name.length > 100) v.fail('name', 'Enter your full name (at least 3 characters).');
  if (!isPhone(phone)) v.fail('phone', 'Enter an 8-digit phone number, for example 17123456.');
  if (!LOCATIONS.includes(location)) v.fail('location', 'Choose a location from the list.');
  let address = row.address;
  if (actor.role === 'customer') {
    address = str(input.address);
    if (address.length < 5 || address.length > 255) v.fail('address', 'Enter your full address (at least 5 characters).');
  }
  v.throwIfInvalid();

  const { table, idColumn } = TABLES[actor.role];
  if (actor.role === 'customer') {
    await db.run(`UPDATE ${table} SET name = ?, phone_number = ?, location = ?, address = ? WHERE ${idColumn} = ?`,
      [name, phone, location, address, actor.id]);
  } else {
    await db.run(`UPDATE ${table} SET name = ?, phone_number = ?, location = ? WHERE ${idColumn} = ?`,
      [name, phone, location, actor.id]);
  }
  return getProfile(db, actor);
}

async function changePassword(db, actor, input = {}) {
  const row = await loadAccount(db, actor.role, actor.id);
  if (!row) throw unauthorized('Your account is not available. Please log in again.');

  const v = new Validator();
  const current = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const next = input.newPassword;

  // The server checks the current password against password_hash (frontend README)
  if (!current || !(await verifyPassword(current, row.password_hash))) {
    v.fail('currentPassword', 'Your current password is not correct.');
  }
  if (!isStrongPassword(next)) {
    v.fail('newPassword', 'Use at least 8 characters, one number and one symbol.');
  } else if (await verifyPassword(next, row.password_hash)) {
    v.fail('newPassword', 'New password must be different from your old password.');
  }
  v.throwIfInvalid();

  const { table, idColumn } = TABLES[actor.role];
  await db.run(`UPDATE ${table} SET password_hash = ? WHERE ${idColumn} = ?`, [await hashPassword(next), actor.id]);
}

module.exports = { getProfile, getPhoto, updateProfile, changePassword, setPhoto, removePhoto };