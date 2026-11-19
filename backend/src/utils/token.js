'use strict';
// Login tokens (JWT, the format named in the frontend README: "the server returns the user and a login token").
// A token is three parts joined by dots:   header.payload.signature
//   header    {"alg":"HS256","typ":"JWT"}
//   payload   {"sub":5,"role":"customer","iat":...,"exp":...}      (who you are and when the token ends)
//   signature HMAC-SHA256 of "header.payload" made with JWT_SECRET
// Nobody can change the payload (for example role "admin") without the secret, because the signature would not match.
// This is the standard HS256 JWT, so you can paste a token into jwt.io to look inside it.
// It uses only Node's built-in crypto module.

const crypto = require('node:crypto');

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const fromB64 = text => Buffer.from(text, 'base64url').toString('utf8');
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function signToken(payload, secret, expiresInSeconds, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat, exp: iat + expiresInSeconds })}`;
  return `${data}.${hmac(data, secret)}`;
}

// Returns the payload when the token is genuine and not expired. Returns null for anything else
// (wrong signature, changed payload, expired, "alg: none" trick, garbage text).
function verifyToken(token, secret, nowMs = Date.now()) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [h, p, signature] = parts;

    const header = JSON.parse(fromB64(h));
    if (header.alg !== 'HS256') return null;                  // refuse "none" and any other algorithm

    const expected = Buffer.from(hmac(`${h}.${p}`, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(fromB64(p));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { signToken, verifyToken };
