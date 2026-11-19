/* ===== Admin dashboard (admin/dashboard.html) - connected to the backend =====
   Tabs: Overview, Provider Verification, Users, Categories, Reports. */

(async function () {
  // Only the admin may see this page.
  if (!DS.requireRole(["admin"])) return;

  const $ = id => document.getElementById(id);
  const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
  const say = (text, type) => { $("pageAlert").innerHTML = `<div class="alert alert-${type || "success"} py-2">${DS.esc(text)}</div>`; };

  // Data from the server (filled by loadAll)
  let overview = null, providers = [], users = [], categories = [], reports = null;

  let providerFilter = "pending";
  let editingCategory = null;       // id of the category being edited (null = adding a new one)

  /* ---------- small drawing helpers ---------- */
  function bars(rows, cssClass) {       // rows = [[label, number, text]]
    const max = Math.max(1, ...rows.map(r => r[1]));
    return rows.map(([label, value, text]) => `
      <div class="bar-row"><span class="text-truncate">${DS.esc(label)}</span>
        <div class="bar-track"><div class="bar-fill ${cssClass(label)}" style="width:${(value / max) * 100}%"></div></div>
        <strong class="text-end">${text !== undefined ? text : value}</strong></div>`).join("");
  }
  const none = text => `<p class="text-muted mb-0">${text}</p>`;

  /* ================= OVERVIEW ================= */
  function renderOverview() {
    const s = overview.stats;
    $("ovStats").innerHTML = [
      ["bi-people", "Customers", s.customers],
      ["bi-tools", "Service providers", s.providers],
      ["bi-hourglass-split", "Awaiting verification", s.awaitingVerification],
      ["bi-calendar-check", "Total bookings", s.totalBookings],
      ["bi-check2-circle", "Completed jobs", s.completedJobs],
      ["bi-cash-stack", "Value of completed jobs", DS.money(s.completedValue)]
    ].map(([icon, label, value]) => `
      <div class="col-6 col-lg-4 col-xl-2"><div class="card-ds stat-card">
        <span class="icon-circle"><i class="bi ${icon}"></i></span>
        <div><div class="fs-5 fw-bold lh-1">${value}</div><small class="text-muted">${label}</small></div>
      </div></div>`).join("");

    const pending = overview.pendingProviders;
    $("ovPending").innerHTML = pending.length ? pending.map(p => `
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="avatar" style="background:${DS.color(p.id)}">${DS.initials(p.name)}</span>
        <div class="flex-grow-1"><div class="fw-medium">${DS.esc(p.name)}</div><small class="text-muted">${DS.esc(p.category)} &middot; ${DS.esc(p.location)}</small></div>
        <button class="btn btn-sm btn-primary" data-action="verify" data-id="${p.id}">Verify</button>
      </div>`).join("") : none("<i class='bi bi-check-circle text-success me-1'></i>All providers are verified.");

    $("ovRecent").innerHTML = overview.recentBookings.map(b => `<tr>
      <td>${b.id}</td><td>${DS.esc(b.customerName)}</td><td>${DS.esc(b.providerName)}</td>
      <td>${DS.esc(b.service)}</td><td><span class="badge-status st-${b.status}">${b.status}</span></td></tr>`).join("")
      || `<tr><td colspan="5" class="text-muted">No bookings yet.</td></tr>`;
  }

  /* ================= PROVIDER VERIFICATION ================= */
  function renderProviders() {
    const pendingCount = providers.filter(p => !p.verified).length;
    $("navProviders").innerHTML = `<i class="bi bi-patch-check me-1"></i>Provider Verification` +
      (pendingCount ? ` <span class="badge rounded-pill bg-danger">${pendingCount}</span>` : "");

    let list = providers;
    if (providerFilter === "pending") list = providers.filter(p => !p.verified);
    if (providerFilter === "verified") list = providers.filter(p => p.verified);

    $("pvBody").innerHTML = list.map(p => `<tr>
      <td><div class="d-flex align-items-center gap-2">
        <span class="avatar" style="width:38px;height:38px;font-size:.8rem;background:${DS.color(p.id)}">${DS.initials(p.name)}</span>
        <div><div class="fw-medium">${DS.esc(p.name)}</div><small class="text-muted">${DS.esc(p.email)}</small></div></div></td>
      <td>${DS.esc(p.category)}</td><td>${DS.esc(p.location)}</td><td>${p.experience} yrs</td>
      <td>${p.verified ? '<span class="badge-status st-Completed">Verified</span>' : '<span class="badge-status st-Pending">Pending</span>'}
          ${p.suspended ? '<span class="badge-status st-Cancelled ms-1">Suspended</span>' : ""}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-secondary" data-action="pdetails" data-id="${p.id}">Details</button>
        ${p.verified
          ? `<button class="btn btn-sm btn-outline-danger" data-action="revoke" data-id="${p.id}">Revoke</button>`
          : `<button class="btn btn-sm btn-primary" data-action="verify" data-id="${p.id}">Verify</button>`}
      </td></tr>`).join("");
    $("pvEmpty").classList.toggle("d-none", list.length > 0);
  }

  async function setVerified(id, value) {
    try {
      // PUT /api/admin/providers/:id/verify : the server also tells the provider
      const p = await API.put("/admin/providers/" + id + "/verify", { verified: value });
      say(p.name + (value ? " is now verified." : " is no longer verified."));
    } catch (err) {
      say(err.message, "danger");
    }
    await loadAll();
  }

  function showProviderDetails(id) {
    const p = providers.find(x => x.id === id);
    if (!p) return;
    const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
    $("detailsBody").innerHTML = `<table class="table table-sm mb-0"><tbody>` +
      row("Name", DS.esc(p.name)) + row("Category", DS.esc(p.category)) + row("Email", DS.esc(p.email)) +
      row("Phone", DS.esc(p.phone)) + row("Location", DS.esc(p.location)) +
      row("Experience", p.experience + " years") + row("Rate", "Nu. " + p.rate + " / hour") +
      row("Rating", p.reviews ? p.rating.toFixed(1) + " (" + p.reviews + " reviews)" : "No reviews yet") +
      row("Bio", DS.esc(p.bio || "-")) + `</tbody></table>`;
    modal("detailsModal").show();
  }

  /* ================= USERS ================= */
  function renderUsers() {
    const q = $("usSearch").value.trim().toLowerCase();
    const role = $("usRole").value;
    const list = users
      .filter(u => !role || u.role === role)
      .filter(u => !q || (u.name + " " + u.email).toLowerCase().includes(q));

    // a customer and a provider can have the same id number, so every button also carries the role
    $("usBody").innerHTML = list.map(u => `<tr>
        <td><div class="d-flex align-items-center gap-2">
          <span class="avatar" style="width:38px;height:38px;font-size:.8rem;background:${DS.color(u.id)}">${DS.initials(u.name)}</span>
          <div><div class="fw-medium">${DS.esc(u.name)}</div><small class="text-muted">${DS.esc(u.email)}</small></div></div></td>
        <td><span class="badge text-bg-light border">${u.role === "provider" ? "Provider" : "Customer"}</span></td>
        <td>${DS.esc(u.phone || "-")}</td><td>${DS.esc(u.location || "-")}</td><td>${u.bookings}</td>
        <td>${u.suspended ? '<span class="badge-status st-Cancelled">Suspended</span>' : '<span class="badge-status st-Completed">Active</span>'}</td>
        <td class="text-end">${u.suspended
          ? `<button class="btn btn-sm btn-outline-primary" data-action="activate" data-role="${u.role}" data-id="${u.id}">Activate</button>`
          : `<button class="btn btn-sm btn-outline-danger" data-action="suspend" data-role="${u.role}" data-id="${u.id}">Suspend</button>`}</td></tr>`).join("");
    $("usEmpty").classList.toggle("d-none", list.length > 0);
  }

  async function setSuspended(role, id, value) {
    try {
      // PUT /api/admin/users/:role/:id/status : takes effect on the person's very next request
      const u = await API.put("/admin/users/" + role + "/" + id + "/status", { suspended: value });
      say(u.name + (value ? " was suspended." : " was activated again."));
    } catch (err) {
      say(err.message, "danger");
    }
    await loadAll();
  }

  /* ================= CATEGORIES ================= */
  const ICONS = ["bi-droplet-fill", "bi-lightning-charge-fill", "bi-stars", "bi-hammer", "bi-palette-fill", "bi-tools",
                 "bi-bug-fill", "bi-tree-fill", "bi-wrench-adjustable", "bi-house-door-fill", "bi-truck", "bi-scissors",
                 "bi-fire", "bi-wifi", "bi-lightbulb-fill", "bi-key-fill"];

  const providersUsing = name => providers.filter(p => p.category === name).length;

  function renderCategories() {
    $("catGrid").innerHTML = categories.map(c => {
      const used = providersUsing(c.name);
      return `<div class="col-md-6 col-lg-4"><div class="cat-card">
        <div class="d-flex align-items-center gap-3 mb-2">
          <span class="icon-circle"><i class="bi ${DS.esc(c.icon)}"></i></span>
          <div><div class="fw-bold">${DS.esc(c.name)}</div><small class="text-muted">${used} provider${used === 1 ? "" : "s"}</small></div>
        </div>
        <p class="small text-muted">${DS.esc(c.desc)}</p>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" data-action="editcat" data-id="${c.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delcat" data-id="${c.id}"><i class="bi bi-trash me-1"></i>Delete</button>
        </div></div></div>`;
    }).join("");
  }

  function openCategoryForm(cat) {
    editingCategory = cat ? cat.id : null;
    $("catModalTitle").textContent = cat ? "Edit Category" : "Add Category";
    $("catName").value = cat ? cat.name : "";
    $("catDesc").value = cat ? cat.desc : "";
    $("catName").classList.remove("is-invalid");
    $("catDesc").classList.remove("is-invalid");
    const chosen = cat ? cat.icon : ICONS[0];
    $("iconPicker").innerHTML = ICONS.map((ic, i) => `
      <input type="radio" class="btn-check" name="catIcon" id="ic${i}" value="${ic}" ${ic === chosen ? "checked" : ""}>
      <label class="btn btn-outline-primary" for="ic${i}"><i class="bi ${ic}"></i></label>`).join("");
    modal("catModal").show();
  }

  $("catForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("catName").value.trim();
    const desc = $("catDesc").value.trim();
    $("catNameMsg").textContent = "Enter a name (at least 3 characters).";
    $("catName").classList.toggle("is-invalid", name.length < 3);
    $("catDesc").classList.toggle("is-invalid", desc === "");
    if (name.length < 3 || desc === "") return;

    const icon = document.querySelector("input[name=catIcon]:checked").value;
    try {
      if (editingCategory) {
        // PUT /api/admin/categories/:id : providers and bookings follow the new name automatically
        await API.put("/admin/categories/" + editingCategory, { name: name, desc: desc, icon: icon });
        say("Category updated.");
      } else {
        // POST /api/admin/categories
        await API.post("/admin/categories", { name: name, desc: desc, icon: icon });
        say("Category added. Customers and providers can use it straight away.");
      }
      modal("catModal").hide();
      await loadAll();
    } catch (err) {
      const f = err.fields || {};
      if (f.name) { $("catNameMsg").textContent = f.name; $("catName").classList.add("is-invalid"); }
      if (f.desc) { $("catDesc").classList.add("is-invalid"); }
      if (!f.name && !f.desc) say(err.message, "danger");
    }
  });

  /* ================= REPORTS ================= */
  function renderReports() {
    const r = reports;
    const total = r.bookingsByStatus.reduce((s, x) => s + x.value, 0);

    $("rpStatus").innerHTML = total
      ? bars(r.bookingsByStatus.map(x => [x.label, x.value]), label => "st-" + label)
      : none("No bookings yet.");

    $("rpCategory").innerHTML = r.bookingsByCategory.length
      ? bars(r.bookingsByCategory.map(x => [x.label, x.value]), () => "") : none("No bookings yet.");

    $("rpRevenue").innerHTML = r.revenueByCategory.length
      ? bars(r.revenueByCategory.map(x => [x.label, x.value, DS.money(x.value)]), () => "accent") : none("No completed jobs yet.");

    const p = r.payments;
    $("rpPay").innerHTML = p.online.count || p.cash.count || p.notPaid.count ? bars([
      ["Online", p.online.amount, DS.money(p.online.amount) + " (" + p.online.count + ")"],
      ["Cash", p.cash.amount, DS.money(p.cash.amount) + " (" + p.cash.count + ")"],
      ["Not paid yet", p.notPaid.amount, DS.money(p.notPaid.amount) + " (" + p.notPaid.count + ")"]
    ], () => "") : none("No payments yet.");

    $("rpTop").innerHTML = r.topProviders.map(t => `<tr>
      <td class="fw-medium">${DS.esc(t.name)}</td><td>${DS.esc(t.category)}</td>
      <td>${t.reviews ? DS.stars(t.rating) + " " + t.rating.toFixed(1) : "-"}</td>
      <td>${t.jobs}</td><td class="text-end fw-bold">${DS.money(t.earned)}</td></tr>`).join("");
  }

  /* ================= CONFIRMATION POP-UP ================= */
  let pending = null;
  function ask(title, body, btnText, btnClass, run) {
    $("actionTitle").textContent = title;
    $("actionBody").textContent = body;
    $("actionConfirm").textContent = btnText;
    $("actionConfirm").className = "btn " + btnClass;
    pending = run;
    modal("actionModal").show();
  }
  $("actionConfirm").addEventListener("click", () => {
    if (pending) pending();
    pending = null;
    modal("actionModal").hide();
  });

  /* ================= EVENTS ================= */
  document.querySelector("main").addEventListener("click", e => {
    const filter = e.target.closest("[data-filter]");
    if (filter) {
      providerFilter = filter.dataset.filter;
      document.querySelectorAll("#pvFilter .btn").forEach(b => b.classList.toggle("active", b === filter));
      renderProviders();
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const role = btn.dataset.role;

    switch (btn.dataset.action) {
      case "verify":  setVerified(id, true); break;
      case "revoke":
        ask("Remove verification?", "Customers will no longer be able to find or book this provider.", "Yes, revoke", "btn-danger", () => setVerified(id, false));
        break;
      case "pdetails": showProviderDetails(id); break;
      case "suspend": {
        const u = users.find(x => x.id === id && x.role === role);
        ask("Suspend " + u.name + "?", "They will not be able to log in until you activate them again.", "Yes, suspend", "btn-danger", () => setSuspended(role, id, true));
        break;
      }
      case "activate": setSuspended(role, id, false); break;
      case "editcat": openCategoryForm(categories.find(c => c.id === id)); break;
      case "delcat": {
        const c = categories.find(x => x.id === id);
        const used = providersUsing(c.name);
        if (used) { say("\"" + c.name + "\" is used by " + used + " provider" + (used === 1 ? "" : "s") + " and cannot be deleted.", "danger"); break; }
        ask("Delete \"" + c.name + "\"?", "This category will be removed from the website.", "Yes, delete", "btn-danger", async () => {
          try {
            await API.del("/admin/categories/" + id);   // DELETE /api/admin/categories/:id (refused if it is still in use)
            say("Category deleted.");
          } catch (err) {
            say(err.message, "danger");
          }
          await loadAll();
        });
        break;
      }
    }
  });
  $("addCategory").addEventListener("click", () => openCategoryForm(null));
  $("usSearch").addEventListener("input", renderUsers);
  $("usRole").addEventListener("change", renderUsers);

  /* ================= LOAD EVERYTHING FROM THE SERVER ================= */
  async function loadAll() {
    try {
      [overview, providers, users, categories, reports] = await Promise.all([
        API.get("/admin/overview"),      // GET /api/admin/overview
        API.get("/admin/providers"),     // GET /api/admin/providers
        API.get("/admin/users"),         // GET /api/admin/users
        API.get("/categories"),          // GET /api/categories
        API.get("/admin/reports")        // GET /api/admin/reports
      ]);
    } catch (err) {
      say(err.message, "danger");
      return;
    }
    renderOverview();
    renderProviders();
    renderUsers();
    renderCategories();
    renderReports();
  }
  await loadAll();
})();