/* Creates the database and all tables from database/schema.sql.
     npm run db:setup     safe to repeat, keeps your data
     npm run db:reset     DELETES the whole database and creates it again (then run npm run db:seed) */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const dbName = process.env.DB_NAME || 'druk_serve';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('DB_NAME may only contain letters, numbers and underscore.');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  if (process.argv.includes('--reset')) {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    console.log(`Old database "${dbName}" deleted.`);
  }
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);

  // schema.sql has comment lines and one statement after another, separated by ";"
  const statements = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
    .split(';').map(s => s.trim()).filter(Boolean);

  for (const statement of statements) {
    try {
      await conn.query(statement);
    } catch (e) {
      if (e.errno === 1061) continue;          // "index already exists": this is a repeat run, fine
      throw e;
    }
  }
    // Older databases: add the two new notification columns when they are missing
  for (const [column, definition] of [['related_type', 'VARCHAR(20) NULL'], ['related_id', 'INT NULL']]) {
    const [found] = await conn.query('SHOW COLUMNS FROM notifications LIKE ?', [column]);
    if (found.length === 0) {
      await conn.query(`ALTER TABLE notifications ADD COLUMN ${column} ${definition} AFTER is_read`);
      console.log(`Added column notifications.${column}.`);
    }
  }
  await conn.end();

  console.log(`Database "${dbName}" is ready (${statements.length} statements run).`);
  console.log('Next: npm run db:seed   (adds the sample data and the test accounts)');
})().catch(err => {
  console.error('Database setup failed:', err.message);
  console.error('Check DB_HOST, DB_USER and DB_PASSWORD in your .env file, and that MySQL is running.');
  process.exit(1);
});
