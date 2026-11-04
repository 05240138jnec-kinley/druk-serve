// Handles routes that do not exist and any error thrown inside a route.

function notFound(req, res) {
  res.status(404).json({ error: "Route not found: " + req.method + " " + req.originalUrl });
}

// Express recognises an error handler by its 4 parameters.
function errorHandler(err, req, res, next) {   // eslint-disable-line no-unused-vars
  console.error("[ERROR]", err.code || "", err.message);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body is not valid JSON." });
  }
  if (err.code === "ECONNREFUSED") {
    return res.status(503).json({ error: "Cannot reach MySQL. Open XAMPP and click Start next to MySQL." });
  }
  if (err.code === "ER_BAD_DB_ERROR") {
    return res.status(503).json({ error: "Database not found. Run:  npm run db:setup" });
  }
  if (err.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "A table is missing. Run:  npm run db:setup" });
  }
  res.status(err.status || 500).json({ error: "Something went wrong on the server." });
}

module.exports = { notFound, errorHandler };
