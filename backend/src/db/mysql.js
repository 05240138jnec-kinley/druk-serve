'use strict';
// MySQL connection. The rest of the backend only uses four small functions:
//   db.all(sql, params)   -> list of rows
//   db.get(sql, params)   -> first row (or null)
//   db.run(sql, params)   -> { insertId, affectedRows }   (INSERT / UPDATE / DELETE)
//   db.transaction(fn)    -> runs fn(tx) as ONE all-or-nothing unit (tx has the same three functions)
// Keeping it this small is what lets the tests run the same code on SQLite.

const mysql = require('mysql2/promise');

// mysql2 does not accept `undefined` and true/false are safest as 1/0
const clean = params => params.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

function wrap(conn) {
  const all = async (sql, params = []) => {
    const [rows] = await conn.query(sql, clean(params));
    return rows;
  };
  const get = async (sql, params = []) => (await all(sql, params))[0] || null;
  const run = async (sql, params = []) => {
    const [result] = await conn.query(sql, clean(params));
    return { insertId: result.insertId, affectedRows: result.affectedRows };
  };
  return { all, get, run };
}

function createDb(config) {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: true,   // DATETIME / DATE come back as plain text like "2026-11-02 10:00:00"
    timezone: 'Z'        // we store every time in UTC (see utils/dates.js nowSql)
  });

  const db = wrap(pool);

  db.transaction = async fn => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(wrap(conn));
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  };

  db.ping = async () => { await pool.query('SELECT 1'); };
  db.close = () => pool.end();
  return db;
}

module.exports = { createDb };
