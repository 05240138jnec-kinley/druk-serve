// Starts the server.  Run with:  npm run dev
require("dotenv").config({ quiet: true });
const app = require("./src/app");
const pool = require("./src/config/db");

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, async () => {
  console.log("Druk Serve API running at http://localhost:" + PORT);
  try {
    await pool.query("SELECT 1");
    console.log("[OK] Connected to database '" + (process.env.DB_NAME || "druk_serve") + "'");
  } catch (err) {
    console.log("[PROBLEM] Cannot use the database: " + err.message);
    if (err.code === "ECONNREFUSED") console.log("          Open XAMPP and click Start next to MySQL.");
    if (err.code === "ER_BAD_DB_ERROR") console.log("          Run:  npm run db:setup");
  }
});
