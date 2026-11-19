/* ===== Feedback, Notifications and My Profile (connected to the backend) =====
   Used by: customer/feedback.html, customer/notifications.html, customer/profile.html
   (the provider versions of notifications and profile reuse this file).
   Each part only runs if its page is open (it looks for a special id). */

(async function () {
  if (!DS.requireRole(["customer", "provider"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  function showMessage(wrapId, icon, text, linkText, linkHref) {
    $(wrapId).innerHTML = `<div class="card-ds empty-state"><i class="bi ${icon}"></i>${DS.esc(text)}<br>
      <a href="${linkHref}" class="btn btn-primary mt-3">${linkText}</a></div>`;
  }

  // Older notifications do not know what they are about. These pages are the fallback for them.
  const NOTIF_PAGE = {
    customer: {
      "Job Accepted": "my-bookings.html", "Job Declined": "my-bookings.html", "Job Completed": "my-bookings.html",
      "Payment": "my-bookings.html", "Provider Replied": "my-bookings.html"
    },
    provider: {
      "New Request": "dashboard.html", "Booking Cancelled": "dashboard.html",
      "Payment Received": "earnings.html", "New Feedback": "feedback.html",
      "Profile Verified": "services.html", "Verification Removed": "services.html"
    }
  };

  /* ================= FEEDBACK PAGE (customers only) ================= */
  if ($("feedbackWrap")) {
    if (user.role !== "customer") { location.href = DS.base + "login.html"; return; }

    let booking = null;
    try {
      booking = await API.get("/bookings/" + encodeURIComponent(params.get("booking")));   // GET /api/bookings/:id
    } catch (err) { /* handled below */ }

    if (!booking) {
      showMessage("feedbackWrap", "bi-receipt", "Booking not found.", "My Bookings", "my-bookings.html");
      return;
    }
    if (booking.status !== "Completed") {
      showMessage("feedbackWrap", "bi-hourglass-split", "You can only rate a booking after it is completed.", "My Bookings", "my-bookings.html");
      return;
    }
    if (booking.rating !== null && booking.rating !== undefined) {
      showMessage("feedbackWrap", "bi-check-circle", "You have already rated this booking. Thank you!", "My Bookings", "my-bookings.html");
      return;
    }

    $("fbService").textContent = booking.service + " by " + (booking.providerName || "your provider");

    // Star buttons
    const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];
    let rating = 0;
    $("starRow").innerHTML = [1, 2, 3, 4, 5].map(n =>
      `<button type="button" class="star-btn" data-v="${n}" aria-label="${n} star${n > 1 ? "s" : ""}"><i class="bi bi-star-fill"></i></button>`).join("");
    const stars = [...document.querySelectorAll(".star-btn")];

    function paint(value) {
      stars.forEach(s => s.classList.toggle("on", Number(s.dataset.v) <= value));
    }
    stars.forEach(s => {
      s.addEventListener("mouseenter", () => paint(Number(s.dataset.v)));
      s.addEventListener("mouseleave", () => paint(rating));
      s.addEventListener("click", () => {
        rating = Number(s.dataset.v);
        paint(rating);
        $("starLabel").textContent = rating + " / 5 - " + labels[rating - 1];
        $("starError").classList.add("d-none");
      });
    });

    $("comment").addEventListener("input", () => { $("charCount").textContent = $("comment").value.length; });

    $("submitRating").addEventListener("click", async () => {
      if (!rating) { $("starError").classList.remove("d-none"); return; }

      $("submitRating").disabled = true;
      try {
        // POST /api/feedback : the server checks the booking is yours and completed, then updates the provider's average
        await API.post("/feedback", { bookingId: booking.id, rating: rating, comment: $("comment").value.trim() });
        location.href = "my-bookings.html?msg=" + encodeURIComponent("Thank you for your feedback!");
      } catch (err) {
        DS.toast(err.message, "danger");
        $("submitRating").disabled = false;
      }
    });
  }

  /* ================= NOTIFICATIONS PAGE ================= */
  if ($("notifList")) {
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));

    async function render() {
      let mine = [];
      try {
        mine = await API.get("/notifications");   // GET /api/notifications (only YOUR notifications)
      } catch (err) {
        $("notifList").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div>`;
        return;
      }
      const unread = mine.filter(n => !n.read).length;
      $("unreadCount").textContent = unread + " new";
      $("unreadCount").classList.toggle("d-none", unread === 0);

      $("notifList").innerHTML = mine.length ? mine.map(n => `
        <div class="notif ${n.read ? "" : "unread"}" data-id="${n.id}" role="button" tabindex="0">
          <span class="icon-circle"><i class="bi ${DS.esc(n.icon)}"></i></span>
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between"><strong>${DS.esc(n.title)}</strong><small class="text-muted">${DS.esc(n.time)}</small></div>
            <div class="small text-muted">${DS.esc(n.text)}</div>
          </div>
          ${n.read ? "" : '<span class="dot" title="Unread"></span>'}
        </div>`).join("")
        : `<div class="card-ds empty-state"><i class="bi bi-bell-slash"></i>You have no notifications.</div>`;
      DS.renderNavbar();   // refresh the red number in the top menu
    }

    async function change(call) {
      try { await call(); } catch (err) { DS.toast(err.message, "danger"); }
      await render();
    }

    // Click a notification to open its details page (the page marks it as read)
    $("notifList").addEventListener("click", e => {
      const item = e.target.closest(".notif");
      if (!item) return;
      location.href = "notification.html?id=" + item.dataset.id;
    });

    $("markAll").addEventListener("click", () => change(() => API.put("/notifications/read-all")));
    $("clearAll").addEventListener("click", () => modal("clearModal").show());
    $("confirmClear").addEventListener("click", () => {
      modal("clearModal").hide();
      change(() => API.del("/notifications"));
    });

    await render();
  }

  /* ================= NOTIFICATION DETAILS PAGE ================= */
  if ($("notifDetail")) {
    const isCustomer = user.role === "customer";
    const id = Number(params.get("id"));
    let n = null;

    const backBtn = `<a href="notifications.html" class="btn btn-outline-secondary"><i class="bi bi-arrow-left me-1"></i>Back to Notifications</a>`;
    const link = (href, icon, text, cls = "btn-outline-primary") =>
      `<a href="${href}" class="btn ${cls}"><i class="bi ${icon} me-1"></i>${text}</a>`;
    const phoneLink = (phone, text) => phone
      ? `<a href="tel:${DS.esc(phone)}" class="btn btn-outline-primary"><i class="bi bi-telephone me-1"></i>${text} (${DS.esc(phone)})</a>` : "";
    const row = (k, v) => `<tr><th class="text-muted fw-normal" style="width:38%">${k}</th><td>${v}</td></tr>`;
    const stamp = (d, t) => DS.niceDate(d) + " at " + DS.niceTime(t);

    function payText(b) {
      if (b.paid) return `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Paid via ${DS.esc(b.payMethod || "Cash")}</span>` +
        (b.txn ? `<br><small class="text-muted">Ref: ${DS.esc(b.txn)}</small>` : "");
      if (b.status === "Cancelled") return `<span class="text-muted">-</span>`;
      if (b.status === "Completed") return `<span class="text-warning"><i class="bi bi-hourglass-split me-1"></i>Payment due</span>`;
      return `<span class="text-muted"><i class="bi bi-clock me-1"></i>Pay after the job</span>`;
    }

    // The booking this notification is about
    function bookingCard(b) {
      const other = isCustomer ? ["Provider", b.providerName, b.providerPhone] : ["Customer", b.customerName, b.customerPhone];
      return `<div class="card-ds mb-3"><h2 class="h5 fw-bold mb-3">Booking #${b.id}</h2>
        <table class="table table-sm mb-0"><tbody>` +
        row("Service", DS.esc(b.service)) +
        row(other[0], DS.esc(other[1] || "-") + (other[2] ? "<br><small class='text-muted'>Phone: " + DS.esc(other[2]) + "</small>" : "")) +
        row("Date and time", stamp(b.date, b.time)) +
        row("Address", DS.esc(b.address)) +
        row("Hours", b.hours ? b.hours : "-") +
        row("Notes", DS.esc(b.notes || "-")) +
        row("Total", DS.money(b.amount)) +
        row("Payment", payText(b)) +
        row("Status", `<span class="badge-status st-${b.status}">${b.status}</span>`) +
        `</tbody></table></div>`;
    }

    // A review, and the provider's reply if there is one
    function reviewCard(f, b) {
      const reviewer = isCustomer ? "Your review" : "Review from " + DS.esc(f.customerName || "a customer");
      let html = `<div class="card-ds mb-3">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h2 class="h5 fw-bold mb-0">${reviewer}</h2><small class="text-muted">${DS.niceDate(f.date)}</small></div>
        <div>${DS.stars(f.rating)} <span class="text-muted small ms-1">${f.rating} / 5</span></div>
        <p class="mt-2 mb-0">${f.comment ? DS.esc(f.comment) : '<span class="text-muted">No written comment.</span>'}</p>
        <div class="small text-muted mt-2"><i class="bi bi-tools me-1"></i>${DS.esc(b.service)} on ${stamp(b.date, b.time)}</div>`;
      if (f.reply) {
        html += `<div class="reply-box"><small class="text-muted">${isCustomer ? "Reply from " + DS.esc(b.providerName) : "Your reply"}` +
          `${f.replyDate ? " &middot; " + DS.niceDate(f.replyDate) : ""}</small><div style="white-space:pre-wrap">${DS.esc(f.reply)}</div></div>`;
      }
      return html + `</div>`;
    }

    function actions(n) {
      const r = n.related;
      const b = r && r.booking;
      const buttons = [backBtn];
      if (isCustomer) {
        if (b) {
          if (n.title === "Provider Replied") {
            buttons.push(link("provider-profile.html?id=" + b.providerId, "bi-person-lines-fill", "View Provider Profile", "btn-primary"));
          }
          if (n.title === "Job Declined") {
            buttons.push(link("providers.html?service=" + encodeURIComponent(b.service), "bi-search", "Find Another Provider", "btn-primary"));
          }
          if (n.title === "Job Completed" && (b.rating === null || b.rating === undefined)) {
            buttons.push(link("feedback.html?booking=" + b.id, "bi-star", "Rate Service", "btn-accent"));
          }
          if (n.title === "Job Completed" && !b.paid) {
            buttons.push(link("payment.html?booking=" + b.id, "bi-credit-card", "Pay Now", "btn-primary"));
          }
          buttons.push(link("my-bookings.html", "bi-calendar-check", "View Booking"));
          if (n.title !== "Job Declined") buttons.push(phoneLink(b.providerPhone, "Contact Provider"));
        } else {
          const page = NOTIF_PAGE.customer[n.title];
          if (page) buttons.push(link(page, "bi-calendar-check", "Open My Bookings", "btn-primary"));
        }
      } else {
        if (n.title === "New Request" && b && b.status === "Pending") {
          buttons.push(`<button class="btn btn-primary" data-act="Confirmed"><i class="bi bi-check-lg me-1"></i>Accept</button>`);
          buttons.push(`<button class="btn btn-outline-danger" data-act="Cancelled"><i class="bi bi-x-lg me-1"></i>Decline</button>`);
        }
        const page = NOTIF_PAGE.provider[n.title];
        const label = { "dashboard.html": "Open Dashboard", "earnings.html": "View Earnings", "feedback.html": "Reply to Reviews", "services.html": "My Services" }[page];
        if (page) buttons.push(link(page, "bi-box-arrow-up-right", label, "btn-outline-primary"));
        if (b) buttons.push(phoneLink(b.customerPhone, "Contact Customer"));
      }
      return `<div class="d-flex flex-wrap gap-2">${buttons.join("")}</div>`;
    }

    function show(note) {
      const r = note.related;
      let body = "";
      if (r && r.type === "feedback") body = reviewCard(r.feedback, r.booking) + bookingCard(r.booking);
      else if (r && r.type === "booking") body = bookingCard(r.booking);
      else body = `<div class="card-ds mb-3 text-muted small"><i class="bi bi-info-circle me-1"></i>No more details are available for this notification.</div>`;

      $("notifDetail").innerHTML = `
        <div class="card-ds mb-3">
          <div class="d-flex gap-3 align-items-start">
            <span class="icon-circle" style="width:48px;height:48px;font-size:1.3rem;flex-shrink:0"><i class="bi ${DS.esc(note.icon)}"></i></span>
            <div class="flex-grow-1">
              <h2 class="h5 fw-bold mb-1">${DS.esc(note.title)}</h2>
              <div class="small text-muted mb-2"><i class="bi bi-clock me-1"></i>${stamp(note.when.date, note.when.time)} &middot; ${DS.esc(note.time)}</div>
              <p class="mb-0">${DS.esc(note.text)}</p>
            </div>
          </div>
        </div>
        <div id="detailAlert"></div>
        ${body}
        ${actions(note)}`;
    }

    try {
      n = await API.get("/notifications/" + id);   // GET /api/notifications/:id
    } catch (err) { /* handled below */ }

    if (!n) {
      showMessage("notifDetail", "bi-bell-slash", "This notification was not found. It may have been cleared.", "Back to Notifications", "notifications.html");
      return;
    }
    show(n);
    API.put("/notifications/" + id + "/read").then(() => DS.renderNavbar()).catch(() => {});   // opening it counts as reading it

    // Provider: Accept or Decline a new request right from here
    $("notifDetail").addEventListener("click", async e => {
      const btn = e.target.closest("[data-act]");
      if (!btn || !n.related || !n.related.booking) return;
      btn.disabled = true;
      try {
        await API.put("/bookings/" + n.related.booking.id, { status: btn.dataset.act });
        n = await API.get("/notifications/" + id);
        show(n);
        $("detailAlert").innerHTML = `<div class="alert alert-success py-2">${btn.dataset.act === "Confirmed" ? "Job accepted. The customer has been notified." : "Job declined."}</div>`;
      } catch (err) {
        btn.disabled = false;
        $("detailAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
    });
  }

  /* ================= MY PROFILE PAGE ================= */
  if ($("profileForm")) {
    let me = null;
    try {
      me = await API.get("/profile");   // GET /api/profile
    } catch (err) { /* the 401 handler already sends you to the login page */ }
    if (!me) return;

    $("pLocation").innerHTML = LOCATIONS.map(l => `<option>${l}</option>`).join("");
    function fillForm() {
      $("pName").value = me.name;
      $("pEmail").value = me.email;
      $("pPhone").value = me.phone || "";
      $("pLocation").value = me.location || LOCATIONS[0];
      $("pAddress").value = me.address || "";
      $("profName").textContent = me.name;
      $("profRole").textContent = me.role.charAt(0).toUpperCase() + me.role.slice(1);
      showAvatar();
    }

    // The round picture: the photo when there is one, otherwise the initials (the default picture)
    function showAvatar(previewUrl) {
      const el = $("profAvatar");
      const src = previewUrl || API.fileUrl(me.photo);
      if (src) {
        el.style.background = "none"; el.style.padding = "0"; el.style.overflow = "hidden";
        el.innerHTML = `<img src="${DS.esc(src)}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover">`;
      } else {
        el.style.background = DS.color(me.id); el.style.padding = ""; el.style.overflow = "";
        el.textContent = DS.initials(me.name);
      }
      $("photoRemove").classList.toggle("d-none", !me.photo || !!previewUrl);
    }

    // "Upload photo" buttons (added here, so the HTML page does not need to change)
    $("profName").parentElement.insertAdjacentHTML("beforeend", `<div class="mt-2">
      <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" class="d-none">
      <button type="button" class="btn btn-sm btn-outline-primary" id="photoBtn"><i class="bi bi-camera me-1"></i>Upload photo</button>
      <button type="button" class="btn btn-sm btn-primary d-none" id="photoSave"><i class="bi bi-check-lg me-1"></i>Save photo</button>
      <button type="button" class="btn btn-sm btn-outline-secondary d-none" id="photoCancel">Cancel</button>
      <button type="button" class="btn btn-sm btn-outline-danger d-none" id="photoRemove"><i class="bi bi-trash me-1"></i>Remove</button>
      <div class="small text-muted mt-1">JPG, PNG or WEBP, up to 5 MB.</div></div>`);

    // Shrink the chosen picture to a 512 x 512 JPEG in the browser (small and fast to send)
    function shrink(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const size = 512, side = Math.min(img.width, img.height);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);      // PNG/WEBP see-through parts become white
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file could not be read as a picture.")); };
        img.src = url;
      });
    }

    const photoMsg = (text, kind) => { $("profileAlert").innerHTML = `<div class="alert alert-${kind} py-2">${DS.esc(text)}</div>`; };
    let pending = null;                                   // the picture chosen but not saved yet

    function endPreview() {
      pending = null;
      $("photoSave").classList.add("d-none");
      $("photoCancel").classList.add("d-none");
      $("photoBtn").classList.remove("d-none");
      showAvatar();
    }

    $("photoBtn").addEventListener("click", () => $("photoInput").click());           // opens the gallery / file explorer
    $("photoInput").addEventListener("change", async () => {
      const file = $("photoInput").files[0];
      $("photoInput").value = "";
      if (!file) return;
      const okType = /^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
      if (!okType) return photoMsg("Please choose a JPG, JPEG, PNG or WEBP picture.", "danger");
      if (file.size > 5 * 1024 * 1024) return photoMsg("That picture is " + (file.size / 1048576).toFixed(1) + " MB. Please choose one under 5 MB.", "danger");
      try {
        pending = await shrink(file);
        showAvatar(pending);                                // preview before saving
        $("profileAlert").innerHTML = "";
        $("photoSave").classList.remove("d-none");
        $("photoCancel").classList.remove("d-none");
        $("photoBtn").classList.add("d-none");
      } catch (err) {
        photoMsg(err.message, "danger");
      }
    });
    $("photoCancel").addEventListener("click", endPreview);

    function refreshSession() {
      DS.login(me);                                         // the saved session the top menu reads (name, photo)
      API.saveSession(localStorage.getItem("ds_token"), { id: me.id, role: me.role, name: me.name, email: me.email, providerId: me.providerId, photo: me.photo || null });
      DS.renderNavbar();                                    // the top menu shows the new picture straight away
    }

    $("photoSave").addEventListener("click", async () => {
      $("photoSave").disabled = true;
      try {
        me = await API.put("/profile/photo", { photo: pending });          // PUT /api/profile/photo : saved as a file on the server
        refreshSession();
        endPreview();
        photoMsg("Your photo was saved.", "success");
      } catch (err) {
        photoMsg(err.message, "danger");
      }
      $("photoSave").disabled = false;
    });
    $("photoRemove").addEventListener("click", async () => {
      try {
        me = await API.del("/profile/photo");                              // DELETE /api/profile/photo
        refreshSession();
        showAvatar();
        photoMsg("Your photo was removed.", "success");
      } catch (err) {
        photoMsg(err.message, "danger");
      }
    });

    fillForm();
    // A brand-new account made with "Sign in with Google" still needs a phone number and an address
    if (new URLSearchParams(location.search).get("welcome")) {
      photoMsg("Welcome to Druk Serve! Please add your phone number and address, then press Save.", "info");
    }
    // Providers do not have a home address; customers do
    $("addressBox").classList.toggle("d-none", me.role !== "customer");

    $("profileForm").addEventListener("submit", async e => {
      e.preventDefault();
      let ok = true;
      function check(id, valid) { $(id).classList.toggle("is-invalid", !valid); if (!valid) ok = false; }
      check("pName", $("pName").value.trim().length >= 3);
      check("pPhone", /^(\+975)?[0-9]{8}$/.test($("pPhone").value.trim()));
      if (me.role === "customer") check("pAddress", $("pAddress").value.trim().length >= 5);
      if (!ok) return;

      try {
        // PUT /api/profile
        me = await API.put("/profile", {
          name: $("pName").value.trim(),
          phone: $("pPhone").value.trim(),
          location: $("pLocation").value,
          address: $("pAddress").value.trim()
        });
        DS.login(me);                                                  // refresh the saved session (name may have changed)
        refreshSession();                                              // refresh the name and picture in the top menu
        fillForm();
        $("profileAlert").innerHTML = '<div class="alert alert-success py-2">Your profile was updated.</div>';
      } catch (err) {
        $("profileAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
    });

    /* ----- change password ----- */
    const strongPw = pw => pw.length >= 8 && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);

    $("showPw").addEventListener("change", () => {
      ["curPw", "newPw", "confPw"].forEach(id => { $(id).type = $("showPw").checked ? "text" : "password"; });
    });

    $("passwordForm").addEventListener("submit", async e => {
      e.preventDefault();
      let ok = true;
      function check(id, valid) { $(id).classList.toggle("is-invalid", !valid); if (!valid) ok = false; }

      const newPw = $("newPw").value;
      check("curPw", $("curPw").value !== "");
      $("newPwMsg").textContent = "Use at least 8 characters, one number and one symbol.";
      check("newPw", strongPw(newPw));
      check("confPw", $("confPw").value === newPw && newPw !== "");
      if (!ok) return;

      try {
        // PUT /api/profile/password : the server checks the current password against password_hash
        await API.put("/profile/password", { currentPassword: $("curPw").value, newPassword: newPw });
        $("passwordForm").reset();
        ["curPw", "newPw", "confPw"].forEach(id => { $(id).type = "password"; });
        $("passwordAlert").innerHTML = '<div class="alert alert-success py-2">Password changed successfully.</div>';
      } catch (err) {
        const f = err.fields || {};
        if (f.currentPassword) check("curPw", false);
        if (f.newPassword) { $("newPwMsg").textContent = f.newPassword; check("newPw", false); }
        $("passwordAlert").innerHTML = `<div class="alert alert-danger py-2">${DS.esc(err.message)}</div>`;
      }
    });
  }
})();