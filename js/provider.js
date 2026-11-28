/* ===== Provider pages (connected to the backend) =====
   Used by: provider/dashboard.html, services.html, earnings.html, feedback.html
   (provider notifications and profile use js/account.js).
   Each part only runs if its page is open (it looks for a special id). */

(async function () {
  // Only service providers may see these pages.
  if (!DS.requireRole(["provider"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);

  // GET /api/provider/me : my own provider record
  let me = null;
  try {
    me = await API.get("/provider/me");
  } catch (err) { /* handled below */ }

  if (!me) {
    document.querySelector("main").innerHTML =
      `<div class="card-ds empty-state"><i class="bi bi-person-x"></i>Your provider profile was not found. Please log in again.</div>`;
    return;
  }

  // Yellow warning shown until the admin verifies this provider
  function verifyNotice() {
    const box = $("verifyNotice");
    if (!box) return;
    box.innerHTML = me.verified ? "" :
      `<div class="alert alert-warning"><i class="bi bi-hourglass-split me-1"></i>
       <strong>Awaiting verification.</strong> The admin must verify your profile before customers can find and book you.</div>`;
  }

  // How the payment of a booking is shown to the provider
  function payLabel(b) {
    if (b.paid && b.payMethod === "Cash") return `<span class="text-success"><i class="bi bi-cash me-1"></i>Cash received (confirmed)</span>`;
    if (b.paid) return `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Paid online (${DS.esc(b.payMethod)})</span>`;
    if (b.payMethod === "Cash") return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Customer says paid in cash: please confirm</span>`;
    if (b.status === "Completed") return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Payment pending</span>`;
    if (b.status === "Cancelled") return `<span class="text-muted">-</span>`;
    return `<span class="text-muted"><i class="bi bi-clock me-1"></i>Customer pays after the job</span>`;
  }

  /* ================= DASHBOARD ================= */
  if ($("dashStats")) {
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
    let bookings = [];
    $("dashSub").innerHTML = DS.avatar(me, "me-2", "width:32px;height:32px;font-size:.8rem;display:inline-grid;vertical-align:middle") +
      " Welcome, " + DS.esc(me.name) + " · " + DS.esc(me.category);
    verifyNotice();

    // GET /api/provider/stats : the four numbers are worked out by the server
    async function stats() {
      try {
        const s = await API.get("/provider/stats");
        const items = [
          ["bi-calendar-day", "Today's jobs", s.todaysJobs],
          ["bi-check2-circle", "Confirmed jobs", s.confirmedJobs],
          ["bi-hourglass-split", "Pending requests", s.pendingRequests],
          ["bi-cash-stack", "Total earnings", DS.money(s.totalEarnings)]
        ];
        $("dashStats").innerHTML = items.map(([icon, label, value]) => `
          <div class="col-6 col-lg-3"><div class="card-ds stat-card">
            <span class="icon-circle"><i class="bi ${icon}"></i></span>
            <div><div class="fs-4 fw-bold lh-1">${value}</div><small class="text-muted">${label}</small></div>
          </div></div>`).join("");
      } catch (err) {
        $("dashStats").innerHTML = `<div class="col-12 text-muted">${DS.esc(err.message)}</div>`;
      }
    }

    function jobCard(b) {
      let buttons = `<button class="btn btn-sm btn-outline-secondary" data-action="details" data-id="${b.id}">Details</button>`;
      if (b.status === "Pending") {
        buttons += `<button class="btn btn-sm btn-primary" data-action="accept" data-id="${b.id}"><i class="bi bi-check-lg me-1"></i>Accept</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="decline" data-id="${b.id}"><i class="bi bi-x-lg me-1"></i>Decline</button>`;
      }
      if (b.status === "Confirmed") {
        buttons += `<button class="btn btn-sm btn-primary" data-action="complete" data-id="${b.id}"><i class="bi bi-check2-all me-1"></i>Mark as Completed</button>`;
      }
      if (b.status === "Completed" && b.payMethod === "Cash" && !b.paid) {
        buttons += `<button class="btn btn-sm btn-primary" data-action="cashconfirm" data-id="${b.id}"><i class="bi bi-cash-coin me-1"></i>Confirm Cash Received</button>`;
      }
      return `<div class="card-ds mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div class="d-flex align-items-center gap-3">
            <span class="avatar" style="background:${DS.color(b.customerId)}">${DS.initials(b.customerName || "C")}</span>
            <div><h3 class="h6 mb-0">${DS.esc(b.service)} &middot; ${DS.esc(b.customerName || "Customer")}</h3><small class="text-muted">Booking #${b.id}</small></div>
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

    async function render() {
      try {
        bookings = await API.get("/bookings");   // GET /api/bookings (the server only sends YOUR jobs)
      } catch (err) {
        $("reqList").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div>`;
        return;
      }
      const req = bookings.filter(b => b.status === "Pending").sort((a, b) => a.date.localeCompare(b.date));
      const conf = bookings.filter(b => b.status === "Confirmed").sort((a, b) => a.date.localeCompare(b.date));
      const hist = bookings.filter(b => b.status === "Completed" || b.status === "Cancelled").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id);      
      $("tabReq").textContent = "Requests (" + req.length + ")";
      $("tabConf").textContent = "Confirmed (" + conf.length + ")";
      $("tabHist").textContent = "History (" + hist.length + ")";
      const empty = text => `<div class="card-ds empty-state"><i class="bi bi-inbox"></i>${text}</div>`;
      $("reqList").innerHTML = req.length ? req.map(jobCard).join("") : empty("No new requests right now.");
      $("confList").innerHTML = conf.length ? conf.map(jobCard).join("") : empty("No confirmed jobs.");
      $("histList").innerHTML = hist.length ? hist.map(jobCard).join("") : empty("No past jobs yet.");
      stats();
    }

    // PUT /api/bookings/:id : the server checks the change is allowed and tells the customer
    async function setStatus(id, status, okText) {
      try {
        await API.put("/bookings/" + id, { status: status });
        $("pageAlert").innerHTML = `<div class="alert alert-success py-2">${DS.esc(okText)}</div>`;
      } catch (err) {
        $("pageAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
      await render();
    }

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
      const b = bookings.find(x => x.id === id);
      if (!b) return;
      const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
      $("detailsBody").innerHTML = `<table class="table table-sm mb-0"><tbody>` +
        row("Booking", "#" + b.id) +
        row("Service", DS.esc(b.service)) +
        row("Customer", DS.esc(b.customerName || "-") + "<br><small class='text-muted'>Phone: " + DS.esc(b.customerPhone || "-") + "</small>") +
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

      if (action === "details") showDetails(id);

      if (action === "accept") setStatus(id, "Confirmed", "Job accepted. The customer has been notified.");

      if (action === "decline") {
        ask("Decline this job?", "The customer will be told that you cannot take this job.", "Yes, decline", "btn-danger",
          () => setStatus(id, "Cancelled", "Job declined."));
      }
      if (action === "cashconfirm") {
        const b1 = bookings.find(x => x.id === id);
        ask("Confirm cash received?",
          "Only confirm if you really received " + DS.money(b1 ? b1.amount : 0) + " in cash from the customer. The payment will then show as Paid.",
          "Yes, I received it", "btn-primary", async () => {
            try {
              await API.post("/payments/" + id + "/confirm-cash");          // POST /api/payments/:bookingId/confirm-cash
              $("pageAlert").innerHTML = `<div class="alert alert-success py-2">Cash payment confirmed. The customer has been notified.</div>`;
            } catch (err) {
              $("pageAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
            }
            await render();
          });
      }
      if (action === "complete") {
        const text = "Confirm the job is finished. The customer will be asked to pay and rate your service. " +
          "Completing the job does not mark any payment as received: the payment stays Pending until it is paid.";
        ask("Mark job as completed?", text, "Yes, completed", "btn-primary",
          () => setStatus(id, "Completed", "Job marked as completed."));
      }
    });

    await render();
  }

  /* ================= MY SERVICES & AVAILABILITY ================= */
  if ($("svcForm")) {
    const sch = DS.schedule(me);
    verifyNotice();

    try {
      const services = await API.get("/categories");   // GET /api/categories
      services.forEach(s => $("sCategory").insertAdjacentHTML("beforeend", `<option>${DS.esc(s.name)}</option>`));
    } catch (err) { /* the form still shows */ }
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
    $("sCategory").value = me.category;
    $("sRate").value = me.rate;
    $("sExperience").value = me.experience;
    $("sBio").value = me.bio || "";
    $("sAvailable").checked = sch.available;
    $("sFrom").value = sch.from;
    $("sTo").value = sch.to;
    sch.days.forEach(d => { $("day" + d).checked = true; });

    const selectedDays = () => [...document.querySelectorAll(".day:checked")].map(x => Number(x.value));

    // Live preview of the provider card
    function preview() {
      const temp = Object.assign({}, me, {
        category: $("sCategory").value, rate: Number($("sRate").value) || 0,
        experience: Number($("sExperience").value) || 0, bio: $("sBio").value
      });
      $("preview").innerHTML = DS.providerCard(temp, "col-12") +
        `<div class="col-12 small text-muted mt-2"><i class="bi bi-clock me-1"></i>${$("sAvailable").checked ? "Works " + DS.daysText(selectedDays()) + ", " + DS.niceTime($("sFrom").value) + " to " + DS.niceTime($("sTo").value) : "Not accepting new bookings"}</div>`;
    }
    $("svcForm").addEventListener("input", preview);
    $("svcForm").addEventListener("change", preview);
    preview();

    $("svcForm").addEventListener("submit", async e => {
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

      try {
        // PUT /api/provider/services
        me = await API.put("/provider/services", {
          category: $("sCategory").value,
          rate: Number($("sRate").value),
          experience: exp,
          bio: $("sBio").value.trim(),
          available: $("sAvailable").checked,
          days: selectedDays(),
          from: $("sFrom").value,
          to: $("sTo").value
        });
        $("svcAlert").innerHTML = '<div class="alert alert-success py-2">Your services and availability were saved.</div>';
        preview();
      } catch (err) {
        $("svcAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
    });
  }

  /* ================= EARNINGS ================= */
  if ($("eStats")) {
    let e = null;
    try {
      e = await API.get("/provider/payments");   // GET /api/provider/payments : totals are worked out by the server
    } catch (err) {
      $("eStats").innerHTML = `<div class="col-12 text-muted">${DS.esc(err.message)}</div>`;
      return;
    }

    $("eStats").innerHTML = [
      ["bi-cash-stack", "Total earned", e.total],
      ["bi-phone", "Online payments", e.online],
      ["bi-cash", "Cash received", e.cash],
      ["bi-calendar-check", "Confirmed (not done yet)", e.upcoming]
    ].map(([icon, label, value]) => `
      <div class="col-6 col-lg-3"><div class="card-ds stat-card">
        <span class="icon-circle"><i class="bi ${icon}"></i></span>
        <div><div class="fs-5 fw-bold lh-1">${DS.money(value)}</div><small class="text-muted">${label}</small></div>
      </div></div>`).join("");

    $("eBody").innerHTML = e.payments.map(p => `<tr>
        <td>${DS.niceDate(p.date)}</td>
        <td>${DS.esc(p.customerName)}</td>
        <td>${DS.esc(p.service)}</td>
        <td>${p.method === "Cash" ? "Cash" : DS.esc(p.method) + (p.txn ? '<br><small class="text-muted">' + DS.esc(p.txn) + "</small>" : "")}</td>
        <td class="text-end fw-bold">${DS.money(p.amount)}</td></tr>`).join("");
    $("eEmpty").classList.toggle("d-none", e.payments.length > 0);
  }

  /* ================= CUSTOMER FEEDBACK ================= */
  if ($("fList")) {
    async function render() {
      let mine = [];
      try {
        me = await API.get("/provider/me");   // fresh rating and review count
        mine = await API.get("/feedback");    // GET /api/feedback : reviews of my jobs
      } catch (err) {
        $("fList").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div>`;
        return;
      }

      $("fSummary").innerHTML = `<div class="d-flex flex-wrap align-items-center gap-4">
        <div class="text-center"><div class="display-5 fw-bold lh-1">${me.rating ? me.rating.toFixed(1) : "-"}</div><div>${DS.stars(me.rating || 0)}</div></div>
        <div><div class="fw-bold">${me.reviews} customer review${me.reviews === 1 ? "" : "s"}</div>
        <small class="text-muted">${mine.length} with written feedback shown below</small></div></div>`;

      $("fList").innerHTML = mine.length ? mine.map(f => {
        const replyPart = f.reply
          ? `<div class="reply-box"><small class="text-muted">Your reply (${f.replyDate ? DS.niceDate(f.replyDate) : ""})</small><div>${DS.esc(f.reply)}</div></div>`
          : `<div class="mt-3"><label class="form-label small fw-medium" for="reply${f.id}">Reply to this customer</label>
              <textarea id="reply${f.id}" class="form-control" rows="2" maxlength="300" placeholder="Write a short, polite reply"></textarea>
              <div class="invalid-feedback">Please write a reply first.</div>
              <button class="btn btn-sm btn-primary mt-2" data-action="reply" data-id="${f.id}"><i class="bi bi-reply me-1"></i>Send Reply</button></div>`;
        return `<div class="card-ds mb-3">
          <div class="d-flex justify-content-between align-items-start">
            <div class="d-flex align-items-center gap-3">
              <span class="avatar" style="background:${DS.color(f.customerId)}">${DS.initials(f.customerName || "C")}</span>
              <div><strong>${DS.esc(f.customerName || "Customer")}</strong><div>${DS.stars(f.rating)}</div></div>
            </div>
            <small class="text-muted">${DS.niceDate(f.date)}</small>
          </div>
          <p class="mt-3 mb-0">${f.comment ? DS.esc(f.comment) : '<span class="text-muted">No written comment.</span>'}</p>
          ${replyPart}
        </div>`;
      }).join("") : `<div class="card-ds empty-state"><i class="bi bi-chat-square-text"></i>No customer feedback yet.</div>`;
    }

    document.querySelector("main").addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-action=reply]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const box = $("reply" + id);
      const text = box.value.trim();
      box.classList.toggle("is-invalid", text === "");
      if (!text) return;

      try {
        await API.put("/feedback/" + id + "/reply", { reply: text });   // PUT /api/feedback/:id/reply
        $("pageAlert").innerHTML = '<div class="alert alert-success py-2">Your reply was sent.</div>';
      } catch (err) {
        $("pageAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
      await render();
    });

    await render();
  }
})();