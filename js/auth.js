/* ===== Login and Register logic (login.html and register.html) ===== */

// Where each role goes after logging in (these pages are built in later steps)
const HOME_PAGE = {
  customer: "customer/home.html",
  provider: "provider/dashboard.html",
  admin: "admin/dashboard.html"
};

function showAlert(boxId, message, type) {
  document.getElementById(boxId).innerHTML =
    `<div class="alert alert-${type} py-2" role="alert">${DS.esc(message)}</div>`;
}

/* ================= LOGIN PAGE ================= */
const loginForm = document.getElementById("loginForm");
if (loginForm) {

  // Message after a successful registration
  if (new URLSearchParams(location.search).get("registered")) {
    showAlert("loginAlert", "Account created! Please log in.", "success");
  }

  // Show / hide password
  document.getElementById("togglePw").addEventListener("click", () => {
    const pw = document.getElementById("password");
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    document.querySelector("#togglePw i").className = show ? "bi bi-eye-slash" : "bi bi-eye";
  });

  // Click a test account to fill the form
  document.querySelectorAll(".demo-fill").forEach(link => {
    link.addEventListener("click", () => {
      document.getElementById("email").value = link.dataset.email;
      document.getElementById("password").value = link.dataset.pw;
      document.querySelector(`input[name=role][value=${link.dataset.role}]`).checked = true;
    });
  });

  // BACKEND: these two need a real server later (email reset link, Google sign-in).
  document.getElementById("forgotLink").addEventListener("click", e => {
    e.preventDefault();
    DS.toast("Password reset needs the backend. It will email a reset link.", "secondary");
  });
  document.getElementById("googleBtn").addEventListener("click", () => {
    DS.toast("Google sign-in needs the backend. Use email and password for now.", "secondary");
  });

  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    const emailEl = document.getElementById("email");
    const pwEl = document.getElementById("password");
    const role = document.querySelector("input[name=role]:checked").value;

    emailEl.classList.toggle("is-invalid", !emailEl.checkValidity());
    pwEl.classList.toggle("is-invalid", !pwEl.value);
    if (!emailEl.checkValidity() || !pwEl.value) return;

    // BACKEND: replace this block with a call to POST /api/login
    // (a real server should show ONE general message such as "Wrong email or password";
    //  the specific messages below are only to help you while testing)
    const email = emailEl.value.trim().toLowerCase();
    const user = DS.get("users", []).find(u => u.email.toLowerCase() === email);

    if (!user) {
      showAlert("loginAlert", "No account found with this email. Please register first, or use a test account below.", "danger");
      return;
    }
    if (user.password !== pwEl.value) {
      showAlert("loginAlert", "Incorrect password. Please try again.", "danger");
      return;
    }
    if (user.role !== role) {
      showAlert("loginAlert", "This email is registered as a " + user.role + ". Please select \"" +
        user.role.charAt(0).toUpperCase() + user.role.slice(1) + "\" above.", "danger");
      return;
    }
    DS.login(user);
    location.href = DS.base + HOME_PAGE[user.role];
  });
}

/* ================= REGISTER PAGE ================= */
const regForm = document.getElementById("registerForm");
if (regForm) {
  const $ = id => document.getElementById(id);

  // Fill the dropdowns
  $("location").innerHTML = LOCATIONS.map(l => `<option>${l}</option>`).join("");
  $("category").innerHTML = SERVICES.map(s => `<option>${s.name}</option>`).join("");

  // Customer / Provider switch
  function applyRole() {
    const isProvider = document.querySelector("input[name=role]:checked").value === "provider";
    $("customerFields").classList.toggle("d-none", isProvider);
    $("providerFields").classList.toggle("d-none", !isProvider);
  }
  document.querySelectorAll("input[name=role]").forEach(r => r.addEventListener("change", applyRole));
  if (new URLSearchParams(location.search).get("role") === "provider") {
    $("regProvider").checked = true;
  }
  applyRole();

  // Password rule from your documentation: 8+ characters, a number and a symbol
  const strongPw = pw => pw.length >= 8 && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);

  // Password strength bar
  $("password").addEventListener("input", () => {
    const pw = $("password").value;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    const bar = $("strengthBar");
    bar.style.width = (score * 25) + "%";
    bar.style.background = ["#DC2626", "#DC2626", "#F59E0B", "#16A34A", "#16A34A"][score];
  });

  regForm.addEventListener("submit", e => {
    e.preventDefault();
    const role = document.querySelector("input[name=role]:checked").value;
    const isProvider = role === "provider";
    const users = DS.get("users", []);
    let ok = true;

    function check(id, valid, message) {
      const el = $(id);
      el.classList.toggle("is-invalid", !valid);
      if (message && !valid) {
        const fb = el.parentElement.querySelector(".invalid-feedback");
        if (fb) fb.textContent = message;
      }
      if (!valid) ok = false;
    }

    check("name", $("name").value.trim().length >= 3);
    const emailTaken = users.some(u => u.email.toLowerCase() === $("email").value.trim().toLowerCase());
    check("email", $("email").checkValidity() && !emailTaken,
          emailTaken ? "This email is already registered." : "Please enter a valid email.");
    check("phone", $("phone").checkValidity() && $("phone").value !== "");
    if (!isProvider) check("address", $("address").value.trim().length >= 5);
    if (isProvider) check("rate", Number($("rate").value) >= 50);
    check("password", strongPw($("password").value));
    check("confirm", $("confirm").value === $("password").value && $("confirm").value !== "");
    $("terms").classList.toggle("is-invalid", !$("terms").checked);
    if (!$("terms").checked) ok = false;
    if (!ok) { showAlert("regAlert", "Please fix the highlighted fields.", "danger"); return; }

    // BACKEND: replace this block with POST /api/register
    // (the server must save password_hash, never the real password)
    const newUser = {
      id: Date.now(),
      role: role,
      name: $("name").value.trim(),
      email: $("email").value.trim().toLowerCase(),
      phone: $("phone").value.trim(),
      location: $("location").value,
      address: isProvider ? "" : $("address").value.trim(),
      password: $("password").value
    };

    if (isProvider) {
      const providers = DS.get("providers", []);
      const providerId = Date.now();
      providers.push({
        id: providerId, name: newUser.name, category: $("category").value, rating: 0, reviews: 0,
        experience: Number($("experience").value) || 0, rate: Number($("rate").value),
        location: newUser.location, verified: false,      // the admin must verify later
        phone: newUser.phone, email: newUser.email, bio: $("bio").value.trim()
      });
      DS.set("providers", providers);
      newUser.providerId = providerId;
    }

    users.push(newUser);
    DS.set("users", users);
    location.href = "login.html?registered=1";
  });
}
