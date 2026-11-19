'use strict';
// Service categories (document 3.3.1 "Manage service categories", frontend admin.js Categories tab).

const { toCategory } = require('../utils/serialize');
const { str, isIcon, Validator } = require('../utils/validate');
const { notFound, conflict } = require('../utils/errors');

async function list(db) {
  const rows = await db.all('SELECT * FROM services ORDER BY service_id');
  return rows.map(toCategory);
}

async function checkInput(db, input, ignoreId) {
  const v = new Validator();
  const name = str(input.name);
  const desc = str(input.desc);
  const icon = isIcon(input.icon) ? input.icon : 'bi-tools';

  if (name.length < 3 || name.length > 50) v.fail('name', 'Enter a name (3 to 50 characters).');
  if (desc.length < 1 || desc.length > 150) v.fail('desc', 'Enter a short description (up to 150 characters).');
  if (name.length >= 3) {
    const clash = await db.get('SELECT service_id FROM services WHERE LOWER(name) = LOWER(?) AND service_id <> ?', [name, ignoreId]);
    if (clash) v.fail('name', 'A category with this name already exists.');
  }
  v.throwIfInvalid();
  return { name, desc, icon };
}

async function create(db, input = {}) {
  const c = await checkInput(db, input, 0);
  const result = await db.run('INSERT INTO services (name, icon, description) VALUES (?, ?, ?)', [c.name, c.icon, c.desc]);
  return { id: result.insertId, name: c.name, icon: c.icon, desc: c.desc };
}

// Renaming is easy: providers and bookings point to the category by id, so they show the new name by themselves.
async function update(db, id, input = {}) {
  const existing = await db.get('SELECT service_id FROM services WHERE service_id = ?', [id]);
  if (!existing) throw notFound('Category not found.');
  const c = await checkInput(db, input, id);
  await db.run('UPDATE services SET name = ?, icon = ?, description = ? WHERE service_id = ?', [c.name, c.icon, c.desc, id]);
  return { id, name: c.name, icon: c.icon, desc: c.desc };
}

// A category that providers or bookings use cannot be deleted (frontend rule).
async function remove(db, id) {
  const cat = await db.get('SELECT name FROM services WHERE service_id = ?', [id]);
  if (!cat) throw notFound('Category not found.');
  const providers = Number((await db.get('SELECT COUNT(*) AS n FROM service_providers WHERE service_id = ?', [id])).n);
  if (providers) {
    throw conflict(`"${cat.name}" is used by ${providers} provider${providers === 1 ? '' : 's'} and cannot be deleted.`);
  }
  const bookings = Number((await db.get('SELECT COUNT(*) AS n FROM bookings WHERE service_id = ?', [id])).n);
  if (bookings) {
    throw conflict(`"${cat.name}" has ${bookings} booking${bookings === 1 ? '' : 's'} in the history and cannot be deleted.`);
  }
  await db.run('DELETE FROM services WHERE service_id = ?', [id]);
}

module.exports = { list, create, update, remove };
