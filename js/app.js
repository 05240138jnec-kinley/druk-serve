/* ===== Druk Serve - shared helpers (used by EVERY page) =====
   Load order on each page:  data.js  ->  app.js  ->  the page's own script  */

const DS = {
  // "" for pages in the main folder, "../" for pages inside customer/, provider/, admin/
  base: document.body.dataset.base || "",

  /* ---------- saving data in the browser (localStorage) ---------- */
  get(key, fallback) {
    try {
      const v = localStorage.getItem("ds_" + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("ds_" + key, JSON.stringify(value)); } catch (e) { console.error(e); }
  },
  // Copies the sample data into the browser the first time the site is opened.
  seed() {
    if (!this.get("users"))         this.set("users", DEFAULT_USERS);
    if (!this.get("providers"))     this.set("providers", DEFAULT_PROVIDERS);
    if (!this.get("bookings"))      this.set("bookings", DEFAULT_BOOKINGS);
    if (!this.get("feedback"))      this.set("feedback", DEFAULT_FEEDBACK);
    if (!this.get("notifications")) this.set("notifications", DEFAULT_NOTIFICATIONS);
  },
  // Developer helper: wipes everything and starts again (type DS.reset() in the browser console).
  reset() {
    Object.keys(localStorage).filter(k => k.startsWith("ds_")).forEach(k => localStorage.removeItem(k));
    location.href = this.base + "index.html";
  },

  /* ---------- login session ---------- */
  // BACKEND: later, the server will give a login token (JWT) instead of this.
  user() { return this.get("session", null); },
  login(u) {
    this.set("session", { id: u.id, role: u.role, name: u.name, email: u.email, providerId: u.providerId || null });
  },
  logout() {
    localStorage.removeItem("ds_session");
    location.href = this.base + "login.html";
  },
  // Call at the top of protected pages. Sends visitors to the login page if the role is wrong.
  requireRole(roles) {
    const u = this.user();
    if (!u || !roles.includes(u.role)) {
      location.href = this.base + "login.html";
      return false;
    }
    return true;
  },

  /* ---------- small helpers ---------- */
  esc(text) {   // stops users typing HTML into forms
    const d = document.createElement("div");
    d.textContent = text == null ? "" : String(text);
    return d.innerHTML;
  },
  initials(name) {
    return String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  },
  color(id) {
    const c = ["#0B6E6E", "#B45309", "#1D4ED8", "#7C3AED", "#BE185D", "#15803D", "#C2410C", "#0E7490"];
    return c[id % c.length];
  },
  stars(rating) {
    let html = "";
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) html += '<i class="bi bi-star-fill"></i>';
      else if (rating >= i - 0.5) html += '<i class="bi bi-star-half"></i>';
      else html += '<i class="bi bi-star"></i>';
    }
    return '<span class="stars">' + html + "</span>";
  },
  money(n) { return "Nu. " + Number(n).toLocaleString(); },

  // Next free id for a list (used when saving a new booking, etc.)
  nextId(list) { return list.reduce((m, x) => Math.max(m, x.id), 0) + 1; },

  // Adds a notification. role = "customer" or "provider".
  // BACKEND: later the server creates these and Firebase delivers them in real time.
  notify(role, icon, title, text) {
    const list = this.get("notifications", []);
    list.unshift({ id: this.nextId(list), role: role, icon: icon, title: title, text: text, time: "Just now", read: false });
    this.set("notifications", list);
  },

  // Date helpers: "2026-11-02" -> "2 Nov 2026", "14:00" -> "2:00 PM"
  niceDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  },
  niceTime(t) {
    const [h, m] = t.split(":").map(Number);
    return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
  },
  todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  // A small pop-up message at the bottom right of the screen.
  toast(message, type = "success") {
    let box = document.getElementById("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.className = "toast-container position-fixed bottom-0 end-0 p-3";
      box.style.zIndex = 2000;
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = "toast align-items-center text-bg-" + type + " border-0";
    el.setAttribute("role", "alert");
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + this.esc(message) +
      '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    box.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    t.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  },

  // One provider card (used on the home page and on the providers list).
  providerCard(p, cols = "col-sm-6 col-lg-3") {
    return `<div class="${cols}"><div class="provider-card h-100">
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="avatar" style="background:${this.color(p.id)}">${this.initials(p.name)}</span>
        <div>
          <h3 class="h6 mb-0">${this.esc(p.name)} ${p.verified ? '<i class="bi bi-patch-check-fill text-primary" title="Verified"></i>' : ""}</h3>
          <small class="text-muted">${this.esc(p.category)}</small>
        </div>
      </div>
      <div class="mb-2">${this.stars(p.rating)} <small class="text-muted">${p.rating.toFixed(1)} (${p.reviews})</small></div>
      <div class="d-flex justify-content-between small text-muted mb-3">
        <span><i class="bi bi-geo-alt"></i> ${this.esc(p.location)}</span><span>${p.experience} yrs exp.</span>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <strong>Nu. ${p.rate}<small class="text-muted fw-normal">/hr</small></strong>
        <a href="${this.base}customer/provider-profile.html?id=${p.id}" class="btn btn-sm btn-primary">View &amp; Book</a>
      </div></div></div>`;
  },

  /* ---------- navigation bar (written once, shown on every page) ---------- */
  renderNavbar() {
    const holder = document.getElementById("site-navbar");
    if (!holder) return;
    const u = this.user();
    const role = u ? u.role : "guest";
    const links = {
      guest:    [["Home", "index.html"], ["Services", "index.html#services"], ["How it works", "index.html#how"]],
      customer: [["Home", "customer/home.html"], ["Find Services", "customer/providers.html"], ["My Bookings", "customer/my-bookings.html"]],
      provider: [["Dashboard", "provider/dashboard.html"], ["My Services", "provider/services.html"], ["Earnings", "provider/earnings.html"], ["Feedback", "provider/feedback.html"]],
      admin:    [["Dashboard", "admin/dashboard.html"]]
    }[role];

    const current = location.pathname.split("/").pop() || "index.html";
    const items = links.map(([label, file]) => {
      const active = !file.includes("#") && file.split("/").pop() === current ? " active" : "";
      return `<li class="nav-item"><a class="nav-link${active}" href="${this.base}${file}">${label}</a></li>`;
    }).join("");

    let right;
    if (!u) {
      right = `<a href="${this.base}login.html" class="btn btn-outline-primary">Log in</a>
               <a href="${this.base}register.html" class="btn btn-primary">Register</a>`;
    } else {
      const unread = this.get("notifications", []).filter(n => n.role === u.role && !n.read).length;
      const badge = unread ? `<span class="badge rounded-pill bg-danger nav-badge">${unread}</span>` : "";
      const noteLink = role === "admin" ? "" :
        `<li><a class="dropdown-item" href="${this.base}${role}/notifications.html"><i class="bi bi-bell me-2"></i>Notifications ${badge}</a></li>`;
      const profileLink = role === "admin" ? "" :
        `<li><a class="dropdown-item" href="${this.base}${role}/profile.html"><i class="bi bi-person me-2"></i>My Profile</a></li>`;
      right = `<div class="dropdown">
        <button class="btn btn-light border d-flex align-items-center gap-2" data-bs-toggle="dropdown">
          <span class="avatar" style="width:30px;height:30px;font-size:.75rem;background:${this.color(u.id)}">${this.initials(u.name)}</span>
          <span class="d-none d-md-inline">${this.esc(u.name)}</span> ${badge}
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          ${profileLink}${noteLink}
          <li><button class="dropdown-item text-danger" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
        </ul></div>`;
    }

    holder.innerHTML = `<nav class="navbar navbar-expand-lg navbar-ds"><div class="container">
      <a class="brand" href="${this.base}index.html"><span class="brand-mark"><i class="bi bi-house-heart-fill"></i></span><span>Druk<em>Serve</em></span></a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-label="Menu"><span class="navbar-toggler-icon"></span></button>
      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav mx-lg-auto mb-2 mb-lg-0">${items}</ul>
        <div class="d-flex gap-2 align-items-center">${right}</div>
      </div></div></nav>`;

    const out = document.getElementById("logoutBtn");
    if (out) out.addEventListener("click", () => this.logout());
  },

  renderFooter() {
    const holder = document.getElementById("site-footer");
    if (!holder) return;
    holder.innerHTML = `<footer class="footer"><div class="container">
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="brand mb-2" style="color:#fff!important"><span class="brand-mark"><i class="bi bi-house-heart-fill"></i></span><span>Druk<em>Serve</em></span></div>
          <p class="small">Connecting homes with trusted services across Bhutan.</p>
        </div>
        <div class="col-6 col-lg-3"><h6>Quick links</h6>
          <ul class="list-unstyled small">
            <li><a href="${this.base}index.html">Home</a></li>
            <li><a href="${this.base}login.html">Log in</a></li>
            <li><a href="${this.base}register.html">Register</a></li>
          </ul></div>
        <div class="col-6 col-lg-4"><h6>Contact</h6>
          <ul class="list-unstyled small">
            <li><i class="bi bi-geo-alt me-2"></i>Dewathang, Bhutan</li>
            <li><i class="bi bi-envelope me-2"></i>support@drukserve.bt</li>
          </ul></div>
      </div>
      <hr class="border-secondary">
      <p class="small mb-0 text-center">&copy; 2026 Druk Serve &middot; Diploma in Computer Systems and Networking, JNEC, Royal University of Bhutan</p>
    </div></footer>`;
  }
};

DS.seed();
DS.renderNavbar();
DS.renderFooter();
