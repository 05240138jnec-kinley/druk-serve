'use strict';
// TEST HELPER. Runs the same schema.sql and the same controllers on an in-memory SQLite database
// (built into Node 22+), so the business rules can be tested without installing MySQL.
// It gives the same four functions as src/db/mysql.js: all, get, run, transaction.

const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { DatabaseSync = null; }

const available = !!DatabaseSync;

// Turn the MySQL schema into SQLite text (only the few words that differ).
function toSqlite(schema) {
  return schema
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
    .replace(/INT AUTO_INCREMENT PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\)\s*ENGINE=[^;]*;/g, ');')
    .split(';').map(s => s.trim()).filter(Boolean);
}

const clean = params => params.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

function createSqliteDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  toSqlite(schema).forEach(statement => raw.exec(statement));

  const all = async (sql, params = []) => raw.prepare(sql).all(...clean(params)).map(r => ({ ...r }));
  const get = async (sql, params = []) => (await all(sql, params))[0] || null;
  const run = async (sql, params = []) => {
    const r = raw.prepare(sql).run(...clean(params));
    return { insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) };
  };
  const db = { all, get, run };

  // A transaction is BEGIN ... COMMIT (or ROLLBACK when something throws). Tests run one at a time, so this is enough.
  db.transaction = async fn => {
    raw.exec('BEGIN');
    try {
      const result = await fn({ all, get, run });
      raw.exec('COMMIT');
      return result;
    } catch (e) {
      raw.exec('ROLLBACK');
      throw e;
    }
  };
  db.close = () => raw.close();
  return db;
}

module.exports = { createSqliteDb, available };
