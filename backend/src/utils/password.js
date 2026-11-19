'use strict';
// Password hashing (document 3.4 Security: passwords must be encrypted and stored securely).
// We use scrypt, which is built into Node.js (no extra package) and is made for storing passwords.
// Each password gets its own random "salt", so two users with the same password get different hashes.
// Stored format:  scrypt$<salt in hex>$<hash in hex>

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(plain), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(plain, stored) {
  try {
    const [scheme, saltHex, keyHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scrypt(String(plain), Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

// Used when an email does not exist, so the answer takes about the same time as a real check.
// (Stops people finding out which emails are registered by measuring the response time.)
let dummy;
async function dummyHash() {
  if (!dummy) dummy = await hashPassword('this-is-not-a-real-password');
  return dummy;
}

module.exports = { hashPassword, verifyPassword, dummyHash };
