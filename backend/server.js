// Starts the server.  Run with:  npm run dev
require("dotenv").config({ quiet: true });
const app = require("./src/app");
const pool = require("./src/config/db");

const PORT = Number(process.env.PORT) || 3000;

// The login tokens are signed with JWT_SECRET. Without it nobody can log in safely.
if (!process.env.JWT_SECRET) {
  console.error("[ERROR] JWT_SECRET is missing in your .env file. Copy it from .env.example and set your own long random text.");
  process.exit(1);
}
if (process.env.JWT_SECRET === "change-this-to-a-long-random-text" || process.env.JWT_SECRET.length < 32) {
  console.log("[WARNING] JWT_SECRET in .env is still the example text (or too short). Replace it with your own long random text.");
}

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
