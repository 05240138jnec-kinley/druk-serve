/* ===== Booking, Payment and My Bookings (connected to the backend) =====
   Used by: booking.html, payment.html, my-bookings.html
   Each part only runs if its page is open (it looks for a special id). */

(async function () {
  if (!DS.requireRole(["customer"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  function messageCard(wrapId, icon, text) {
    $(wrapId).innerHTML = `<div class="card-ds empty-state"><i class="bi ${icon}"></i>${DS.esc(text)}<br>
      <a href="providers.html" class="btn btn-primary mt-3">Find a service</a></div>`;
  }

  /* ================= BOOKING PAGE ================= */
  if ($("bookingWrap")) {
    let p = null, me = {};
    try {
      p = await API.get("/providers/" + encodeURIComponent(params.get("provider")));   // GET /api/providers/:id
      me = await API.get("/profile");                                                  // GET /api/profile
    } catch (err) { /* handled below */ }

    if (!p || !DS.bookable(p)) {
      messageCard("bookingWrap", "bi-person-x", "This provider is not available for booking.");
      return;
    }

    // Fill the form
    $("custName").value = me.name || user.name;
    $("custPhone").value = me.phone || "";
    $("address").value = me.address || "";
    $("date").min = DS.todayISO();
    const sch = DS.schedule(p);           // the provider's working days and hours
    $("workHint").textContent = "Works " + DS.daysText(sch.days) + ", " + DS.niceTime(sch.from) + " to " + DS.niceTime(sch.to) + ".";
    for (let h = parseInt(sch.from); h < parseInt(sch.to); h++) {
      const v = String(h).padStart(2, "0") + ":00";
      $("time").insertAdjacentHTML("beforeend", `<option value="${v}">${DS.niceTime(v)}</option>`);
    }
    for (let h = 1; h <= 8; h++) {
      $("hours").insertAdjacentHTML("beforeend", `<option value="${h}">${h} hour${h > 1 ? "s" : ""}</option>`);
    }

    // Summary box (this total is only a preview: the server calculates the real price)
    $("sumAvatar").textContent = DS.initials(p.name);
    $("sumAvatar").style.background = DS.color(p.id);
    $("sumName").textContent = p.name;
    $("sumCategory").textContent = p.category + " · " + p.location;
    $("sumRate").textContent = "Nu. " + p.rate + " / hour";

    function updateTotal() {
      const hours = Number($("hours").value);
      $("sumHours").textContent = hours + (hours > 1 ? " hours" : " hour");
      $("sumTotal").textContent = DS.money(p.rate * hours);
    }
    $("hours").addEventListener("change", updateTotal);
    updateTotal();

    // Feedback after every attempt: a red/yellow message at the top of the form (and a small pop-up), so it is never missed.
    function showFormMessage(text, type) {
      let box = $("bookingAlert");
      if (!box) {
        box = document.createElement("div");
        box.id = "bookingAlert";
        box.setAttribute("role", "alert");
        $("bookingForm").prepend(box);
      }
      box.className = "alert alert-" + type;
      box.textContent = text;
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      DS.toast(text, type);
    }

    // The pop-up shown after a booking was saved: what was booked, the status and what happens next.
    function showBookingSuccess(b) {
      const old = $("bookingDoneModal");
      if (old) old.remove();
      const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="bookingDoneModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false" aria-labelledby="bookingDoneTitle" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
            <div class="modal-body p-4">
              <div class="text-center mb-3">
                <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
                <h2 class="h4 fw-bold mt-2 mb-1" id="bookingDoneTitle">Booking submitted successfully!</h2>
                <p class="text-muted mb-0">Your request has been sent to ${DS.esc(b.providerName || p.name)}. You will get a notification when they respond.</p>
              </div>
              <table class="table table-sm mb-3"><tbody>
                ${row("Booking number", "#" + b.id)}
                ${row("Service", DS.esc(b.service) + " &middot; " + DS.esc(b.providerName || p.name))}
                ${row("Date and time", DS.niceDate(b.date) + " at " + DS.niceTime(b.time))}
                ${row("Duration", b.hours + (b.hours > 1 ? " hours" : " hour"))}
                ${row("Address", DS.esc(b.address))}
                ${row("Total", "<strong>" + DS.money(b.amount) + "</strong>")}
                ${row("Payment", "Pay after the job is done (online or cash)")}
                ${row("Status", '<span class="badge-status st-' + DS.esc(b.status) + '">' + DS.esc(b.status) + "</span> <small class=\"text-muted ms-1\">Waiting for the provider to accept</small>")}
              </tbody></table>
              <div class="d-grid gap-2">
                <a href="my-bookings.html" class="btn btn-primary">View My Bookings</a>
                <a href="providers.html" class="btn btn-outline-secondary">Book another service</a>
              </div>
            </div>
          </div></div>
        </div>`);
      bootstrap.Modal.getOrCreateInstance($("bookingDoneModal")).show();
    }

    $("bookingForm").addEventListener("submit", async e => {
      e.preventDefault();
      const oldMessage = $("bookingAlert");
      if (oldMessage) oldMessage.remove();
      let ok = true;
      function check(id, valid) {
        $(id).classList.toggle("is-invalid", !valid);
        if (!valid) ok = false;
      }
      check("address", $("address").value.trim().length >= 5);
      const dateOk = $("date").value !== "" && $("date").value >= DS.todayISO();
      const dayOk = !dateOk || sch.days.includes(DS.weekday($("date").value));
      $("dateMsg").textContent = !dateOk ? "Choose today or a future date." : "This provider does not work on that day.";
      check("date", dateOk && dayOk);
      check("time", $("time").value !== "");
      if (!ok) {
        showFormMessage("Your booking was not sent. Please correct the highlighted fields and try again.", "warning");
        return;
      }

      const button = e.submitter || $("bookingForm").querySelector("[type=submit]");
      if (button) button.disabled = true;
      try {
        // POST /api/bookings : the server checks the time, stops double booking and works out the price
        const booking = await API.post("/bookings", {
          providerId: p.id,
          date: $("date").value,
          time: $("time").value,
          hours: Number($("hours").value),
          address: $("address").value.trim(),
          notes: $("notes").value.trim()
        });
        showBookingSuccess(booking);          // the button stays off, so the same booking cannot be sent twice
      } catch (err) {
        if (err.fields && err.fields.time) { $("time").classList.add("is-invalid"); }
        if (err.fields && err.fields.date) { $("dateMsg").textContent = err.fields.date; $("date").classList.add("is-invalid"); }
        showFormMessage("Your booking was not sent. " + (err.message || "Please check your connection and try again."), "danger");
        if (button) button.disabled = false;
      }
    });
  }

  /* ================= PAYMENT PAGE ================= */
  if ($("paymentWrap")) {
    let b = null;
    try {
      b = await API.get("/bookings/" + encodeURIComponent(params.get("booking")));   // GET /api/bookings/:id
    } catch (err) { /* handled below */ }

    if (!b) {
      messageCard("paymentWrap", "bi-receipt", "Booking not found.");
      return;
    }
    if (b.status === "Cancelled") {
      messageCard("paymentWrap", "bi-x-circle", "This booking was cancelled, so it cannot be paid.");
      return;
    }
    if (b.status !== "Completed") {
      messageCard("paymentWrap", "bi-hourglass-split", "You can pay once the provider has finished the job.");
      return;
    }
    if (b.paid) {
      $("paymentWrap").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-check-circle"></i>
        This booking is already paid.<br><a href="my-bookings.html" class="btn btn-primary mt-3">View My Bookings</a></div>`;
      return;
    }

    if (b.payMethod === "Cash") {          // already reported: waiting for the provider
      $("paymentWrap").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-hourglass-split"></i>
        You told us you paid ${DS.money(b.amount)} in cash.<br>It will show as Paid after the provider confirms they received it.<br>
        <a href="my-bookings.html" class="btn btn-primary mt-3">View My Bookings</a></div>`;
      return;
    }

    $("paySummary").innerHTML = `
      <h2 class="h5 fw-bold mb-3">Booking Summary</h2>
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="avatar" style="background:${DS.color(b.providerId)}">${DS.initials(b.providerName || "P")}</span>
        <div><div class="fw-bold">${DS.esc(b.providerName || "Provider")}</div><small class="text-muted">${DS.esc(b.service)}</small></div>
      </div>
      <div class="small mb-2"><i class="bi bi-calendar me-2 text-muted"></i>${DS.niceDate(b.date)} at ${DS.niceTime(b.time)}</div>
      <div class="small mb-2"><i class="bi bi-geo-alt me-2 text-muted"></i>${DS.esc(b.address)}</div>
      <hr>
      <div class="d-flex justify-content-between fs-5 fw-bold"><span>Total</span><span class="text-primary">${DS.money(b.amount)}</span></div>`;

    function refreshChoice() {
      const online = document.querySelector("input[name=payType]:checked").value === "online";
      $("onlineBox").classList.toggle("d-none", !online);
      $("cashBox").classList.toggle("d-none", online);
      $("payBtn").innerHTML = online
        ? `<i class="bi bi-lock-fill me-1"></i>Pay ${DS.money(b.amount)}`
        : `I Paid in Cash`;
      $("cashBox").innerHTML = `<i class="bi bi-info-circle me-1"></i>Pay the provider in cash, then tap the button. ` +
        `Your payment shows as <strong>Paid</strong> only after the provider confirms that they received the cash.`;
    }
    document.querySelectorAll("input[name=payType]").forEach(r => r.addEventListener("change", refreshChoice));
    refreshChoice();

    function showSuccess(title, text) {
      $("payForm").classList.add("d-none");
      $("paySuccess").classList.remove("d-none");
      $("successTitle").textContent = title;
      $("successText").textContent = text;
    }

    $("payBtn").addEventListener("click", async () => {
      const online = document.querySelector("input[name=payType]:checked").value === "online";
      const method = online ? document.querySelector("input[name=gateway]:checked").value : "Cash";

      $("payBtn").disabled = true;
      if (online) $("payBtn").innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
      try {
        // POST /api/payments : the server takes the amount from the booking and talks to the payment gateway
        // (PAYMENT_MODE=sandbox pretends the payment worked)
        const done = await API.post("/payments", { bookingId: b.id, method: method });
        if (online) {
          showSuccess("Payment successful!", "Reference " + done.txn + ". Thank you! Please rate the service from My Bookings.");
        } else {
          showSuccess("Cash payment reported", "You said you paid " + DS.money(done.amount) + " in cash. It will show as Paid after the provider confirms they received it. You can rate the service from My Bookings.");
        }
      } catch (err) {
        DS.toast(err.message, "danger");
        $("payBtn").disabled = false;
        refreshChoice();
      }
    });
  }

  /* ================= MY BOOKINGS PAGE ================= */
  if ($("currentList")) {
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
    let cancelId = null;
    let bookings = [];

    if (params.get("msg")) {
      $("pageAlert").innerHTML = `<div class="alert alert-success">${DS.esc(params.get("msg"))}</div>`;
    }

    function timeline(b) {
      if (b.status === "Cancelled") {
        return `<div class="timeline">
          <div class="tl-step done"><span><i class="bi bi-check"></i></span>Booked</div>
          <div class="tl-step cancelled"><span><i class="bi bi-x"></i></span>Cancelled</div></div>`;
      }
      const index = { Pending: 0, Confirmed: 1, Completed: 2 }[b.status];
      return `<div class="timeline">` + ["Booked", "Confirmed", "Completed"].map((label, i) => {
        const done = i < index || b.status === "Completed";
        const cls = done ? "done" : (i === index ? "active" : "");
        return `<div class="tl-step ${cls}"><span>${done ? '<i class="bi bi-check"></i>' : i + 1}</span>${label}</div>`;
      }).join("") + `</div>`;
    }

    function payLabel(b) {
      if (b.paid) return `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Paid via ${DS.esc(b.payMethod)}</span>`;
      if (b.payMethod === "Cash") return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Cash: waiting for provider to confirm</span>`;
      if (b.status === "Cancelled") return `<span class="text-muted">-</span>`;
      if (b.status === "Completed") return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Payment due</span>`;
      return `<span class="text-muted"><i class="bi bi-clock me-1"></i>Pay after the job</span>`;
    }

    function card(b) {
      const active = b.status === "Pending" || b.status === "Confirmed";
      const rated = b.rating !== null && b.rating !== undefined;
      let buttons = `<button class="btn btn-sm btn-outline-secondary" data-action="details" data-id="${b.id}">View Details</button>`;
      if (b.status === "Completed" && !b.paid && b.payMethod !== "Cash") buttons += `<a class="btn btn-sm btn-primary" href="payment.html?booking=${b.id}">Pay Now</a>`;
      if (active) buttons += `<button class="btn btn-sm btn-outline-danger" data-action="cancel" data-id="${b.id}">Cancel</button>`;
      if (b.status === "Completed" && !rated) buttons += `<a class="btn btn-sm btn-accent" href="feedback.html?booking=${b.id}">Rate Service</a>`;
      if (rated) buttons += `<span class="align-self-center small">Your rating: ${DS.stars(b.rating)}</span>`;

      return `<div class="card-ds mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div class="d-flex align-items-center gap-3">
            <span class="avatar" style="background:${DS.color(b.providerId)}">${DS.initials(b.providerName || "P")}</span>
            <div><h3 class="h6 mb-0">${DS.esc(b.service)} &middot; ${DS.esc(b.providerName || "Provider")}</h3>
              <small class="text-muted">Booking #${b.id}</small></div>
          </div>
          <span class="badge-status st-${b.status}">${b.status}</span>
        </div>
        <div class="row small text-muted my-3 gy-1">
          <div class="col-md-4"><i class="bi bi-calendar me-1"></i>${DS.niceDate(b.date)} at ${DS.niceTime(b.time)}</div>
          <div class="col-md-5"><i class="bi bi-geo-alt me-1"></i>${DS.esc(b.address)}</div>
          <div class="col-md-3"><strong class="text-dark">${DS.money(b.amount)}</strong><br>${payLabel(b)}</div>
        </div>
        ${timeline(b)}
        <div class="d-flex flex-wrap gap-2 mt-3">${buttons}</div>
      </div>`;
    }

    async function render() {
      try {
        bookings = await API.get("/bookings");   // GET /api/bookings (the server only sends YOUR bookings)
      } catch (err) {
        $("currentList").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div>`;
        return;
      }
      const mine = bookings.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id);      
      const current = mine.filter(b => b.status === "Pending" || b.status === "Confirmed");
      const past = mine.filter(b => b.status === "Completed" || b.status === "Cancelled");

      $("tabCurrent").textContent = "Current (" + current.length + ")";
      $("tabPast").textContent = "Past (" + past.length + ")";
      const empty = text => `<div class="card-ds empty-state"><i class="bi bi-calendar-x"></i>${text}</div>`;
      $("currentList").innerHTML = current.length ? current.map(card).join("") : empty("No current bookings.");
      $("pastList").innerHTML = past.length ? past.map(card).join("") : empty("No past bookings yet.");
    }

    function showDetails(id) {
      const b = bookings.find(x => x.id === id);
      if (!b) return;
      const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
      $("detailsBody").innerHTML = `<table class="table table-sm mb-0"><tbody>` +
        row("Booking", "#" + b.id) +
        row("Service", DS.esc(b.service)) +
        row("Provider", DS.esc(b.providerName || "-") + (b.providerPhone ? "<br><small class='text-muted'>Phone: " + DS.esc(b.providerPhone) + "</small>" : "")) +
        row("Date and time", DS.niceDate(b.date) + " at " + DS.niceTime(b.time)) +
        row("Address", DS.esc(b.address)) +
        row("Hours", b.hours ? b.hours : "-") +
        row("Notes", DS.esc(b.notes || "-")) +
        row("Total", DS.money(b.amount)) +
        row("Payment", payLabel(b) + (b.txn ? "<br><small class='text-muted'>Ref: " + DS.esc(b.txn) + "</small>" : "")) +
        row("Status", `<span class="badge-status st-${b.status}">${b.status}</span>`) +
        `</tbody></table>`;
      modal("detailsModal").show();
    }

    // Buttons inside the booking cards
    document.querySelector("main").addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === "details") showDetails(id);
      if (btn.dataset.action === "cancel") { cancelId = id; modal("cancelModal").show(); }
    });

    $("confirmCancel").addEventListener("click", async () => {
      try {
        // PUT /api/bookings/:id : the server checks that this booking is yours and may be cancelled
        await API.put("/bookings/" + cancelId, { status: "Cancelled" });
        modal("cancelModal").hide();
        await render();
        $("pageAlert").innerHTML = `<div class="alert alert-secondary">Your booking was cancelled.</div>`;
      } catch (err) {
        modal("cancelModal").hide();
        $("pageAlert").innerHTML = `<div class="alert alert-danger">${DS.esc(err.message)}</div>`;
      }
    });

    await render();
  }
})();