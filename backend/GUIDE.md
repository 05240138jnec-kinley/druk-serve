# Druk Serve Backend - Step by Step Guide

Built from your project document (Node.js + Express + MySQL, roles Customer / Provider / Admin, payments,
notifications) and from the `// BACKEND:` comments in your friend's frontend. Follow the steps in order.
Every step says **what it is**, **where it comes from** (document / frontend) and **how to check it works**.

---------------------------------------------------------------------
## Step 1 - Install the tools
* **Node.js 20 or 22** (nodejs.org) - check with `node -v`
* **MySQL 8** or **XAMPP** (MariaDB). Start MySQL.
* VS Code. Extension "REST Client" is useful for testing.

## Step 2 - Install the project
```bash
cd backend
npm install
```
Packages used and why: `express` (the web framework, document 2.3.1), `mysql2` (MySQL driver),
`cors` (lets your frontend call the API), `helmet` (safe headers), `express-rate-limit` (slows password guessing),
`dotenv` (reads `.env`). Passwords and login tokens use Node's built-in `crypto`, so no extra package.

## Step 3 - Settings (`.env`)
```bash
copy .env.example .env        (Windows)       cp .env.example .env   (Mac/Linux)
```
Open `.env`, set `DB_PASSWORD` and a long random `JWT_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The server refuses to start with a weak secret.

## Step 4 - Database (document 3.6 ERD, 3.7 Tables)
```bash
npm run db:setup      # creates database druk_serve and the tables from database/schema.sql
npm run db:seed       # sample data from the frontend + 3 test accounts
```
| Document table | Our table | Note |
|---|---|---|
| Customer | `customers` | + password_hash, location, is_suspended |
| Service Provider | `service_providers` | `service_id` link instead of text `category`; + working days/hours, is_verified |
| Service | `services` | the frontend calls it "category" |
| Booking | `bookings` | `total_amount` is calculated by the server |
| Payment | `payments` | one payment per booking, `transaction_ref` |
| Feedback | `feedback` | + provider `reply` |
| (extra) | `admins`, `notifications` | Admin module, notification system |

Test accounts: `customer@drukserve.bt / Customer@123`, `provider@drukserve.bt / Provider@123`, `admin@drukserve.bt / Admin@123`.
Start again from nothing: `npm run db:reseed`.

## Step 5 - Start the server
```bash
npm run dev
```
Open http://localhost:5000/api/health - you should see `{"status":"ok"}`.

## Step 6 - Register, login, roles (document 4.2.2, 4.2.4, 3.4 Security)
Files: `src/controllers/auth.js`, `src/utils/token.js`, `src/http/handler.js`
* `POST /api/register` - same rules as the frontend (name, email, 8-digit phone, password 8+ with number and symbol).
  Providers start **unverified**.
* `POST /api/login` `{email, password, role}` -> `{token, user}`. One general error for wrong email OR password.
* Passwords are stored as salted scrypt hashes, never as text.
* Every protected request sends `Authorization: Bearer <token>`. The server checks the token, that the account still
  exists and is not suspended (suspending someone logs them out at once), and the **role** - for every request.
* `GET /api/me` checks the saved login is still valid.

## Step 7 - Categories and finding providers (document 4.2.3)
Files: `controllers/categories.js`, `controllers/providers.js`
* `GET /api/categories` (public)
* `GET /api/providers?q=&service=&location=&maxPrice=&minRating=&sort=rating|priceLow|priceHigh|experience&limit=`
  Only verified, available, not-suspended providers. Email and phone are never public. The keyword search works like the
  frontend ("leaking tap" finds plumbers).
* `GET /api/providers/:id` - profile + `reviewList`.

## Step 8 - Bookings (document 4.2.5, 4.2.7)
File: `controllers/bookings.js`
* `POST /api/bookings` (customer) `{providerId, date, time, hours, address, notes}`
  The **server** checks the provider's working day/hours, rejects past times and **double booking**, and calculates
  `amount = rate x hours` (a price sent by the browser is ignored).
* `GET /api/bookings` - customer sees own, provider sees own, admin sees all. `?status=Pending,Confirmed`
* `PUT /api/bookings/:id` `{status}` - customer: Pending/Confirmed -> Cancelled.
  Provider: Pending -> Confirmed or Cancelled, Confirmed -> Completed. Anything else is refused.

## Step 9 - Payments (document 4.2.6)
Files: `controllers/payments.js`, `payments/gateway.js`
* `POST /api/payments` `{bookingId, method}` method = `mPay`, `BNB ePay`, `Card` or `Cash`.
  Online methods go through the gateway and get a reference like `DS12345678`. Cash is marked paid when the provider
  completes the job.
* **Important:** `PAYMENT_MODE=sandbox` pretends the payment worked (good for your demo). Real BOB mPay / BNB ePay needs
  merchant details and API documents from the bank. Put that code in `src/payments/gateway.js`. Nothing is faked
  without saying so.

## Step 10 - Feedback and ratings (document 4.2.9)
File: `controllers/feedback.js`
* `POST /api/feedback` `{bookingId, rating 1-5, comment}` - only for your own **completed** booking, once.
  The server updates the provider's average rating.
* `PUT /api/feedback/:id/reply` (provider) - one reply per review.

## Step 11 - Notifications (document 4.2.8, 4.3.5)
File: `controllers/notifications.js`
Created automatically by the server (new request, accepted, completed, payment, new feedback, verification...), one
list per person. `GET /api/notifications`, `GET /api/notifications/unread-count`, `PUT /api/notifications/:id/read`,
`PUT /api/notifications/read-all`, `DELETE /api/notifications`.
The frontend can poll `unread-count` every 30 seconds for the red number.

## Step 12 - Provider pages (document 4.3)
`GET /api/provider/me`, `PUT /api/provider/services` (category, rate, experience, bio, available, days, from, to),
`GET /api/provider/payments` (earnings), `GET /api/provider/stats` (dashboard numbers).

## Step 13 - Admin pages (document 4.4)
File: `controllers/admin.js`
`GET /api/admin/overview`, `GET /api/admin/providers?status=pending`, `PUT /api/admin/providers/:id/verify`,
`GET /api/admin/users`, `PUT /api/admin/users/:role/:id/status` `{suspended}`, `GET /api/admin/reports`,
`POST/PUT/DELETE /api/admin/categories`. A category that providers or bookings use cannot be deleted.
(The role is in the users address because a customer and a provider can have the same id number.)

## Step 14 - Connect the frontend
1. Copy `frontend-connect/api.js` to `druk-serve/js/api.js` and add `<script src="js/api.js"></script>` first on every page.
2. Open the frontend with **VS Code Live Server** (http://127.0.0.1:5500) - this matches `CORS_ORIGINS`.
3. Go through the `// BACKEND:` comments in `js/*.js` and replace each localStorage call with the API call.
   The data names already match the frontend (`providerId`, `payMethod`, `paid`, `txn`, `rate`, `reviews` ...).
   Do one page at a time: login/register first, then providers, bookings, payments, and so on.
