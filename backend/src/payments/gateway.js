'use strict';
// Online payment (document 2.2 "Payment Gateway", 2.3.1 "BOB mPay / BNB ePay", 4.2.6 Payment Page).
//
// A gateway is any object with ONE function:
//     charge({ amount, method, bookingId, customerId })  ->  { ok: true, reference: 'DS12345678' }
//                                                         or { ok: false, message: 'why it failed' }
//
// Two gateways are provided:
//   sandbox - pretends the payment worked (same as the frontend "Processing..." screen). Use for development and your demo.
//   live    - the place where the REAL BOB mPay / BNB ePay code goes. It cannot be written yet: the banks give
//             the API documents, merchant ID and secret keys only AFTER your merchant account is approved
//             (document key assumption: "BOB mPay and BNB ePay APIs are accessible for integration").
//             Until then it answers "not configured" so nobody is charged by mistake.

const crypto = require('node:crypto');

const sandboxGateway = {
  name: 'sandbox',
  async charge() {
    return { ok: true, reference: 'DS' + crypto.randomInt(10000000, 99999999) };
  }
};

const liveGateway = {
  name: 'live',
  async charge({ amount, method, bookingId }) {
    // TODO (after the bank approves your merchant account):
    //   1. Read the merchant ID and secret key from the .env file (never write them in the code).
    //   2. Send the payment request to the bank:  method "mPay" -> BOB mPay API,  method "BNB ePay" -> BNB ePay API.
    //   3. If the bank answers "success", return { ok: true, reference: <the bank's transaction number> }.
    //   4. If it fails, return { ok: false, message: <short reason> }.
    // Most banks confirm by calling a "callback URL" on your server. If so, add a route for it in src/routes/payments.js.
    return { ok: false, message: 'The live payment gateway is not configured yet. Please pay by cash.' };
  }
};

function createGateway(mode) {
  return mode === 'live' ? liveGateway : sandboxGateway;
}

module.exports = { createGateway, sandboxGateway, liveGateway };
