'use strict';
// Date helpers. Bhutan is always UTC+6 (no daylight saving), so we can add 6 hours by hand.

const BHUTAN_OFFSET_MINUTES = 6 * 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');

const bhutan = (now = new Date()) => new Date(now.getTime() + BHUTAN_OFFSET_MINUTES * 60000);

// Today in Bhutan as "2026-11-02"
function todayISO(now = new Date()) {
  const d = bhutan(now);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Current time in Bhutan as "14:05"
function nowTime(now = new Date()) {
  const d = bhutan(now);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function isValidDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// "2026-11-02" -> 1 (Monday). 0 = Sunday ... 6 = Saturday (same numbers as the frontend).
function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const isValidTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// "2026-11-02" -> "2 Nov 2026"  (used inside notification texts)
function niceDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Date and time as MySQL text in UTC: "2026-11-02 08:15:00".
// We write every created_at / payment_date ourselves so MySQL and the tests behave the same.
function nowSql(now = new Date()) {
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

// "5m ago", "2h ago", "Yesterday", "3 days ago" (frontend notification page style)
function timeAgo(createdSql, now = new Date()) {
  const created = new Date(String(createdSql).replace(' ', 'T') + 'Z');
  const minutes = Math.floor(Math.max(0, now - created) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

function toBhutanParts(createdSql) {
  const d = new Date(String(createdSql).replace(' ', 'T') + 'Z');
  const b = new Date(d.getTime() + BHUTAN_OFFSET_MINUTES * 60000);
  return {
    date: `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}`,
    time: `${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}`
  };
}
module.exports = { toBhutanParts, todayISO, nowTime, isValidDate, weekday, isValidTime, toMinutes, niceDate, nowSql, timeAgo };
