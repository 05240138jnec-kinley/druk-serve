// Input checks. They follow the same rules as the website's forms,
// because the server must never trust what the browser sends.

const LOCATIONS = ["Thimphu", "Paro", "Phuentsholing", "Punakha", "Dewathang", "Other"];

// Turns anything into trimmed text ("" if it is not text).
const clean = value => (typeof value === "string" ? value.trim() : "");

const isEmail = value => value.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// 8 digits, optionally starting with +975
const isPhone = value => /^(\+975)?[0-9]{8}$/.test(value);

// At least 8 characters, one number and one symbol (your documentation's rule).
// bcrypt only reads the first 72 bytes, so longer passwords are refused.
const isStrongPassword = value =>
  typeof value === "string" && value.length >= 8 && Buffer.byteLength(value) <= 72 &&
  /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);

module.exports = { LOCATIONS, clean, isEmail, isPhone, isStrongPassword };
