'use strict';
// The Express application (document 2.3.1 / 4.1: "Node.js with Express.js").
// Express only does the "outside" jobs: security headers, CORS, reading JSON and slowing down password guessing.
// Every /api request is then given to the handler in src/http/handler.js.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createHandler } = require('./http/handler');
const photoStore = require('./utils/photoStore');

function createApp({ db, gateway, config }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));   // safe response headers
  app.use(cors({
    origin: config.corsOrigins,                                                   // only your frontend may call the API from a browser
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: '3mb' }));

  // Slows down password guessing: a few attempts per IP address every 15 minutes (document 3.4 Security)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
  });
  app.use(['/api/login', '/api/register', '/api/forgot-password', '/api/reset-password', '/api/google-login'], authLimiter);

  // Uploaded profile pictures are plain files that the pages show with <img src="...">
  app.use('/uploads', express.static(photoStore.uploadRoot(), { index: false, dotfiles: 'deny', maxAge: '7d', immutable: true }));

  const handle = createHandler({ db, gateway, config });
  app.use('/api', async (req, res) => {
    const result = await handle({
      method: req.method,
      path: req.baseUrl + req.path,      // for example "/api/providers/3"
      headers: req.headers,
      query: req.query,
      body: req.body
    });
    res.status(result.status).json(result.body);
  });

  // A friendly page when you open http://localhost:5000 in the browser
  app.get('/', (req, res) => res.json({ name: 'Druk Serve API', status: 'running', try: '/api/health' }));
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // Bad JSON from the client, or a body that is too big
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });

  return app;
}

module.exports = { createApp };