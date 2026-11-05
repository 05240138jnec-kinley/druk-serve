// Login checks used by protected routes.
//   authenticate     -> "is this person logged in?"   (401 if not)
//   requireRole(...) -> "are they allowed to do this?" (403 if not)
const jwt = require("jsonwebtoken");
const { isRole, findById } = require("../utils/users");

async function authenticate(req, res, next) {
  const [type, token] = (req.headers.authorization || "").split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Please log in first." });
  }

  let payload;
  try {
    // algorithms is fixed so nobody can sneak in a token signed in another way
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    return res.status(401).json({ error: "Your login is invalid or has expired. Please log in again." });
  }
  if (!isRole(payload.role) || !Number.isInteger(payload.id)) {
    return res.status(401).json({ error: "Your login is invalid or has expired. Please log in again." });
  }

  // Look the person up again on EVERY request, so a deleted or suspended
  // account is blocked straight away, even if its token has not expired.
  const user = await findById(payload.role, payload.id);
  if (!user) return res.status(401).json({ error: "This account no longer exists." });
  if (user.is_suspended) return res.status(403).json({ error: "This account has been suspended. Please contact the admin." });

  req.user = { id: payload.id, role: payload.role, name: user.name, email: user.email };
  next();
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do this." });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
