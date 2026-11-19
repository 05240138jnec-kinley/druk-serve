'use strict';
// Input checking. The frontend already checks forms, but a browser can be bypassed
// (anyone can call the API directly), so the server checks everything again.
// The rules are the same ones the frontend uses (register.html, account.js, provider.js).

const { AppError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+975)?[0-9]{8}$/;             // 8 digits, optional +975 (frontend profile page)
const ICON_RE = /^bi-[a-z0-9-]{1,40}$/;             // Bootstrap Icons class name

const str = v => (typeof v === 'string' ? v.trim() : '');
const isEmail = v => typeof v === 'string' && v.trim().length <= 100 && EMAIL_RE.test(v.trim());
const isPhone = v => typeof v === 'string' && PHONE_RE.test(v.trim());
const isIcon = v => typeof v === 'string' && ICON_RE.test(v);

// Document 4.2.4: at least 8 characters, one number and one symbol.
const isStrongPassword = v =>
  typeof v === 'string' && v.length >= 8 && v.length <= 128 && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);

// Whole number from a number or a text such as "3". Anything else gives NaN.
function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return NaN;
}

// Number (decimals allowed) from a number or a text. Anything else gives NaN.
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return NaN;
}

// Collects one message per input box, then throws them all together.
class Validator {
  constructor() { this.fields = {}; }
  fail(field, message) {
    if (!this.fields[field]) this.fields[field] = message;
    return this;
  }
  get ok() { return Object.keys(this.fields).length === 0; }
  throwIfInvalid(message = 'Please fix the highlighted fields.') {
    if (!this.ok) throw new AppError(400, message, this.fields);
  }
}

module.exports = { str, isEmail, isPhone, isIcon, isStrongPassword, toInt, toNumber, Validator };
