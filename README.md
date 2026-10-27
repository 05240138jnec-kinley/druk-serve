# Druk Serve - Frontend

A website for booking trusted home services in Bhutan (plumbing, electrical, cleaning, carpentry, painting, appliance repair and more).
Built with **HTML, CSS, JavaScript and Bootstrap 5** as a Diploma in Computer Systems and Networking project (JNEC, Royal University of Bhutan).

There are three kinds of users: **Customers** book services, **Service Providers** manage jobs, and the **Admin** verifies providers and manages the platform.

> This is the **frontend only**. All data is sample data saved in the browser (localStorage). A backend and database will replace it later.

## How to run

1. Install **VS Code** and the **Live Server** extension (by Ritwick Dey).
2. Open this folder in VS Code (File > Open Folder).
3. Right-click `index.html` and choose **Open with Live Server**.
4. You need internet: Bootstrap, icons and fonts load from a CDN.

To reset the sample data at any time, open `/reset.html` on the same address (for example `127.0.0.1:5500/reset.html`).

## Test accounts

| Role | Email | Password |
|---|---|---|
| Customer | customer@drukserve.bt | Customer@123 |
| Provider | provider@drukserve.bt | Provider@123 |
| Admin | admin@drukserve.bt | Admin@123 |

You can also register new customer and provider accounts. New providers must be verified by the admin before customers can see them.

## Folder structure

```
druk-serve/
├── index.html            Landing page
├── login.html            Login (Customer / Provider / Admin)
├── register.html         Register (Customer / Provider)
├── reset.html            Developer helper: resets the sample data
├── css/style.css         All styling
├── js/
│   ├── data.js           Sample data (stands in for the database)
│   ├── app.js            Shared code: storage, login session, menu, footer
│   ├── public.js         Landing page
│   ├── auth.js           Login and register
│   ├── customer.js       Customer home, providers list, provider profile
│   ├── booking.js        Booking, payment, My Bookings
│   ├── account.js        Rating, notifications, My Profile (customers and providers)
│   ├── provider.js       Provider dashboard, services, earnings, feedback
│   └── admin.js          Admin dashboard
├── customer/             home, providers, provider-profile, booking, payment,
│                         my-bookings, feedback, notifications, profile
├── provider/             dashboard, services, earnings, feedback, notifications, profile
└── admin/                dashboard
```

## What each user can do

**Customer:** search and filter providers, view profiles and reviews, book a service (date, time, address, notes), pay online or by cash, track bookings with a status timeline, cancel a booking, rate a service, see notifications, edit their profile and change their password.

**Service Provider:** register and set up a profile, add a service, rate, working days and hours, accept or decline job requests, mark jobs completed, see payment records, read and reply to customer feedback.

**Admin:** see platform statistics, verify or revoke providers, suspend or activate users, add, edit and delete service categories, view reports.

## How the data works now

Everything is stored in the browser under keys starting with `ds_` (users, providers, bookings, feedback, notifications, categories, session).
The only functions that touch storage are `DS.get` and `DS.set` in `js/app.js`, and every place that must change for a real backend is marked with a `// BACKEND:` comment.

## Connecting to a backend later

Keep all HTML and CSS as they are. Replace each `BACKEND:` block with a `fetch` call. Example (login in `js/auth.js`):

```js
const res = await fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, role })
});
if (!res.ok) { showAlert("loginAlert", "Wrong email or password.", "danger"); return; }
const data = await res.json();          // the server returns the user and a login token
DS.login(data.user);
```

| Frontend feature | File | Suggested API | Database table |
|---|---|---|---|
| Register, login | auth.js | `POST /api/register`, `POST /api/login` | Customer, Service Provider (store `password_hash`) |
| Categories | app.js, admin.js | `GET /api/categories`, `POST/PUT/DELETE /api/admin/categories` | Category |
| Provider search and profile | customer.js | `GET /api/providers?verified=true`, `GET /api/providers/:id` | Service Provider |
| Create / list / cancel booking | booking.js | `POST /api/bookings`, `GET /api/bookings`, `PUT /api/bookings/:id` | Booking |
| Payment | booking.js | `POST /api/payments` (BOB mPay / BNB ePay) | Payment |
| Rating and reply | account.js, provider.js | `POST /api/feedback`, `PUT /api/feedback/:id/reply` | Feedback |
| Profile and password | account.js | `PUT /api/profile`, `PUT /api/profile/password` | Customer, Service Provider |
| Notifications | account.js | Firebase (real time) | Notification |
| Provider jobs, services, earnings | provider.js | `PUT /api/bookings/:id`, `PUT /api/provider/services`, `GET /api/provider/payments` | Booking, Service Provider, Payment |
| Admin actions | admin.js | `PUT /api/admin/providers/:id/verify`, `PUT /api/admin/users/:id/status`, `GET /api/admin/reports` | all |

Important when you add a backend: the server must check the user's role on every request, hash passwords, and calculate prices and ratings itself instead of trusting the browser.

## Known limits of the frontend-only version

- Payments are pretend (a short "Processing" screen). The QR code is a placeholder.
- "Sign in with Google" and "Forgot password" show a message because they need a server.
- Profile photos are not supported (they need file storage). Coloured initials are shown instead.
- Notifications are shared by role, not per person.
- Passwords are kept in plain text in the browser for testing only.
