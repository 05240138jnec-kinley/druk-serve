'use strict';
// Start the backend:   npm start      (or  npm run dev  to restart automatically when you save a file)

require('dotenv').config();                       // reads the .env file
const { loadConfig } = require('./src/config');
const { createDb } = require('./src/db/mysql');
const { createGateway } = require('./src/payments/gateway');
const { createApp } = require('./src/app');

async function main() {
  const config = loadConfig(process.env);
  const db = createDb(config);

  try {
    await db.ping();
  } catch (e) {
    console.error(`\nCannot connect to MySQL: ${e.message}`);
    console.error('Check that MySQL is running and that DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in .env are correct.');
    console.error('If the database does not exist yet, run:  npm run db:setup\n');
    process.exit(1);
  }

  const gateway = createGateway(config.paymentMode);
  const app = createApp({ db, gateway, config });
  const server = app.listen(config.port, () => {
    console.log(`Druk Serve API is running on http://localhost:${config.port}`);
    console.log(`Database: ${config.db.name} | Payments: ${gateway.name} | Allowed website: ${config.corsOrigins.join(', ')}`);
  });

  const stop = () => server.close(() => db.close().then(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch(e => {
  console.error('\nCould not start:', e.message, '\n');
  process.exit(1);
});
