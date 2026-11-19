/* Adds the demo data from the frontend (js/data.js) and the three test accounts.
     npm run db:seed       only works on an EMPTY database
     npm run db:reseed     starts again from nothing, then adds the demo data
   For testing only. Never run this on a real website. */
require('dotenv').config();
const { loadConfig } = require('../src/config');
const { createDb } = require('../src/db/mysql');
const { seedDemo, DEMO_PASSWORDS } = require('../src/seed/demoData');

(async () => {
  const config = loadConfig(process.env);
  if (config.nodeEnv === 'production') throw new Error('The demo data must not be added when NODE_ENV=production.');

  const db = createDb(config);
  const existing = Number((await db.get('SELECT COUNT(*) AS n FROM services')).n)
                 + Number((await db.get('SELECT COUNT(*) AS n FROM customers')).n);
  if (existing > 0) {
    await db.close();
    throw new Error('The database already has data. To start again, run:  npm run db:reseed');
  }

  await seedDemo(db);
  await db.close();

  console.log('Demo data added. Test accounts (email / password):');
  console.log(`  Customer  customer@drukserve.bt  ${DEMO_PASSWORDS.customer}`);
  console.log(`  Provider  provider@drukserve.bt  ${DEMO_PASSWORDS.provider}   (the other providers use the same password)`);
  console.log(`  Admin     admin@drukserve.bt     ${DEMO_PASSWORDS.admin}`);
})().catch(err => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
