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
    location.href = "forgot.html";
  });

  // Sign in with Google (Google's own button, loaded from Google)
  (async () => {
    const btn = document.getElementById("googleBtn");
    let clientId = null;
    try { clientId = (await API.get("/auth-config")).googleClientId; } catch (e) { /* backend is off */ }
    if (!clientId) {
      btn.addEventListener("click", () => DS.toast("Google sign-in is not set up yet. Use email and password.", "secondary"));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async response => {
          try {
            const res = await API.post("/google-login", { credential: response.credential });   // POST /api/google-login
            API.saveSession(res.token, res.user);
            DS.login(res.user);
            location.href = DS.base + (res.created ? "customer/profile.html?welcome=1" : HOME_PAGE[res.user.role]);
          } catch (err) {
            showAlert("loginAlert", err.message, "danger");
          }
        }
      });
      const holder = document.createElement("div");
      holder.className = "d-flex justify-content-center";
      btn.replaceWith(holder);
      google.accounts.id.renderButton(holder, { theme: "outline", size: "large", text: "signin_with", width: 320 });
    };
    document.head.appendChild(script);
  })();  

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const emailEl = document.getElementById("email");
    const pwEl = document.getElementById("password");
    const role = document.querySelector("input[name=role]:checked").value;

    emailEl.classList.toggle("is-invalid", !emailEl.checkValidity());
    pwEl.classList.toggle("is-invalid", !pwEl.value);
    if (!emailEl.checkValidity() || !pwEl.value) return;

    try {
      const { token, user } = await API.post("/login", {
        email: emailEl.value.trim().toLowerCase(),
        password: pwEl.value,
        role: role
      });
      API.saveSession(token, user);   // token for the backend
      DS.login(user);                 // keeps the pages that still use localStorage working
      location.href = DS.base + HOME_PAGE[user.role];
    } catch (err) {
      showAlert("loginAlert", err.message, "danger");
    }
  });
}

/* ================= REGISTER PAGE ================= */
const regForm = document.getElementById("registerForm");
if (regForm) {
  const $ = id => document.getElementById(id);

  // Fill the dropdowns
  $("location").innerHTML = LOCATIONS.map(l => `<option>${l}</option>`).join("");
  API.get("/categories").then(list => {
    $("category").innerHTML = list.map(s => `<option>${DS.esc(s.name)}</option>`).join("");
  }).catch(() => {});
  
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

    regForm.addEventListener("submit", async e => {
    e.preventDefault();
    const role = document.querySelector("input[name=role]:checked").value;
    const isProvider = role === "provider";
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
        check("email", $("email").checkValidity(), "Please enter a valid email."); 
    check("phone", $("phone").checkValidity() && $("phone").value !== "");
    if (!isProvider) check("address", $("address").value.trim().length >= 5);
    if (isProvider) check("rate", Number($("rate").value) >= 50);
    check("password", strongPw($("password").value));
    check("confirm", $("confirm").value === $("password").value && $("confirm").value !== "");
    $("terms").classList.toggle("is-invalid", !$("terms").checked);
    if (!$("terms").checked) ok = false;
    if (!ok) { showAlert("regAlert", "Please fix the highlighted fields.", "danger"); return; }

        try {
      await API.post("/register", {
        role: role,
        name: $("name").value.trim(),
        email: $("email").value.trim().toLowerCase(),
        phone: $("phone").value.trim(),
        location: $("location").value,
        address: isProvider ? "" : $("address").value.trim(),
        password: $("password").value,
        category: isProvider ? $("category").value : undefined,
        rate: isProvider ? Number($("rate").value) : undefined,
        experience: isProvider ? Number($("experience").value) || 0 : undefined,
        bio: isProvider ? $("bio").value.trim() : undefined
      });
      location.href = "login.html?registered=1";
    } catch (err) {
      Object.entries(err.fields || {}).forEach(([id, msg]) => check(id, false, msg));
      showAlert("regAlert", err.message, "danger");
    }
  });
}
