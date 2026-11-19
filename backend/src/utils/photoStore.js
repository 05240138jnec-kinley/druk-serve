'use strict';
// Profile photo files. The picture is saved as a normal file in the "uploads/avatars" folder
// and the database keeps only its web path, for example  /uploads/avatars/customer-4-9f2c1a7e.jpg
// (the UPLOAD_DIR setting in .env can move the folder).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 2 * 1024 * 1024;            // 2 MB after the browser has shrunk the picture

const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
const avatarDir = () => path.join(uploadRoot(), 'avatars');

// Looks at the first bytes of the file (not the name or the browser's claim) to find out what it really is.
function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// "data:image/png;base64,...."  ->  { type, buffer }  or  { error }
function readDataUrl(text) {
  const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof text === 'string' ? text : '');
  if (!m) return { error: 'Choose a JPG, PNG or WEBP picture.' };
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > MAX_BYTES) return { error: 'The picture is too big. Please choose one under 2 MB.' };
  const type = detectType(buffer);
  if (!type) return { error: 'That file is not a real JPG, PNG or WEBP picture.' };
  return { type, buffer };
}

function save(role, id, type, buffer) {
  fs.mkdirSync(avatarDir(), { recursive: true });
  const name = `${role}-${id}-${crypto.randomBytes(6).toString('hex')}.${type}`;     // new name each time, so browsers never show an old copy
  fs.writeFileSync(path.join(avatarDir(), name), buffer);
  return `/uploads/avatars/${name}`;
}

function remove(url) {
  const m = /^\/uploads\/avatars\/([A-Za-z0-9._-]+)$/.exec(url || '');
  if (!m) return;
  try { fs.unlinkSync(path.join(avatarDir(), m[1])); } catch (e) { /* already gone */ }
}

module.exports = { readDataUrl, save, remove, uploadRoot, avatarDir, MAX_BYTES };