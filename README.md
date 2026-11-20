# Druk Serve

A website for booking trusted home services in Bhutan (plumbing, electrical, cleaning, carpentry, painting, appliance repair and more).
Built with **HTML, CSS, JavaScript and Bootstrap 5** (frontend) and **Node.js, Express and MySQL** (backend) as a Diploma in Computer Systems and Networking project (JNEC, Royal University of Bhutan).

There are three kinds of users: **Customers** book services, **Service Providers** manage jobs, and the **Admin** verifies providers and manages the platform.

> The frontend is connected to the backend. All data (users, bookings, payments, feedback, notifications, photos) is saved in a MySQL database through the API in the `backend/` folder.

## How to run

You need **Node.js 18 or newer**, **MySQL 8** (or XAMPP), **VS Code** and the **Live Server** extension (by Ritwick Dey).

**1. Start the backend** (in a terminal, inside the `backend` folder)

```bash
npm install
copy .env.example .env        # Windows   (Mac/Linux: cp .env.example .env)
```

Open `backend/.env` and set `DB_PASSWORD` (your MySQL password) and `JWT_SECRET` (a long random text, 32+ characters). Then:

```bash
npm run db:setup      # creates the database and tables
npm run db:seed       # adds sample data and the three test accounts
npm run dev           # starts the API on http://localhost:5000
```

Check it: open `http://localhost:5000/api/health`. You should see `{"status":"ok"}`.

**2. Start the website**

1. Open this folder in VS Code (File > Open Folder).
2. Right-click `index.html` and choose **Open with Live Server**.
3. Open the site as `http://localhost:5500` (not `127.0.0.1:5500`). Google sign-in only works from `localhost`.
4. You need internet: Bootstrap, icons and fonts load from a CDN.

To start again from empty sample data, run `npm run db:reseed` in the `backend` folder.

## Test accounts

| Role | Email | Password |
|---|---|---|
| Customer | customer@drukserve.bt | Customer@123 |
| Provider | provider@drukserve.bt | Provider@123 |
| Admin | admin@drukserve.bt | Admin@123 |

You can also register new customer and provider accounts. New providers must be verified by the admin before customers can see them.
The same email can have **two separate accounts**, one Customer and one Service Provider, each with its own password. The role chosen on the login page decides which one opens.

## Folder structure

```
druk-serve/
├── index.html            Landing page
├── login.html            Login (Customer / Provider / Admin) and Sign in with Google
├── register.html         Register (Customer / Provider)
├── forgot.html           Forgot password (asks for the email)
├── reset-password.html   Choose a new password (opened from the reset link)
├── reset.html            Old developer helper (not used any more)
├── css/style.css         All styling
├── js/
│   ├── api.js            Talks to the backend (login token, session, get/post/put/delete)
│   ├── data.js           Service icons and small shared lists
│   ├── app.js            Shared code: login session, menu, footer, profile pictures
│   ├── public.js         Landing page
│   ├── auth.js           Login, register, Sign in with Google
│   ├── recover.js        Forgot password and reset password pages
│   ├── customer.js       Customer home, providers list, provider profile
│   ├── booking.js        Booking, payment, My Bookings
│   ├── account.js        Rating, notifications, My Profile and photo (customers and providers)
│   ├── provider.js       Provider dashboard, services, earnings, feedback
│   └── admin.js          Admin dashboard
├── customer/             home, providers, provider-profile, booking, payment,
│                         my-bookings, feedback, notifications, notification, profile
├── provider/             dashboard, services, earnings, feedback, notifications, profile
├── admin/                dashboard
└── backend/
    ├── server.js         Starts the API
    ├── database/         schema.sql, setup.js, seed.js
    ├── src/              app.js, config.js, http/ (routes), controllers/, db/, payments/, utils/
    ├── test/             48 automatic tests (run with npm test)
    └── GUIDE.md          Step-by-step backend guide
```

## What each user can do

**Customer:** search and filter providers, view profiles and reviews, book a service (date, time, address, notes) and see a confirmation with the booking details and status, pay after the job is done (online or cash), track bookings with a status timeline, cancel a booking, rate a service, see notifications, edit their profile, change their password and upload a profile photo.

**Service Provider:** register and set up a profile, add a service, rate, working days and hours, accept or decline job requests, mark jobs completed, confirm cash payments, see earnings, read and reply to customer feedback, upload a profile photo.

