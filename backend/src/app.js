// Builds the Express app: middleware and routes. server.js starts it.
const express = require("express");
const cors = require("cors");
const { notFound, errorHandler } = require("./middleware/errors");

const app = express();

app.use(cors());           // lets the website talk to this API
app.use(express.json());   // lets the API read JSON sent by the website

// ---- routes ----
app.use("/api/health", require("./routes/health"));
app.use("/api/auth", require("./routes/auth"));
// More routes are added in the next backend steps (providers, bookings, ...).

app.use("/api", notFound);   // any other /api/... address
app.use(errorHandler);

module.exports = app;
