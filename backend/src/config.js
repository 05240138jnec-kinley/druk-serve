'use strict';
// Reads the settings from the environment (the .env file is loaded by server.js before this runs).
// Keeping this as a plain function makes it easy to test and gives clear messages when something is missing.

// "1d" -> 86400, "8h" -> 28800, "30m" -> 1800, "3600" -> 3600 (seconds)
function parseDuration(text, fallbackSeconds) {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(String(text || '').trim());
  if (!m) return fallbackSeconds;
  const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
  return Number(m[1]) * unit;
}

const toInt = (v, fallback) => (/^\d+$/.test(String(v || '').trim()) ? parseInt(v, 10) : fallback);
const toList = (v, fallback) => String(v || fallback).split(',').map(s => s.trim()).filter(Boolean);

function loadConfig(env = process.env) {
  const jwtSecret = String(env.JWT_SECRET || '');
  if (jwtSecret.length < 32 || jwtSecret.startsWith('change-this')) {
    throw new Error(
      'JWT_SECRET is missing or too weak. Open your .env file and set JWT_SECRET to a long random text ' +
      '(at least 32 characters). Tip: run  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  const paymentMode = String(env.PAYMENT_MODE || 'sandbox').toLowerCase();
  if (!['sandbox', 'live'].includes(paymentMode)) throw new Error('PAYMENT_MODE must be "sandbox" or "live".');

  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: toInt(env.PORT, 5000),
    db: {
      host: env.DB_HOST || 'localhost',
      port: toInt(env.DB_PORT, 3306),
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      name: env.DB_NAME || 'druk_serve'
    },
    jwtSecret,
    jwtExpiresInSeconds: parseDuration(env.JWT_EXPIRES_IN, 86400),
    corsOrigins: toList(env.CORS_ORIGINS, 'http://127.0.0.1:5500,http://localhost:5500'),
    authRateLimit: toInt(env.AUTH_RATE_LIMIT, 100),
    paymentMode,
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    // Email (forgot password). Leave SMTP_HOST empty while developing: the email is then printed in the terminal.
    mail: {
      host: env.SMTP_HOST || '',
      port: toInt(env.SMTP_PORT, 465),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || 'Druk Serve <no-reply@drukserve.bt>',
      siteUrl: String(env.FRONTEND_URL || toList(env.CORS_ORIGINS, 'http://127.0.0.1:5500')[0]).replace(/\/+$/, '')
    }
  };
}

module.exports = { loadConfig, parseDuration };