**Admin:** see platform statistics, verify or revoke providers, suspend or activate users, add, edit and delete service categories, view reports.

## Login, Google sign-in and forgot password

- **Register first.** An account is only created with the register form. **Sign in with Google** only logs in people who already registered (with the same email and the role chosen on the login page). Admin accounts use email and password only.
- **Forgot password:** the person types their email and gets a one-time link that works for 30 minutes. While `SMTP_HOST` is empty in `backend/.env`, the email is printed in the backend terminal instead of being sent. If an email has two accounts, each gets its own link.
- A suspended account is logged out at once and cannot log in.

## How payment works

Customers **pay after the job is done**, not when booking.

1. The customer books. No payment is created.
2. The provider accepts the job and marks it **Completed**. This only changes the job status. **The payment stays Pending.**
3. The customer pays from My Bookings (Pay Now). **Online:** the payment gateway charges the customer and the payment becomes **Paid**. **Cash:** the customer taps "I Paid in Cash" and the payment stays **Pending**.
4. For cash, the provider taps **Confirm Cash Received** once the money is really in their hand. Only then the payment becomes **Paid** and counts in their earnings.

The server takes the amount from the booking in the database, never from the browser.

## How the data works now

Everything is stored in MySQL (tables `customers`, `service_providers`, `services`, `bookings`, `payments`, `feedback`, `notifications`, `admins`, `profile_photos`, `password_resets`).
The frontend keeps only the login token (`ds_token`) and the signed-in user (`ds_user`, `ds_session`) in the browser. All requests go through `js/api.js`.
Profile pictures are saved as files in `backend/uploads/avatars` and only their path is stored in the database.

## How the frontend talks to the backend

| Frontend feature | File | API | Database table |
|---|---|---|---|
| Register, login, Google sign-in | auth.js | `POST /api/register`, `POST /api/login`, `POST /api/google-login` | customers, service_providers, admins |
| Forgot / reset password | recover.js | `POST /api/forgot-password`, `POST /api/reset-password` | password_resets |
| Categories | app.js, admin.js | `GET /api/categories`, `POST/PUT/DELETE /api/admin/categories` | services |
| Provider search and profile | customer.js | `GET /api/providers`, `GET /api/providers/:id` | service_providers |
| Create / list / cancel booking | booking.js | `POST /api/bookings`, `GET /api/bookings`, `PUT /api/bookings/:id` | bookings |
| Payment | booking.js | `POST /api/payments`, `POST /api/payments/:bookingId/confirm-cash` | payments |
| Rating and reply | account.js, provider.js | `POST /api/feedback`, `PUT /api/feedback/:id/reply` | feedback |
| Profile, password and photo | account.js | `PUT /api/profile`, `PUT /api/profile/password`, `PUT/DELETE /api/profile/photo` | customers, service_providers, profile_photos |
| Notifications | account.js | `GET /api/notifications`, `PUT /api/notifications/:id/read` | notifications |
| Provider jobs, services, earnings | provider.js | `PUT /api/bookings/:id`, `PUT /api/provider/services`, `GET /api/provider/payments`, `GET /api/provider/stats` | bookings, service_providers, payments |
| Admin actions | admin.js | `PUT /api/admin/providers/:id/verify`, `PUT /api/admin/users/:role/:id/status`, `GET /api/admin/reports` | all |

The server checks the user's role on every request, stores passwords as salted hashes, and calculates prices and ratings itself instead of trusting the browser. Login and register attempts are rate limited.

## Automatic tests

```bash
cd backend
npm test
```

48 tests check the rules (login and roles, same email in two roles, Google login rules, bookings, pay-after payments and cash confirmation, feedback, notifications, photos, forgot password, admin actions). They use a temporary in-memory database, so your real data is not touched.

## Known limits

- Online payments are sandbox only (pretend payments that always succeed). Real BOB mPay or BNB ePay needs the bank's merchant details.
- Reset emails are printed in the backend terminal until SMTP (for example Gmail) is set up in `backend/.env`.
- The website runs on your own computer (Live Server and `localhost`). It is not hosted online yet.
- While the Google app is in Testing mode, only the test users added in Google Cloud can use Sign in with Google.
- Notifications are loaded when a page opens (no live push). There are no refunds.