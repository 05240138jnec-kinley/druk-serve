# Druk Serve - Backend

Node.js + Express REST API with a MySQL database (XAMPP).

## First-time setup

1. Start **MySQL** in the XAMPP Control Panel (it must be green).
2. In a terminal inside this `backend` folder:
   ```
   npm install
   Copy-Item .env.example .env
   npm run db:setup
   npm run dev
   ```
3. Open http://localhost:3000/api/health - you should see `"status": "ok"`.

`npm run db:setup` deletes and recreates the `druk_serve` database with sample data. Use it whenever you want a fresh start (it will erase your test data).

## Folder structure

```
backend/
├── server.js              starts the server
├── .env                   your private settings (NOT uploaded to GitHub)
├── .env.example           template for .env
├── database/
│   ├── schema.sql         all tables
│   ├── seed.js            sample data (passwords are hashed)
│   └── setup.js           creates the database: npm run db:setup
└── src/
    ├── app.js             Express app and routes
    ├── config/db.js       MySQL connection
    ├── middleware/        error handling
    └── routes/            one file per part of the API
```

## Test accounts (same as the website)

| Role | Email | Password |
|---|---|---|
| Customer | customer@drukserve.bt | Customer@123 |
| Provider | provider@drukserve.bt | Provider@123 |
| Admin | admin@drukserve.bt | Admin@123 |
