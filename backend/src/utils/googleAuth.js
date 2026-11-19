'use strict';
// Checks a Google sign-in. The browser gets a signed "ID token" from Google after the person picks their Google account.
// This file asks Google's library to prove that the token is real, not expired, and meant for THIS website (the Client ID).
// "google-auth-library" is only loaded when someone really signs in with Google.

let override = null;                           // tests replace the check with a fake one
function setVerifier(fn) { override = fn; }

async function verify(config, credential) {
  if (override) return override(credential);
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(config.googleClientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  return ticket.getPayload();                  // { email, email_verified, name, sub, ... }
}

module.exports = { verify, setVerifier };