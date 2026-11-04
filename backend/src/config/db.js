// One shared connection pool to MySQL. Every route imports this file.
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "druk_serve",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,       // dates arrive as plain text like "2026-11-02 10:00:00"
  decimalNumbers: true,    // prices arrive as numbers (800) instead of text ("800.00")
  // BOOLEAN columns are TINYINT(1) in MySQL: turn them into true / false
  typeCast(field, next) {
    if (field.type === "TINY" && field.length === 1) return field.string() === "1";
    return next();
  }
});

module.exports = pool;
