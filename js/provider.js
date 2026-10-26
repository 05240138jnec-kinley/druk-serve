/* ===== Provider pages =====
   Used by: provider/dashboard.html, services.html, earnings.html, feedback.html
   (provider notifications and profile use js/account.js).
   Each part only runs if its page is open (it looks for a special id). */

(function () {
  // Only service providers may see these pages.
  if (!DS.requireRole(["provider"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);

  // BACKEND: these helpers become API calls later (GET/PUT /api/provider/...)
  const getProviders = () => DS.get("providers", []);
  const getMe = () => getProviders().find(p => p.id === user.providerId);
  const getBookings = () => DS.get("bookings", []);
  const myBookings = () => getBookings().filter(b => b.providerId === user.providerId);
  const customer = id => DS.get("users", []).find(u => u.id === id) || { name: "Customer", phone: "-" };

  if (!getMe()) {
    document.querySelector("main").innerHTML =
      `<div class="card-ds empty-state"><i class="bi bi-person-x"></i>Your provider profile was not found. Please log in again.</div>`;
    return;
  }

  // Yellow warning shown until the admin verifies this provider
  function verifyNotice() {
    const box = $("verifyNotice");
    if (!box) return;
    box.innerHTML = getMe().verified ? "" :
      `<div class="alert alert-warning"><i class="bi bi-hourglass-split me-1"></i>
       <strong>Awaiting verification.</strong> The admin must verify your profile before customers can find and book you.</div>`;
  }

  // How the payment of a booking is shown to the provider
  function payLabel(b) {
    if (b.paid && b.payMethod === "Cash") return `<span class="text-success"><i class="bi bi-cash me-1"></i>Cash received</span>`;
    if (b.paid) return `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Paid online (${DS.esc(b.payMethod)})</span>`;
    if (b.payMethod === "Cash") return `<span class="text-muted"><i class="bi bi-cash me-1"></i>Cash on service</span>`;
    return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Payment not chosen yet</span>`;
  }

  /* ================= DASHBOARD ================= */
  if ($("dashStats")) {
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
    const me0 = getMe();
    $("dashSub").textContent = "Welcome, " + me0.name + " \u00B7 " + me0.category;
    verifyNotice();

    function stats() {
      const mine = myBookings();
      const today = DS.todayISO();
      const items = [
        ["bi-calendar-day", "Today's jobs", mine.filter(b => b.status === "Confirmed" && b.date === today).length],
        ["bi-check2-circle", "Confirmed jobs", mine.filter(b => b.status === "Confirmed").length],
        ["bi-hourglass-split", "Pending requests", mine.filter(b => b.status === "Pending").length],
        ["bi-cash-stack", "Total earnings", DS.money(mine.filter(b => b.status === "Completed").reduce((s, b) => s + b.amount, 0))]
      ];
      $("dashStats").innerHTML = items.map(([icon, label, value]) => `
        <div class="col-6 col-lg-3"><div class="card-ds stat-card">
          <span class="icon-circle"><i class="bi ${icon}"></i></span>
          <div><div class="fs-4 fw-bold lh-1">${value}</div><small class="text-muted">${label}</small></div>
        </div></div>`).join("");
    }

    function jobCard(b) {
      const c = customer(b.customerId);
      let buttons = `<button class="btn btn-sm btn-outline-secondary" data-action="details" data-id="${b.id}">Details</button>`;
      if (b.status === "Pending") {
        buttons += `<button class="btn btn-sm btn-primary" data-action="accept" data-id="${b.id}"><i class="bi bi-check-lg me-1"></i>Accept</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="decline" data-id="${b.id}"><i class="bi bi-x-lg me-1"></i>Decline</button>`;
      }
      if (b.status === "Confirmed") {
        buttons += `<button class="btn btn-sm btn-primary" data-action="complete" data-id="${b.id}"><i class="bi bi-check2-all me-1"></i>Mark as Completed</button>`;
      }
      return `<div class="card-ds mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div class="d-flex align-items-center gap-3">
            <span class="avatar" style="background:${DS.color(b.customerId)}">${DS.initials(c.name)}</span>
            <div><h3 class="h6 mb-0">${DS.esc(b.service)} &middot; ${DS.esc(c.name)}</h3><small class="text-muted">Booking #${b.id}</small></div>
          </div>
          <span class="badge-status st-${b.status}">${b.status}</span>
        </div>
        <div class="row small text-muted my-3 gy-1">
          <div class="col-md-4"><i class="bi bi-calendar me-1"></i>${DS.niceDate(b.date)} at ${DS.niceTime(b.time)}</div>
          <div class="col-md-5"><i class="bi bi-geo-alt me-1"></i>${DS.esc(b.address)}</div>
          <div class="col-md-3"><strong class="text-dark">${DS.money(b.amount)}</strong><br>${payLabel(b)}</div>
        </div>
        <div class="d-flex flex-wrap gap-2">${buttons}</div>
      </div>`;
    }

    function render() {
      const mine = myBookings();
      const req = mine.filter(b => b.status === "Pending").sort((a, b) => a.date.localeCompare(b.date));
      const conf = mine.filter(b => b.status === "Confirmed").sort((a, b) => a.date.localeCompare(b.date));
      const hist = mine.filter(b => b.status === "Completed" || b.status === "Cancelled").sort((a, b) => b.date.localeCompare(a.date));
      $("tabReq").textContent = "Requests (" + req.length + ")";
      $("tabConf").textContent = "Confirmed (" + conf.length + ")";
      $("tabHist").textContent = "History (" + hist.length + ")";
      const empty = text => `<div class="card-ds empty-state"><i class="bi bi-inbox"></i>${text}</div>`;
      $("reqList").innerHTML = req.length ? req.map(jobCard).join("") : empty("No new requests right now.");
      $("confList").innerHTML = conf.length ? conf.map(jobCard).join("") : empty("No confirmed jobs.");
      $("histList").innerHTML = hist.length ? hist.map(jobCard).join("") : empty("No past jobs yet.");
      stats();
    }

    function setStatus(id, change) {
      // BACKEND: later PUT /api/bookings/:id  { status: ... }
      const list = getBookings();
      const b = list.find(x => x.id === id);
      if (!b) return null;
      change(b);
      DS.set("bookings", list);
      render();
      return b;
    }
    function say(text) { $("pageAlert").innerHTML = `<div class="alert alert-success py-2">${DS.esc(text)}</div>`; }

    // Confirmation pop-up used for Decline and Complete
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

    function showDetails(id) {
      const b = getBookings().find(x => x.id === id);
      const c = customer(b.customerId);
      const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
      $("detailsBody").innerHTML = `<table class="table table-sm mb-0"><tbody>` +
        row("Booking", "#" + b.id) +
        row("Service", DS.esc(b.service)) +
        row("Customer", DS.esc(c.name) + "<br><small class='text-muted'>Phone: " + DS.esc(c.phone) + "</small>") +
        row("Date and time", DS.niceDate(b.date) + " at " + DS.niceTime(b.time)) +
        row("Address", DS.esc(b.address)) +
        row("Hours", b.hours ? b.hours : "-") +
        row("Customer notes", DS.esc(b.notes || "-")) +
        row("Total", DS.money(b.amount)) +
        row("Payment", payLabel(b)) +
        row("Status", `<span class="badge-status st-${b.status}">${b.status}</span>`) +
        `</tbody></table>`;
      modal("detailsModal").show();
    }

    document.querySelector("main").addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      const me = getMe();

      if (action === "details") showDetails(id);

      if (action === "accept") {
        const b = setStatus(id, x => { x.status = "Confirmed"; });
        DS.notify("customer", "bi-check-circle-fill", "Job Accepted", "Your " + b.service.toLowerCase() + " job has been accepted by " + me.name + ".");
        say("Job accepted. The customer has been notified.");
      }
      if (action === "decline") {
        ask("Decline this job?", "The customer will be told that you cannot take this job.", "Yes, decline", "btn-danger", () => {
          const b = setStatus(id, x => { x.status = "Cancelled"; });
          DS.notify("customer", "bi-x-circle-fill", "Job Declined", me.name + " could not take your " + b.service.toLowerCase() + " job. Please book another provider.");
          say("Job declined.");
        });
      }
      if (action === "complete") {
        const b0 = getBookings().find(x => x.id === id);
        const text = b0.paid
          ? "Mark this job as completed? The customer will be asked to rate your service."
          : "Confirm the job is finished and you received " + DS.money(b0.amount) + " in cash. The customer will be asked to rate your service.";
        ask("Mark job as completed?", text, "Yes, completed", "btn-primary", () => {
          const b = setStatus(id, x => {
            x.status = "Completed";
            if (!x.paid) { x.paid = true; x.payMethod = x.payMethod || "Cash"; }   // cash is received on completion
          });
          DS.notify("customer", "bi-tools", "Job Completed", "Your " + b.service.toLowerCase() + " job has been completed. Please rate the service.");
          say("Job marked as completed.");
        });
      }
    });

    render();
  }

  /* ================= MY SERVICES & AVAILABILITY ================= */
  if ($("svcForm")) {
    const me0 = getMe();
    const sch = DS.schedule(me0);
    verifyNotice();

    SERVICES.forEach(s => $("sCategory").insertAdjacentHTML("beforeend", `<option>${s.name}</option>`));
    for (let h = 6; h <= 21; h++) {
      const v = String(h).padStart(2, "0") + ":00";
      const opt = `<option value="${v}">${DS.niceTime(v)}</option>`;
      $("sFrom").insertAdjacentHTML("beforeend", opt);
      $("sTo").insertAdjacentHTML("beforeend", opt);
    }
    $("dayBox").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `
      <div class="form-check form-check-inline day-check">
        <input class="form-check-input day" type="checkbox" id="day${d}" value="${d}">
        <label class="form-check-label" for="day${d}">${DS.DAY_NAMES[d]}</label>
      </div>`).join("");

    // Fill the form with the saved values
    $("sCategory").value = me0.category;
    $("sRate").value = me0.rate;
    $("sExperience").value = me0.experience;
    $("sBio").value = me0.bio || "";
    $("sAvailable").checked = sch.available;
    $("sFrom").value = sch.from;
    $("sTo").value = sch.to;
    sch.days.forEach(d => { $("day" + d).checked = true; });

    const selectedDays = () => [...document.querySelectorAll(".day:checked")].map(x => Number(x.value));

    // Live preview of the provider card
    function preview() {
      const temp = Object.assign({}, getMe(), {
        category: $("sCategory").value, rate: Number($("sRate").value) || 0,
        experience: Number($("sExperience").value) || 0, bio: $("sBio").value
      });
      $("preview").innerHTML = DS.providerCard(temp, "col-12") +
        `<div class="col-12 small text-muted mt-2"><i class="bi bi-clock me-1"></i>${$("sAvailable").checked ? "Works " + DS.daysText(selectedDays()) + ", " + DS.niceTime($("sFrom").value) + " to " + DS.niceTime($("sTo").value) : "Not accepting new bookings"}</div>`;
    }
    $("svcForm").addEventListener("input", preview);
    $("svcForm").addEventListener("change", preview);
    preview();

    $("svcForm").addEventListener("submit", e => {
      e.preventDefault();
      let ok = true;
      function check(id, valid) { $(id).classList.toggle("is-invalid", !valid); if (!valid) ok = false; }
      check("sRate", Number($("sRate").value) >= 50);
      const exp = Number($("sExperience").value);
      check("sExperience", $("sExperience").value !== "" && exp >= 0 && exp <= 50);
      check("sTo", $("sFrom").value < $("sTo").value);
      const noDays = $("sAvailable").checked && selectedDays().length === 0;
      $("dayError").classList.toggle("d-none", !noDays);
      if (noDays) ok = false;
      if (!ok) return;

      // BACKEND: replace with PUT /api/provider/services  (Service + Availability tables)
      const providers = getProviders();
      const p = providers.find(x => x.id === user.providerId);
      p.category = $("sCategory").value;
      p.rate = Number($("sRate").value);
      p.experience = exp;
      p.bio = $("sBio").value.trim();
      p.available = $("sAvailable").checked;
      p.days = selectedDays();
      p.from = $("sFrom").value;
      p.to = $("sTo").value;
      DS.set("providers", providers);
      $("svcAlert").innerHTML = '<div class="alert alert-success py-2">Your services and availability were saved.</div>';
      preview();
    });
  }

  /* ================= EARNINGS ================= */
  if ($("eStats")) {
    // BACKEND: later GET /api/provider/payments  (Payment table)
    const mine = myBookings();
    const done = mine.filter(b => b.status === "Completed").sort((a, b) => b.date.localeCompare(a.date));
    const total = done.reduce((s, b) => s + b.amount, 0);
    const online = done.filter(b => b.payMethod !== "Cash").reduce((s, b) => s + b.amount, 0);
    const cash = done.filter(b => b.payMethod === "Cash").reduce((s, b) => s + b.amount, 0);
    const upcoming = mine.filter(b => b.status === "Confirmed").reduce((s, b) => s + b.amount, 0);

    $("eStats").innerHTML = [
      ["bi-cash-stack", "Total earned", total],
      ["bi-phone", "Online payments", online],
      ["bi-cash", "Cash received", cash],
      ["bi-calendar-check", "Confirmed (not done yet)", upcoming]
    ].map(([icon, label, value]) => `
      <div class="col-6 col-lg-3"><div class="card-ds stat-card">
        <span class="icon-circle"><i class="bi ${icon}"></i></span>
        <div><div class="fs-5 fw-bold lh-1">${DS.money(value)}</div><small class="text-muted">${label}</small></div>
      </div></div>`).join("");

    $("eBody").innerHTML = done.map(b => `<tr>
        <td>${DS.niceDate(b.date)}</td>
        <td>${DS.esc(customer(b.customerId).name)}</td>
        <td>${DS.esc(b.service)}</td>
        <td>${b.payMethod === "Cash" ? "Cash" : DS.esc(b.payMethod) + (b.txn ? '<br><small class="text-muted">' + b.txn + "</small>" : "")}</td>
        <td class="text-end fw-bold">${DS.money(b.amount)}</td></tr>`).join("");
    $("eEmpty").classList.toggle("d-none", done.length > 0);
  }

  /* ================= CUSTOMER FEEDBACK ================= */
  if ($("fList")) {
    const me0 = getMe();

    function render() {
      const mine = DS.get("feedback", []).filter(f => f.providerId === user.providerId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const p = getMe();

      $("fSummary").innerHTML = `<div class="d-flex flex-wrap align-items-center gap-4">
        <div class="text-center"><div class="display-5 fw-bold lh-1">${p.rating ? p.rating.toFixed(1) : "-"}</div><div>${DS.stars(p.rating || 0)}</div></div>
        <div><div class="fw-bold">${p.reviews} customer review${p.reviews === 1 ? "" : "s"}</div>
        <small class="text-muted">${mine.length} with written feedback shown below</small></div></div>`;

      $("fList").innerHTML = mine.length ? mine.map(f => {
        const c = customer(f.customerId);
        const replyPart = f.reply
          ? `<div class="reply-box"><small class="text-muted">Your reply (${f.replyDate || ""})</small><div>${DS.esc(f.reply)}</div></div>`
          : `<div class="mt-3"><label class="form-label small fw-medium" for="reply${f.id}">Reply to this customer</label>
              <textarea id="reply${f.id}" class="form-control" rows="2" maxlength="300" placeholder="Write a short, polite reply"></textarea>
              <div class="invalid-feedback">Please write a reply first.</div>
              <button class="btn btn-sm btn-primary mt-2" data-action="reply" data-id="${f.id}"><i class="bi bi-reply me-1"></i>Send Reply</button></div>`;
        return `<div class="card-ds mb-3">
          <div class="d-flex justify-content-between align-items-start">
            <div class="d-flex align-items-center gap-3">
              <span class="avatar" style="background:${DS.color(f.customerId)}">${DS.initials(c.name)}</span>
              <div><strong>${DS.esc(c.name)}</strong><div>${DS.stars(f.rating)}</div></div>
            </div>
            <small class="text-muted">${DS.niceDate(f.date)}</small>
          </div>
          <p class="mt-3 mb-0">${f.comment ? DS.esc(f.comment) : '<span class="text-muted">No written comment.</span>'}</p>
          ${replyPart}
        </div>`;
      }).join("") : `<div class="card-ds empty-state"><i class="bi bi-chat-square-text"></i>No customer feedback yet.</div>`;
    }

    document.querySelector("main").addEventListener("click", e => {
      const btn = e.target.closest("[data-action=reply]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const box = $("reply" + id);
      const text = box.value.trim();
      box.classList.toggle("is-invalid", text === "");
      if (!text) return;

      // BACKEND: later PUT /api/feedback/:id/reply
      const list = DS.get("feedback", []);
      const f = list.find(x => x.id === id);
      f.reply = text;
      f.replyDate = DS.niceDate(DS.todayISO());
      DS.set("feedback", list);
      DS.notify("customer", "bi-reply-fill", "Provider Replied", me0.name + " replied to your feedback.");
      $("pageAlert").innerHTML = '<div class="alert alert-success py-2">Your reply was sent.</div>';
      render();
    });

    render();
  }
})();
