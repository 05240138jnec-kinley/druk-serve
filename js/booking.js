/* ===== Booking, Payment and My Bookings =====
   Used by: booking.html, payment.html, my-bookings.html
   Each part only runs if its page is open (it looks for a special id). */

(function () {
  if (!DS.requireRole(["customer"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // BACKEND: these three become API calls later (GET/POST/PUT /api/bookings ...)
  const getProviders = () => DS.get("providers", []);
  const getBookings = () => DS.get("bookings", []);
  const saveBookings = list => DS.set("bookings", list);

  function messageCard(wrapId, icon, text) {
    $(wrapId).innerHTML = `<div class="card-ds empty-state"><i class="bi ${icon}"></i>${text}<br>
      <a href="providers.html" class="btn btn-primary mt-3">Find a service</a></div>`;
  }

  /* ================= BOOKING PAGE ================= */
  if ($("bookingWrap")) {
    const p = getProviders().find(x => x.id === Number(params.get("provider")));
    if (!p || !DS.bookable(p)) {
      messageCard("bookingWrap", "bi-person-x", "This provider is not available for booking.");
      return;
    }
    const me = DS.get("users", []).find(u => u.id === user.id) || {};

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

    // Summary box
    $("sumAvatar").textContent = DS.initials(p.name);
    $("sumAvatar").style.background = DS.color(p.id);
    $("sumName").textContent = p.name;
    $("sumCategory").textContent = p.category + " \u00B7 " + p.location;
    $("sumRate").textContent = "Nu. " + p.rate + " / hour";

    function updateTotal() {
      const hours = Number($("hours").value);
      $("sumHours").textContent = hours + (hours > 1 ? " hours" : " hour");
      $("sumTotal").textContent = DS.money(p.rate * hours);
    }
    $("hours").addEventListener("change", updateTotal);
    updateTotal();

    $("bookingForm").addEventListener("submit", e => {
      e.preventDefault();
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
      if (!ok) return;

      // BACKEND: replace this block with POST /api/bookings
      const list = getBookings();
      const hours = Number($("hours").value);
      const booking = {
        id: DS.nextId(list),
        customerId: user.id,
        providerId: p.id,
        service: p.category,
        date: $("date").value,
        time: $("time").value,
        address: $("address").value.trim(),
        notes: $("notes").value.trim(),
        hours: hours,
        status: "Pending",          // the provider will Accept it (Step 5)
        amount: p.rate * hours,
        payMethod: "",
        paid: false
      };
      list.push(booking);
      saveBookings(list);
      DS.notify("provider", "bi-calendar-plus", "New Request",
        user.name + " requested a " + p.category.toLowerCase() + " job on " + DS.niceDate(booking.date) + ".");

      location.href = "payment.html?booking=" + booking.id;
    });
  }

  /* ================= PAYMENT PAGE ================= */
  if ($("paymentWrap")) {
    const list = getBookings();
    const b = list.find(x => x.id === Number(params.get("booking")) && x.customerId === user.id);
    const p = b ? getProviders().find(x => x.id === b.providerId) : null;

    if (!b) {
      messageCard("paymentWrap", "bi-receipt", "Booking not found.");
      return;
    }
    if (b.status === "Cancelled") {
      messageCard("paymentWrap", "bi-x-circle", "This booking was cancelled, so it cannot be paid.");
      return;
    }
    if (b.paid) {
      $("paymentWrap").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-check-circle"></i>
        This booking is already paid.<br><a href="my-bookings.html" class="btn btn-primary mt-3">View My Bookings</a></div>`;
      return;
    }

    $("paySummary").innerHTML = `
      <h2 class="h5 fw-bold mb-3">Booking Summary</h2>
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="avatar" style="background:${DS.color(b.providerId)}">${DS.initials(p ? p.name : "P")}</span>
        <div><div class="fw-bold">${DS.esc(p ? p.name : "Provider")}</div><small class="text-muted">${DS.esc(b.service)}</small></div>
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
        : `Confirm Cash Payment`;
    }
    document.querySelectorAll("input[name=payType]").forEach(r => r.addEventListener("change", refreshChoice));
    refreshChoice();

    function showSuccess(title, text) {
      $("payForm").classList.add("d-none");
      $("paySuccess").classList.remove("d-none");
      $("successTitle").textContent = title;
      $("successText").textContent = text;
    }

    $("payBtn").addEventListener("click", () => {
      const online = document.querySelector("input[name=payType]:checked").value === "online";
      const fresh = getBookings();
      const bk = fresh.find(x => x.id === b.id);

      if (online) {
        // BACKEND: this is only a pretend payment.
        // Later the server starts a payment with BOB mPay / BNB ePay and confirms it (POST /api/payments).
        const gateway = document.querySelector("input[name=gateway]:checked").value;
        $("payBtn").disabled = true;
        $("payBtn").innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
        setTimeout(() => {
          bk.paid = true;
          bk.payMethod = gateway;
          bk.txn = "DS" + Date.now().toString().slice(-8);
          saveBookings(fresh);
          DS.notify("customer", "bi-credit-card-fill", "Payment", "Your payment of " + DS.money(bk.amount) + " was successful.");
          DS.notify("provider", "bi-cash-coin", "Payment Received", "A customer paid " + DS.money(bk.amount) + " online.");
          showSuccess("Payment successful!", "Reference " + bk.txn + ". Your booking has been sent to the provider.");
        }, 1500);
      } else {
        bk.payMethod = "Cash";
        bk.paid = false;
        saveBookings(fresh);
        showSuccess("Booking sent!", "Please pay " + DS.money(bk.amount) + " in cash to the provider after the service.");
      }
    });
  }

  /* ================= MY BOOKINGS PAGE ================= */
  if ($("currentList")) {
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
    let cancelId = null;

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
      if (b.payMethod === "Cash") return `<span class="text-muted"><i class="bi bi-cash me-1"></i>Cash on service</span>`;
      if (b.status === "Cancelled") return `<span class="text-muted">-</span>`;
      return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Payment pending</span>`;
    }

    function card(b, providers, feedback) {
      const p = providers.find(x => x.id === b.providerId);
      const active = b.status === "Pending" || b.status === "Confirmed";
      const fb = feedback.find(f => f.bookingId === b.id);
      let buttons = `<button class="btn btn-sm btn-outline-secondary" data-action="details" data-id="${b.id}">View Details</button>`;
      if (active && !b.paid && !b.payMethod) buttons += `<a class="btn btn-sm btn-primary" href="payment.html?booking=${b.id}">Pay Now</a>`;
      if (active) buttons += `<button class="btn btn-sm btn-outline-danger" data-action="cancel" data-id="${b.id}">Cancel</button>`;
      if (b.status === "Completed" && !fb) buttons += `<a class="btn btn-sm btn-accent" href="feedback.html?booking=${b.id}">Rate Service</a>`;
      if (fb) buttons += `<span class="align-self-center small">Your rating: ${DS.stars(fb.rating)}</span>`;

      return `<div class="card-ds mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div class="d-flex align-items-center gap-3">
            <span class="avatar" style="background:${DS.color(b.providerId)}">${DS.initials(p ? p.name : "P")}</span>
            <div><h3 class="h6 mb-0">${DS.esc(b.service)} &middot; ${DS.esc(p ? p.name : "Provider")}</h3>
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

    function render() {
      // BACKEND: later GET /api/bookings?customerId=...
      const providers = getProviders();
      const feedback = DS.get("feedback", []);
      const mine = getBookings().filter(b => b.customerId === user.id).sort((a, b) => b.date.localeCompare(a.date));
      const current = mine.filter(b => b.status === "Pending" || b.status === "Confirmed");
      const past = mine.filter(b => b.status === "Completed" || b.status === "Cancelled");

      $("tabCurrent").textContent = "Current (" + current.length + ")";
      $("tabPast").textContent = "Past (" + past.length + ")";
      const empty = text => `<div class="card-ds empty-state"><i class="bi bi-calendar-x"></i>${text}</div>`;
      $("currentList").innerHTML = current.length ? current.map(b => card(b, providers, feedback)).join("") : empty("No current bookings.");
      $("pastList").innerHTML = past.length ? past.map(b => card(b, providers, feedback)).join("") : empty("No past bookings yet.");
    }

    function showDetails(id) {
      const b = getBookings().find(x => x.id === id);
      const p = getProviders().find(x => x.id === b.providerId);
      const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
      $("detailsBody").innerHTML = `<table class="table table-sm mb-0"><tbody>` +
        row("Booking", "#" + b.id) +
        row("Service", DS.esc(b.service)) +
        row("Provider", DS.esc(p ? p.name : "-") + (p ? "<br><small class='text-muted'>Phone: " + DS.esc(p.phone) + "</small>" : "")) +
        row("Date and time", DS.niceDate(b.date) + " at " + DS.niceTime(b.time)) +
        row("Address", DS.esc(b.address)) +
        row("Hours", b.hours ? b.hours : "-") +
        row("Notes", DS.esc(b.notes || "-")) +
        row("Total", DS.money(b.amount)) +
        row("Payment", payLabel(b) + (b.txn ? "<br><small class='text-muted'>Ref: " + b.txn + "</small>" : "")) +
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

    $("confirmCancel").addEventListener("click", () => {
      // BACKEND: later PUT /api/bookings/:id  { status: "Cancelled" }
      const list = getBookings();
      const b = list.find(x => x.id === cancelId);
      if (b) {
        b.status = "Cancelled";
        saveBookings(list);
        DS.notify("provider", "bi-x-circle-fill", "Booking Cancelled", "A customer cancelled a " + b.service.toLowerCase() + " booking.");
      }
      modal("cancelModal").hide();
      render();
      $("pageAlert").innerHTML = `<div class="alert alert-secondary">Your booking was cancelled.</div>`;
    });

    render();
  }
})();
