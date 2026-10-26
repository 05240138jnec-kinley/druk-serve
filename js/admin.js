/* ===== Admin dashboard (admin/dashboard.html) =====
   Tabs: Overview, Provider Verification, Users, Categories, Reports. */

(function () {
  // Only the admin may see this page.
  if (!DS.requireRole(["admin"])) return;

  const $ = id => document.getElementById(id);
  const modal = id => bootstrap.Modal.getOrCreateInstance($(id));

  // BACKEND: each of these becomes an admin API call later (GET /api/admin/users, ...)
  const getUsers = () => DS.get("users", []);
  const getProviders = () => DS.get("providers", []);
  const getBookings = () => DS.get("bookings", []);
  const userName = id => (getUsers().find(u => u.id === id) || { name: "-" }).name;
  const providerName = id => (getProviders().find(p => p.id === id) || { name: "-" }).name;
  const say = (text, type) => { $("pageAlert").innerHTML = `<div class="alert alert-${type || "success"} py-2">${DS.esc(text)}</div>`; };

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
    const users = getUsers(), providers = getProviders(), bookings = getBookings();
    const pending = providers.filter(p => !p.verified);
    const revenue = bookings.filter(b => b.status === "Completed").reduce((s, b) => s + b.amount, 0);

    $("ovStats").innerHTML = [
      ["bi-people", "Customers", users.filter(u => u.role === "customer").length],
      ["bi-tools", "Service providers", providers.length],
      ["bi-hourglass-split", "Awaiting verification", pending.length],
      ["bi-calendar-check", "Total bookings", bookings.length],
      ["bi-check2-circle", "Completed jobs", bookings.filter(b => b.status === "Completed").length],
      ["bi-cash-stack", "Value of completed jobs", DS.money(revenue)]
    ].map(([icon, label, value]) => `
      <div class="col-6 col-lg-4 col-xl-2"><div class="card-ds stat-card">
        <span class="icon-circle"><i class="bi ${icon}"></i></span>
        <div><div class="fs-5 fw-bold lh-1">${value}</div><small class="text-muted">${label}</small></div>
      </div></div>`).join("");

    $("ovPending").innerHTML = pending.length ? pending.map(p => `
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="avatar" style="background:${DS.color(p.id)}">${DS.initials(p.name)}</span>
        <div class="flex-grow-1"><div class="fw-medium">${DS.esc(p.name)}</div><small class="text-muted">${DS.esc(p.category)} &middot; ${DS.esc(p.location)}</small></div>
        <button class="btn btn-sm btn-primary" data-action="verify" data-id="${p.id}">Verify</button>
      </div>`).join("") : none("<i class='bi bi-check-circle text-success me-1'></i>All providers are verified.");

    const recent = [...bookings].sort((a, b) => b.id - a.id).slice(0, 5);
    $("ovRecent").innerHTML = recent.map(b => `<tr>
      <td>${b.id}</td><td>${DS.esc(userName(b.customerId))}</td><td>${DS.esc(providerName(b.providerId))}</td>
      <td>${DS.esc(b.service)}</td><td><span class="badge-status st-${b.status}">${b.status}</span></td></tr>`).join("")
      || `<tr><td colspan="5" class="text-muted">No bookings yet.</td></tr>`;
  }

  /* ================= PROVIDER VERIFICATION ================= */
  function renderProviders() {
    const all = getProviders();
    const pendingCount = all.filter(p => !p.verified).length;
    $("navProviders").innerHTML = `<i class="bi bi-patch-check me-1"></i>Provider Verification` +
      (pendingCount ? ` <span class="badge rounded-pill bg-danger">${pendingCount}</span>` : "");

    let list = all;
    if (providerFilter === "pending") list = all.filter(p => !p.verified);
    if (providerFilter === "verified") list = all.filter(p => p.verified);

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

  function setVerified(id, value) {
    // BACKEND: later PUT /api/admin/providers/:id/verify  { verified: true/false }
    const providers = getProviders();
    const p = providers.find(x => x.id === id);
    if (!p) return;
    p.verified = value;
    DS.set("providers", providers);
    DS.notify("provider", value ? "bi-patch-check-fill" : "bi-exclamation-triangle-fill",
      value ? "Profile Verified" : "Verification Removed",
      value ? p.name + "'s profile has been verified. Customers can now book you." : p.name + "'s verification was removed by the admin.");
    say(p.name + (value ? " is now verified." : " is no longer verified."));
    renderAll();
  }

  function showProviderDetails(id) {
    const p = getProviders().find(x => x.id === id);
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
    const bookings = getBookings();
    const list = getUsers().filter(u => u.role !== "admin")
      .filter(u => !role || u.role === role)
      .filter(u => !q || (u.name + " " + u.email).toLowerCase().includes(q));

    $("usBody").innerHTML = list.map(u => {
      const count = bookings.filter(b => u.role === "customer" ? b.customerId === u.id : b.providerId === u.providerId).length;
      return `<tr>
        <td><div class="d-flex align-items-center gap-2">
          <span class="avatar" style="width:38px;height:38px;font-size:.8rem;background:${DS.color(u.id)}">${DS.initials(u.name)}</span>
          <div><div class="fw-medium">${DS.esc(u.name)}</div><small class="text-muted">${DS.esc(u.email)}</small></div></div></td>
        <td><span class="badge text-bg-light border">${u.role === "provider" ? "Provider" : "Customer"}</span></td>
        <td>${DS.esc(u.phone || "-")}</td><td>${DS.esc(u.location || "-")}</td><td>${count}</td>
        <td>${u.suspended ? '<span class="badge-status st-Cancelled">Suspended</span>' : '<span class="badge-status st-Completed">Active</span>'}</td>
        <td class="text-end">${u.suspended
          ? `<button class="btn btn-sm btn-outline-primary" data-action="activate" data-id="${u.id}">Activate</button>`
          : `<button class="btn btn-sm btn-outline-danger" data-action="suspend" data-id="${u.id}">Suspend</button>`}</td></tr>`;
    }).join("");
    $("usEmpty").classList.toggle("d-none", list.length > 0);
  }

  function setSuspended(id, value) {
    // BACKEND: later PUT /api/admin/users/:id/status  { suspended: true/false }
    const users = getUsers();
    const u = users.find(x => x.id === id);
    if (!u) return;
    u.suspended = value;
    DS.set("users", users);
    if (u.providerId) {                       // a suspended provider disappears from customer search
      const providers = getProviders();
      const p = providers.find(x => x.id === u.providerId);
      if (p) { p.suspended = value; DS.set("providers", providers); }
    }
    say(u.name + (value ? " was suspended." : " was activated again."));
    renderAll();
  }

  /* ================= CATEGORIES ================= */
  const ICONS = ["bi-droplet-fill", "bi-lightning-charge-fill", "bi-stars", "bi-hammer", "bi-palette-fill", "bi-tools",
                 "bi-bug-fill", "bi-tree-fill", "bi-wrench-adjustable", "bi-house-door-fill", "bi-truck", "bi-scissors",
                 "bi-fire", "bi-wifi", "bi-lightbulb-fill", "bi-key-fill"];

  function renderCategories() {
    const providers = getProviders();
    $("catGrid").innerHTML = DS.services().map(c => {
      const used = providers.filter(p => p.category === c.name).length;
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

  $("catForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("catName").value.trim();
    const desc = $("catDesc").value.trim();
    const list = DS.services();
    const clash = list.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCategory);
    $("catNameMsg").textContent = clash ? "A category with this name already exists." : "Enter a name (at least 3 characters).";
    $("catName").classList.toggle("is-invalid", name.length < 3 || clash);
    $("catDesc").classList.toggle("is-invalid", desc === "");
    if (name.length < 3 || clash || desc === "") return;

    // BACKEND: later POST /api/admin/categories  or  PUT /api/admin/categories/:id
    const icon = document.querySelector("input[name=catIcon]:checked").value;
    if (editingCategory) {
      const c = list.find(x => x.id === editingCategory);
      const oldName = c.name;
      c.name = name; c.desc = desc; c.icon = icon;
      if (oldName !== name) {                 // keep providers and bookings in step with the new name
        const providers = getProviders();
        providers.forEach(p => { if (p.category === oldName) p.category = name; });
        DS.set("providers", providers);
        const bookings = getBookings();
        bookings.forEach(b => { if (b.service === oldName) b.service = name; });
        DS.set("bookings", bookings);
      }
      say("Category updated.");
    } else {
      list.push({ id: DS.nextId(list), name: name, icon: icon, desc: desc });
      say("Category added. Customers and providers can use it straight away.");
    }
    DS.set("categories", list);
    modal("catModal").hide();
    renderAll();
  });

  /* ================= REPORTS ================= */
  function renderReports() {
    const bookings = getBookings();
    const counted = (items, key) => items.reduce((o, b) => { o[b[key]] = (o[b[key]] || 0) + 1; return o; }, {});

    // by status
    const byStatus = counted(bookings, "status");
    $("rpStatus").innerHTML = bookings.length
      ? bars(["Pending", "Confirmed", "Completed", "Cancelled"].map(s => [s, byStatus[s] || 0]), label => "st-" + label)
      : none("No bookings yet.");

    // by category
    const byCat = counted(bookings, "service");
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    $("rpCategory").innerHTML = catRows.length ? bars(catRows, () => "") : none("No bookings yet.");

    // revenue by category (completed jobs only)
    const revenue = {};
    bookings.filter(b => b.status === "Completed").forEach(b => { revenue[b.service] = (revenue[b.service] || 0) + b.amount; });
    const revRows = Object.entries(revenue).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, DS.money(v)]);
    $("rpRevenue").innerHTML = revRows.length ? bars(revRows, () => "accent") : none("No completed jobs yet.");

    // payments: online vs cash (paid bookings)
    const paid = bookings.filter(b => b.paid);
    const online = paid.filter(b => b.payMethod !== "Cash");
    const cash = paid.filter(b => b.payMethod === "Cash");
    const waiting = bookings.filter(b => !b.paid && b.status !== "Cancelled");
    const sum = list => list.reduce((s, b) => s + b.amount, 0);
    $("rpPay").innerHTML = paid.length || waiting.length ? bars([
      ["Online", sum(online), DS.money(sum(online)) + " (" + online.length + ")"],
      ["Cash", sum(cash), DS.money(sum(cash)) + " (" + cash.length + ")"],
      ["Not paid yet", sum(waiting), DS.money(sum(waiting)) + " (" + waiting.length + ")"]
    ], () => "") : none("No payments yet.");

    // top providers
    const rows = getProviders().map(p => {
      const done = bookings.filter(b => b.providerId === p.id && b.status === "Completed");
      return { p: p, jobs: done.length, earned: done.reduce((s, b) => s + b.amount, 0) };
    }).sort((a, b) => b.earned - a.earned || b.p.rating - a.p.rating).slice(0, 5);
    $("rpTop").innerHTML = rows.map(r => `<tr>
      <td class="fw-medium">${DS.esc(r.p.name)}</td><td>${DS.esc(r.p.category)}</td>
      <td>${r.p.reviews ? DS.stars(r.p.rating) + " " + r.p.rating.toFixed(1) : "-"}</td>
      <td>${r.jobs}</td><td class="text-end fw-bold">${DS.money(r.earned)}</td></tr>`).join("");
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

    switch (btn.dataset.action) {
      case "verify":  setVerified(id, true); break;
      case "revoke":
        ask("Remove verification?", "Customers will no longer be able to find or book this provider.", "Yes, revoke", "btn-danger", () => setVerified(id, false));
        break;
      case "pdetails": showProviderDetails(id); break;
      case "suspend": {
        const u = getUsers().find(x => x.id === id);
        ask("Suspend " + u.name + "?", "They will not be able to log in until you activate them again.", "Yes, suspend", "btn-danger", () => setSuspended(id, true));
        break;
      }
      case "activate": setSuspended(id, false); break;
      case "editcat": openCategoryForm(DS.services().find(c => c.id === id)); break;
      case "delcat": {
        const c = DS.services().find(x => x.id === id);
        const used = getProviders().filter(p => p.category === c.name).length;
        if (used) { say("\"" + c.name + "\" is used by " + used + " provider" + (used === 1 ? "" : "s") + " and cannot be deleted.", "danger"); break; }
        ask("Delete \"" + c.name + "\"?", "This category will be removed from the website.", "Yes, delete", "btn-danger", () => {
          DS.set("categories", DS.services().filter(x => x.id !== id));
          say("Category deleted.");
          renderAll();
        });
        break;
      }
    }
  });
  $("addCategory").addEventListener("click", () => openCategoryForm(null));
  $("usSearch").addEventListener("input", renderUsers);
  $("usRole").addEventListener("change", renderUsers);

  function renderAll() {
    renderOverview();
    renderProviders();
    renderUsers();
    renderCategories();
    renderReports();
  }
  renderAll();
})();
