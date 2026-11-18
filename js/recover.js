/* ===== Forgot password and choose a new password (forgot.html, reset-password.html) ===== */

function recoverAlert(boxId, message, type) {
  document.getElementById(boxId).innerHTML = `<div class="alert alert-${type} py-2" role="alert">${DS.esc(message)}</div>`;
}

/* ================= FORGOT PAGE: ask for the email link ================= */
const forgotForm = document.getElementById("forgotForm");
if (forgotForm) {
  const emailEl = document.getElementById("fpEmail");
  forgotForm.addEventListener("submit", async e => {
    e.preventDefault();
    emailEl.classList.toggle("is-invalid", !emailEl.checkValidity());
    if (!emailEl.checkValidity()) return;

    const button = document.getElementById("fpBtn");
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';
    try {
      // POST /api/forgot-password : the answer is always the same, whether or not the email is registered
      const done = await API.post("/forgot-password", { email: emailEl.value.trim() });
      recoverAlert("fpAlert", done.message, "success");
      forgotForm.reset();
    } catch (err) {
      recoverAlert("fpAlert", err.message, "danger");
    }
    button.disabled = false;
    button.textContent = "Send reset link";
  });
}

/* ================= RESET PAGE: choose the new password ================= */
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  const token = new URLSearchParams(location.search).get("token") || "";
  const pw = document.getElementById("rpPw");
  const pw2 = document.getElementById("rpPw2");
  const strong = v => v.length >= 8 && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);

  if (!/^[0-9a-f]{64}$/.test(token)) {
    resetForm.classList.add("d-none");
    document.getElementById("rpAlert").innerHTML = `<div class="alert alert-danger py-2">This link is not complete.
      Please <a href="forgot.html" class="alert-link">ask for a new one</a>.</div>`;
  }

  document.getElementById("rpToggle").addEventListener("click", () => {
    const show = pw.type === "password";
    pw.type = pw2.type = show ? "text" : "password";
    document.querySelector("#rpToggle i").className = show ? "bi bi-eye-slash" : "bi bi-eye";
  });

  resetForm.addEventListener("submit", async e => {
    e.preventDefault();
    pw.classList.toggle("is-invalid", !strong(pw.value));
    pw2.classList.toggle("is-invalid", pw.value !== pw2.value);
    if (!strong(pw.value) || pw.value !== pw2.value) return;

    const button = document.getElementById("rpBtn");
    button.disabled = true;
    try {
      // POST /api/reset-password : the secret from the email link and the new password
      const done = await API.post("/reset-password", { token: token, newPassword: pw.value });
      resetForm.classList.add("d-none");
      document.getElementById("rpAlert").innerHTML = `<div class="alert alert-success py-2">${DS.esc(done.message)}</div>
        <a href="login.html" class="btn btn-primary w-100 py-2">Go to log in</a>`;
    } catch (err) {
      const text = (err.fields && err.fields.newPassword) || err.message;
      recoverAlert("rpAlert", text, "danger");
      button.disabled = false;
    }
  });
}