4. Errors come as `{ "error": "message", "fields": { "email": "..." } }` - show `error` in the alert and `fields` under the inputs.
5. Remove the data that the frontend kept for itself (`DS.seed`, the reset button in `reset.html`) when everything works.

## Step 15 - Testing (document 5.3)
```bash
npm test
```
Runs 28+16 automatic tests on a real SQL engine: passwords, tokens, roles, the whole journey (register -> verify ->
book -> pay -> accept -> complete -> rate -> reply), suspension, SQL injection attempts, and a check that **every API
address** is tested. (Needs Node 22.5+; on older Node the database tests are skipped.)
For manual testing use Postman or the VS Code REST Client against http://localhost:5000/api.

---------------------------------------------------------------------
## Not included (say this honestly in your viva)
* **Real payment gateway** - sandbox only (needs bank merchant account).
* **Forgot password email** and **Sign in with Google** - need an email service / Google credentials. The login page
  buttons stay as "coming soon".
* **Refunds** when a paid booking is cancelled, **profile photo upload**, **dispute/complaint tickets**, **live GPS
  tracking** - the frontend has no screens for them.
* **Firebase real-time push** - notifications are stored in MySQL and the frontend polls.
* A login token cannot be cancelled before it expires (1 day), except by suspending the account.
* Not tested here: the Express wrapper `src/app.js` (about 30 lines: headers, CORS, rate limit). Everything it calls was tested.
  Run `npm run dev` and open `/api/health` to confirm it on your computer.
