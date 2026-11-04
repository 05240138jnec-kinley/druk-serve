// GET /api/health  - quick check that the server and the database both work.
const express = require("express");
const pool = require("../config/db");

const router = express.Router();
const TABLES = ["admin", "customer", "service", "service_provider", "booking", "payment", "feedback", "notification"];

router.get("/", async (req, res, next) => {
  try {
    const [[now]] = await pool.query("SELECT NOW() AS server_time");
    const counts = {};
    for (const t of TABLES) {                       // the table names come from the list above, not from the user
      const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM `" + t + "`");
      counts[t] = row.n;
    }
    res.json({
      status: "ok",
      message: "Druk Serve API is running and connected to the database.",
      database: process.env.DB_NAME || "druk_serve",
      server_time: now.server_time,
      rows_in_tables: counts
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
