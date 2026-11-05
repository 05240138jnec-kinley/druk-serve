// Register and login.
//   POST /api/auth/register   create a customer or provider account
//   POST /api/auth/login      log in and get a token
//   GET  /api/auth/me         who am I? (needs a token)
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const pool = require("../config/db");
const { authenticate, requireRole } = require("../middleware/auth");
const { LOCATIONS, clean, isEmail, isPhone, isStrongPassword } = require("../utils/validators");
const { ROLES, isRole, findById, findByEmail, emailTaken, publicUser } = require("../utils/users");

const router = express.Router();

// Stops people from trying thousands of passwords: only a few attempts per IP address.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." }
});

function signToken(role, id) {
  return jwt.sign({ id: id, role: role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

// A fake hash. When the email does not exist we still run bcrypt against this one,
// so the server takes the same time and nobody can use speed to discover which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/* ---------------------------------------------------------------- REGISTER */
router.post("/register", authLimiter, async (req, res) => {
  const body = req.body || {};
  const role = body.role;

  // Nobody can create an admin account through the website.
  if (role !== "customer" && role !== "provider") {
    return res.status(400).json({ error: "Please fix the highlighted fields.", fields: { role: "Choose customer or provider." } });
  }

  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const location = clean(body.location) || "Thimphu";
  const password = body.password;
  const fields = {};

  if (name.length < 3 || name.length > 100) fields.name = "Enter your full name (3 to 100 characters).";
  if (!isEmail(email)) fields.email = "Enter a valid email address.";
  if (!isPhone(phone)) fields.phone = "Enter 8 digits (for example 17123456).";
  if (!LOCATIONS.includes(location)) fields.location = "Choose a location from the list.";
  if (!isStrongPassword(password)) fields.password = "Use at least 8 characters, one number and one symbol.";

  let address = "", category = "", rate = 0, experience = 0, bio = "";
  if (role === "customer") {
    address = clean(body.address);
    if (address.length < 5 || address.length > 500) fields.address = "Enter your full address (at least 5 characters).";
  } else {
    category = clean(body.category);
    rate = Number(body.rate);
    experience = body.experience === undefined || body.experience === "" ? 0 : Number(body.experience);
    bio = clean(body.bio);
    if (!category) fields.category = "Choose a service category.";
    if (!Number.isFinite(rate) || rate < 50 || rate > 100000) fields.rate = "Enter a rate of at least Nu. 50 per hour.";
    if (!Number.isInteger(experience) || experience < 0 || experience > 50) fields.experience = "Enter a whole number from 0 to 50.";
    if (bio.length > 300) fields.bio = "Keep your bio under 300 characters.";
  }

  // The category must be a real one (the admin manages the list).
  if (role === "provider" && category && !fields.category) {
    const [rows] = await pool.execute("SELECT name FROM service WHERE name = ?", [category]);
    if (rows.length === 0) fields.category = "Choose a category from the list.";
    else category = rows[0].name;      // use the exact spelling stored in the database
  }

  if (Object.keys(fields).length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", fields });
  }
  if (await emailTaken(email)) {
    return res.status(409).json({ error: "This email is already registered.", fields: { email: "This email is already registered." } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let id;
  try {
    if (role === "customer") {
      const [result] = await pool.execute(
        "INSERT INTO customer (name, email, phone_number, location, address, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [name, email, phone, location, address, passwordHash]);
      id = result.insertId;
    } else {
      // New providers start NOT verified: the admin must verify them first.
      const [result] = await pool.execute(
        `INSERT INTO service_provider (name, email, phone_number, password_hash, category, location, experience_years, rate_per_hour, bio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, email, phone, passwordHash, category, location, experience, rate, bio || null]);
      id = result.insertId;
    }
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {      // two people registering the same email at the same moment
      return res.status(409).json({ error: "This email is already registered.", fields: { email: "This email is already registered." } });
    }
    throw err;
  }

  const row = await findById(role, id);
  res.status(201).json({ message: "Account created. Please log in.", user: publicUser(role, row) });
});

/* ------------------------------------------------------------------- LOGIN */
router.post("/login", authLimiter, async (req, res) => {
  const body = req.body || {};
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;

  if (!email || !password || !isRole(role)) {
    return res.status(400).json({ error: "Email, password and role are required." });
  }

  const row = await findByEmail(role, email);
  const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

  // One message for every kind of failure, so attackers learn nothing.
  if (!row || !passwordOk) {
    return res.status(401).json({ error: "Wrong email, password or role." });
  }
  if (row.is_suspended) {      // only said AFTER the password is correct
    return res.status(403).json({ error: "This account has been suspended. Please contact the admin." });
  }

  res.json({ token: signToken(role, row[ROLES[role].idColumn]), user: publicUser(role, row) });
});

/* ---------------------------------------------------------------------- ME */
router.get("/me", authenticate, async (req, res) => {
  const row = await findById(req.user.role, req.user.id);
  res.json({ user: publicUser(req.user.role, row) });
});

/* --------------------------------------------------------------------------
   DEMO ROUTES: they only prove that role checks work. They are removed in
   Backend Step 6, when the real provider and admin routes exist.
   -------------------------------------------------------------------------- */
for (const role of ["customer", "provider", "admin"]) {
  router.get("/demo/" + role, authenticate, requireRole(role), (req, res) => {
    res.json({ message: "Hello " + req.user.name + ", you are allowed to use the " + role + " area." });
  });
}

module.exports = router;
