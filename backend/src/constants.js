'use strict';
// Values shared by the whole backend. They match the frontend (js/data.js) and the project document.

module.exports = {
  ROLES: ['customer', 'provider', 'admin'],

  // Same list as the frontend LOCATIONS in js/data.js
  LOCATIONS: ['Thimphu', 'Paro', 'Phuentsholing', 'Punakha', 'Dewathang', 'Other'],

  // Booking status (document 3.7 Booking Table)
  ALL_STATUSES: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
  ACTIVE_STATUSES: ['Pending', 'Confirmed'],

  // Payment methods. "mPay" and "BNB ePay" are the exact values the frontend payment page sends.
  PAYMENT_METHODS: ['mPay', 'BNB ePay', 'Card', 'Cash'],

  MIN_RATE: 50,        // Nu. per hour (frontend: register.html and My Services)
  MAX_RATE: 100000,
  MAX_HOURS: 8,        // frontend booking page offers 1 to 8 hours
  MAX_EXPERIENCE: 50
};
