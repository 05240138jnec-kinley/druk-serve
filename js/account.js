/* ===== Feedback, Notifications and My Profile =====
   Used by: customer/feedback.html, customer/notifications.html, customer/profile.html
   (the provider versions of notifications and profile reuse this file in Step 5).
   Each part only runs if its page is open (it looks for a special id). */

(function () {
  if (!DS.requireRole(["customer", "provider"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  function showMessage(wrapId, icon, text, linkText, linkHref) {
    $(wrapId).innerHTML = `<div class="card-ds empty-state"><i class="bi ${icon}"></i>${text}<br>
      <a href="${linkHref}" class="btn btn-primary mt-3">${linkText}</a></div>`;
  }

  /* ================= FEEDBACK PAGE (customers only) ================= */
  if ($("feedbackWrap")) {
    if (user.role !== "customer") { location.href = DS.base + "login.html"; return; }

    // BACKEND: later GET /api/bookings/:id
    const booking = DS.get("bookings", []).find(b => b.id === Number(params.get("booking")) && b.customerId === user.id);
    if (!booking) {
      showMessage("feedbackWrap", "bi-receipt", "Booking not found.", "My Bookings", "my-bookings.html");
      return;
    }
    if (booking.status !== "Completed") {
      showMessage("feedbackWrap", "bi-hourglass-split", "You can only rate a booking after it is completed.", "My Bookings", "my-bookings.html");
      return;
    }
    if (DS.get("feedback", []).some(f => f.bookingId === booking.id)) {
      showMessage("feedbackWrap", "bi-check-circle", "You have already rated this booking. Thank you!", "My Bookings", "my-bookings.html");
      return;
    }

    const provider = DS.get("providers", []).find(p => p.id === booking.providerId);
    $("fbService").textContent = booking.service + " by " + (provider ? provider.name : "your provider");

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

    $("submitRating").addEventListener("click", () => {
      if (!rating) { $("starError").classList.remove("d-none"); return; }

      // BACKEND: replace with POST /api/feedback  { bookingId, rating, comment }
      // The server also recalculates the provider's average rating.
      const list = DS.get("feedback", []);
      list.push({
        id: DS.nextId(list), bookingId: booking.id, customerId: user.id, providerId: booking.providerId,
        rating: rating, comment: $("comment").value.trim(), date: DS.todayISO()
      });
      DS.set("feedback", list);

      const providers = DS.get("providers", []);
      const p = providers.find(x => x.id === booking.providerId);
      if (p) {
        p.rating = Math.round(((p.rating * p.reviews + rating) / (p.reviews + 1)) * 10) / 10;
        p.reviews += 1;
        DS.set("providers", providers);
      }
      DS.notify("provider", "bi-star-fill", "New Feedback", "A customer gave you " + rating + (rating > 1 ? " stars." : " star."));

      location.href = "my-bookings.html?msg=" + encodeURIComponent("Thank you for your feedback!");
    });
  }

  /* ================= NOTIFICATIONS PAGE ================= */
  if ($("notifList")) {
    // BACKEND: later notifications arrive from Firebase and belong to ONE user.
    // Here they are shared by everyone with the same role, which is fine for a demo.
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));

    function changeMine(fn) {
      const all = DS.get("notifications", []);
      DS.set("notifications", fn(all));
      render();
      DS.renderNavbar();   // refresh the red number in the top menu
    }

    function render() {
      const mine = DS.get("notifications", []).filter(n => n.role === user.role);
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
    }

    // Click a notification to mark it as read
    $("notifList").addEventListener("click", e => {
      const item = e.target.closest(".notif");
      if (!item) return;
      changeMine(all => all.map(n => n.id === Number(item.dataset.id) ? { ...n, read: true } : n));
    });

    $("markAll").addEventListener("click", () =>
      changeMine(all => all.map(n => n.role === user.role ? { ...n, read: true } : n)));
    $("clearAll").addEventListener("click", () => modal("clearModal").show());
    $("confirmClear").addEventListener("click", () => {
      changeMine(all => all.filter(n => n.role !== user.role));
      modal("clearModal").hide();
    });

    render();
  }

  /* ================= MY PROFILE PAGE ================= */
  if ($("profileForm")) {
    const users = DS.get("users", []);
    const me = users.find(u => u.id === user.id);
    if (!me) { DS.logout(); return; }

    $("pLocation").innerHTML = LOCATIONS.map(l => `<option>${l}</option>`).join("");
    function fillForm() {
      $("pName").value = me.name;
      $("pEmail").value = me.email;
      $("pPhone").value = me.phone || "";
      $("pLocation").value = me.location || LOCATIONS[0];
      $("pAddress").value = me.address || "";
      $("profName").textContent = me.name;
      $("profRole").textContent = me.role.charAt(0).toUpperCase() + me.role.slice(1);
      $("profAvatar").textContent = DS.initials(me.name);
      $("profAvatar").style.background = DS.color(me.id);
    }
    fillForm();
    // Providers do not have a home address; customers do
    $("addressBox").classList.toggle("d-none", me.role !== "customer");

    $("profileForm").addEventListener("submit", e => {
      e.preventDefault();
      let ok = true;
      function check(id, valid) { $(id).classList.toggle("is-invalid", !valid); if (!valid) ok = false; }
      check("pName", $("pName").value.trim().length >= 3);
      check("pPhone", /^(\+975)?[0-9]{8}$/.test($("pPhone").value.trim()));
      if (me.role === "customer") check("pAddress", $("pAddress").value.trim().length >= 5);
      if (!ok) return;

      // BACKEND: replace with PUT /api/profile
      me.name = $("pName").value.trim();
      me.phone = $("pPhone").value.trim();
      me.location = $("pLocation").value;
      if (me.role === "customer") me.address = $("pAddress").value.trim();
      DS.set("users", users);

      // Keep the provider record in step with the login record
      if (me.providerId) {
        const providers = DS.get("providers", []);
        const p = providers.find(x => x.id === me.providerId);
        if (p) { p.name = me.name; p.phone = me.phone; p.location = me.location; DS.set("providers", providers); }
      }

      DS.login(me);          // refresh the saved session (name may have changed)
      DS.renderNavbar();     // refresh the name in the top menu
      fillForm();
      $("profileAlert").innerHTML = '<div class="alert alert-success py-2">Your profile was updated.</div>';
    });

    /* ----- change password ----- */
    const strongPw = pw => pw.length >= 8 && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);

    $("showPw").addEventListener("change", () => {
      ["curPw", "newPw", "confPw"].forEach(id => { $(id).type = $("showPw").checked ? "text" : "password"; });
    });

    $("passwordForm").addEventListener("submit", e => {
      e.preventDefault();
      let ok = true;
      function check(id, valid) { $(id).classList.toggle("is-invalid", !valid); if (!valid) ok = false; }

      // BACKEND: the server checks the current password against password_hash
      check("curPw", $("curPw").value === me.password);

      const newPw = $("newPw").value;
      const different = newPw !== me.password;
      $("newPwMsg").textContent = !strongPw(newPw)
        ? "Use at least 8 characters, one number and one symbol."
        : "New password must be different from your old password.";
      check("newPw", strongPw(newPw) && different);
      check("confPw", $("confPw").value === newPw && newPw !== "");
      if (!ok) return;

      me.password = newPw;
      DS.set("users", users);
      $("passwordForm").reset();
      ["curPw", "newPw", "confPw"].forEach(id => { $(id).type = "password"; });
      $("passwordAlert").innerHTML = '<div class="alert alert-success py-2">Password changed successfully.</div>';
    });
  }
})();
