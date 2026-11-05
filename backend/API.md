# Druk Serve API

Base address while developing: `http://localhost:3000/api`
Every answer is JSON. Errors look like `{ "error": "message" }` and, for forms, `{ "error": "...", "fields": { "email": "..." } }`.
Routes marked **token** need the header `Authorization: Bearer <token>` (the token comes from login).

## Health

| Method | Address | What it does |
|---|---|---|
| GET | `/health` | Checks the server and database; shows the row count of every table |

## Authentication

| Method | Address | Who | What it does |
|---|---|---|---|
| POST | `/auth/register` | anyone | Create a customer or provider account |
| POST | `/auth/login` | anyone | Log in, returns a `token` and the `user` |
| GET | `/auth/me` | token | The logged-in user's details |

### POST /auth/register - customer
```json
{ "role": "customer", "name": "Dorji Wangchuk", "email": "dorji@example.com", "phone": "17123456",
  "location": "Paro", "address": "Main Street, Paro", "password": "Test@1234" }
```

### POST /auth/register - provider
```json
{ "role": "provider", "name": "Lhaki Dema", "email": "lhaki@example.com", "phone": "17654321",
  "location": "Punakha", "category": "Plumbing", "rate": 300, "experience": 3, "bio": "Plumber",
  "password": "Test@1234" }
```
Success: `201 { "message": "Account created. Please log in.", "user": { ... } }`
New providers are **not verified** until the admin verifies them.

### POST /auth/login
```json
{ "email": "customer@drukserve.bt", "password": "Customer@123", "role": "customer" }
```
Success: `200 { "token": "eyJ...", "user": { "id": 1, "role": "customer", "name": "...", ... } }`
`role` is `customer`, `provider` or `admin`.

### Status codes used
| Code | Meaning |
|---|---|
| 200 / 201 | Worked / created |
| 400 | The data sent is not valid |
| 401 | Not logged in, or wrong email/password, or the token is invalid or expired |
| 403 | Logged in but not allowed (wrong role, or the account is suspended) |
| 404 | No such address |
| 409 | The email is already registered |
| 429 | Too many attempts, wait a few minutes |

## Rules the server enforces
- Passwords: at least 8 characters, one number, one symbol. Saved only as a bcrypt hash.
- Phone: 8 digits, optionally starting with +975.
- One email belongs to one account only (across customers, providers and admin).
- Nobody can register as admin through the API.
- A suspended or deleted account is blocked on its very next request, even with a valid token.
- Login and register are limited to 30 attempts per 15 minutes per computer.
