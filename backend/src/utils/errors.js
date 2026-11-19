'use strict';

// An error we throw on purpose. The error middleware turns it into a JSON answer:
//   { "error": "message", "fields": { "email": "message for that input box" } }
class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.fields = fields || null;
  }
}

const badRequest   = (message, fields) => new AppError(400, message, fields);
const unauthorized = (message = 'Please log in first.') => new AppError(401, message);
const forbidden    = (message = 'You do not have permission to do this.') => new AppError(403, message);
const notFound     = (message = 'Not found.') => new AppError(404, message);
const conflict     = (message, fields) => new AppError(409, message, fields);

// True when MySQL (or SQLite in the tests) says "this value must be unique but already exists".
const isDuplicateError = e =>
  !!e && (e.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/i.test(e.message || ''));

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, isDuplicateError };
