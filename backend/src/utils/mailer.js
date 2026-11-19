'use strict';
// Sends emails. Two modes:
//   SMTP_HOST set in .env  -> a real email goes out (for Gmail: smtp.gmail.com + an "app password", see GUIDE.md)
//   SMTP_HOST empty        -> nothing is sent; the email is printed in the backend terminal instead.
//                             Good for development and for your demo without any email account.
// "nodemailer" is only loaded when SMTP_HOST is set.

let override = null;                           // tests replace the sending with a function that keeps the emails

function setTransport(fn) { override = fn; }

async function send(config, { to, subject, text }) {
  const mail = config.mail || {};
  if (override) return override({ to, subject, text });

  if (!mail.host) {
    console.log('\n----- EMAIL (not sent: SMTP_HOST is empty in .env) -----');
    console.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
    console.log('--------------------------------------------------------\n');
    return;
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: mail.host, port: mail.port, secure: mail.port === 465,
    auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined
  });
  await transporter.sendMail({ from: mail.from, to, subject, text });
}

module.exports = { send, setTransport };