// Creates the database, all tables and the sample data.
// Run it with:  npm run db:setup
// WARNING: this DELETES the old "druk_serve" database and starts again (fine while developing).
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const seed = require("./seed");

const DB_NAME = process.env.DB_NAME || "druk_serve";

(async () => {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
    console.error("[ERROR] DB_NAME in .env may only contain letters, numbers and underscores.");
    process.exit(1);
  }

  let conn;
  try {
    // connect to the database SERVER (no database selected yet)
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: true
    });

    console.log("Connected to the database server.");
    console.log("Creating database '" + DB_NAME + "' ...");
    await conn.query("DROP DATABASE IF EXISTS `" + DB_NAME + "`");
    await conn.query("CREATE DATABASE `" + DB_NAME + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await conn.query("USE `" + DB_NAME + "`");

    console.log("Creating tables ...");
    await conn.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

    console.log("Adding sample data (hashing passwords, this takes a second) ...");
    await seed(conn);

    const tables = ["admin", "customer", "service", "service_provider", "booking", "payment", "feedback", "notification"];
    console.log("\nDone! Rows in each table:");
    for (const t of tables) {
      const [[row]] = await conn.query("SELECT COUNT(*) AS n FROM `" + t + "`");
      console.log("  " + t.padEnd(18) + row.n);
    }
    console.log("\nNext: run  npm run dev  to start the server.");
  } catch (err) {
    console.error("\n[ERROR] Database setup failed.");
    if (err.code === "ECONNREFUSED") {
      console.error("Could not connect to MySQL. Open the XAMPP Control Panel and click Start next to MySQL.");
    } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("MySQL refused the login. Check DB_USER and DB_PASSWORD in your .env file.");
    } else {
      console.error(err.message);
    }
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
