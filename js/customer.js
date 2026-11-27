/* ===== Customer pages (connected to the backend) =====
   Used by: home.html, providers.html, provider-profile.html (and more pages in later steps).
   Each part below only runs if its page is open (it looks for a special id). */

(async function () {
  const user = DS.user();                 // null when nobody is logged in (a visitor)
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // The customer HOME page is for logged-in customers only.
  // The providers list and a provider's profile are OPEN to everyone: visitors can search and look
  // without logging in. Login is only asked when they press "Book Now" (the booking page checks it).
  if ($("welcome") && !DS.requireRole(["customer"])) return;

  const errorBox = message => `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>
    ${DS.esc(message)}</div></div>`;

  /* ================= HOME PAGE ================= */
  if ($("welcome")) {
    $("welcome").innerHTML = DS.avatar(user, "me-2", "width:44px;height:44px;font-size:1rem;display:inline-grid;vertical-align:middle") +
      " Welcome, " + DS.esc(user.name.split(" ")[0]);

    // Service tiles + search dropdown  (GET /api/categories)
    try {
      const services = await API.get("/categories");
      $("serviceGrid").innerHTML = services.map(s => `
        <div class="col-6 col-md-4 col-lg-3">
          <a class="service-card" href="providers.html?service=${encodeURIComponent(s.name)}">
            <span class="icon-circle"><i class="bi ${s.icon}"></i></span>
            <h3>${DS.esc(s.name)}</h3><p>${DS.esc(s.desc)}</p>
          </a>
        </div>`).join("");
      services.forEach(s => $("searchService").insertAdjacentHTML("beforeend", `<option>${DS.esc(s.name)}</option>`));
    } catch (err) {
      $("serviceGrid").innerHTML = errorBox(err.message);
    }

    $("searchForm").addEventListener("submit", e => {
      e.preventDefault();
      const p = new URLSearchParams();
      if ($("searchText").value.trim()) p.set("q", $("searchText").value.trim());
      if ($("searchService").value) p.set("service", $("searchService").value);
      location.href = "providers.html?" + p.toString();
    });

    // Upcoming bookings (Pending or Confirmed)  (GET /api/bookings)
    try {
      const all = await API.get("/bookings", { status: "Pending,Confirmed" });
      const upcoming = all.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

      $("upcoming").innerHTML = upcoming.length ? upcoming.map(b => `<div class="col-md-6 col-lg-4"><div class="card-ds h-100">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <strong>${DS.esc(b.service)}</strong>
          <span class="badge-status st-${b.status}">${b.status}</span>
        </div>
        <div class="small text-muted"><i class="bi bi-person me-1"></i>${DS.esc(b.providerName || "Provider")}</div>
        <div class="small text-muted"><i class="bi bi-calendar me-1"></i>${b.date} at ${b.time}</div>
        <div class="small text-muted"><i class="bi bi-geo-alt me-1"></i>${DS.esc(b.address)}</div>
      </div></div>`).join("") : `<div class="col-12"><div class="card-ds empty-state">
        <i class="bi bi-calendar-x"></i>You have no upcoming bookings yet.<br>
        <a href="providers.html" class="btn btn-primary mt-3">Find a service</a></div></div>`;
    } catch (err) {
      $("upcoming").innerHTML = errorBox(err.message);
    }

    // Top providers  (GET /api/providers?sort=rating&limit=4)
    try {
      const top = await API.get("/providers", { sort: "rating", limit: 4 });
      $("topProviders").innerHTML = top.map(p => DS.providerCard(p)).join("");
    } catch (err) {
      $("topProviders").innerHTML = errorBox(err.message);
    }
  }

  /* ================= PROVIDERS LIST PAGE ================= */
  if ($("providerList")) {
    // Fill dropdowns
    try {
      const services = await API.get("/categories");
      services.forEach(s => $("fService").insertAdjacentHTML("beforeend", `<option>${DS.esc(s.name)}</option>`));
    } catch (err) { /* the list below will show the error */ }
    LOCATIONS.forEach(l => $("fLocation").insertAdjacentHTML("beforeend", `<option>${l}</option>`));

    // Start with any search words sent from the home page
    $("fQ").value = params.get("q") || "";
    $("fService").value = params.get("service") || "";

    let latest = 0;   // so an old slow answer never replaces a newer one
    async function showProviders() {
      const mine = ++latest;
      let list;
      try {
        // The server filters and sorts: GET /api/providers?q=&service=&location=&maxPrice=&minRating=&sort=
        list = await API.get("/providers", {
          q: $("fQ").value.trim(),
          service: $("fService").value,
          location: $("fLocation").value,
          maxPrice: Number($("fPrice").value) || "",
          minRating: Number($("fRating").value) || "",
          sort: $("fSort").value
        });
      } catch (err) {
        if (mine === latest) { $("resultCount").textContent = ""; $("providerList").innerHTML = errorBox(err.message); }
        return;
      }
      if (mine !== latest) return;

      $("resultCount").textContent = list.length + (list.length === 1 ? " provider found" : " providers found");
      $("providerList").innerHTML = list.length
        ? list.map(p => DS.providerCard(p, "col-md-6 col-xl-4")).join("")
        : `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-search"></i>
             No providers match your filters.<br>Try changing or resetting the filters.</div></div>`;
    }

    let timer;
    $("fQ").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(showProviders, 300); });
    ["fService", "fLocation", "fPrice", "fRating", "fSort"].forEach(id => $(id).addEventListener("change", showProviders));
    $("resetBtn").addEventListener("click", () => {
      $("fQ").value = ""; $("fService").value = ""; $("fLocation").value = "";
      $("fPrice").value = "0"; $("fRating").value = "0"; $("fSort").value = "rating";
      showProviders();
    });
    showProviders();
  }

  /* ================= PROVIDER PROFILE PAGE ================= */
  if ($("profileBox")) {
    let p = null;
    try {
      p = await API.get("/providers/" + encodeURIComponent(params.get("id")));   // GET /api/providers/:id
    } catch (err) { /* not found: handled below */ }

    if (!p) {
      $("profileBox").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-person-x"></i>
        Provider not found.<br><a href="providers.html" class="btn btn-primary mt-3">Back to providers</a></div>`;
    } else {
      const reviews = p.reviewList || [];

      const reviewHtml = reviews.length ? reviews.map(r => `<div class="review">
          <div class="d-flex justify-content-between">
            <strong>${DS.esc(r.customerName || "Customer")}</strong><small class="text-muted">${r.date}</small>
          </div>
          <div>${DS.stars(r.rating)}</div>
          <p class="mb-0 mt-1">${DS.esc(r.comment || "")}</p>
          ${r.reply ? `<div class="reply-box"><small class="text-muted">Reply from ${DS.esc(p.name)}</small><div>${DS.esc(r.reply)}</div></div>` : ""}</div>`
      ).join("") : `<p class="text-muted mb-0">No reviews yet.</p>`;

      const sch = DS.schedule(p);
      const bookBtn = !p.verified
        ? `<button class="btn btn-secondary w-100 py-2" disabled>Not yet verified</button>`
        : !sch.available
          ? `<button class="btn btn-secondary w-100 py-2" disabled>Currently unavailable</button>`
          : `<a href="booking.html?provider=${p.id}" class="btn btn-accent w-100 py-2"><i class="bi bi-calendar-plus me-1"></i>Book Now</a>`;

      $("profileBox").innerHTML = `<div class="row g-4">
        <div class="col-lg-8">
          <div class="card-ds mb-4">
            <div class="d-flex flex-wrap align-items-center gap-3">
              ${DS.avatar(p, "profile-avatar")}
              <div>
                <h1 class="h3 fw-bold mb-1">${DS.esc(p.name)}
                  ${p.verified ? '<i class="bi bi-patch-check-fill text-primary fs-5" title="Verified"></i>' : ""}</h1>
                <div class="text-muted mb-1">${DS.esc(p.category)} &middot; ${DS.esc(p.location)}</div>
                <div>${DS.stars(p.rating)} <span class="text-muted small">${p.rating.toFixed(1)} (${p.reviews} reviews)</span></div>
              </div>
            </div>
          </div>

          <div class="card-ds mb-4">
            <h2 class="h5 fw-bold mb-3">About</h2>
            <p class="mb-2">${DS.esc(p.bio || "No description added yet.")}</p>
            <p class="small text-muted mb-3"><i class="bi bi-clock me-1"></i>${sch.available ? "Works " + DS.daysText(sch.days) + ", " + DS.niceTime(sch.from) + " to " + DS.niceTime(sch.to) : "Not accepting new bookings right now"}</p>
            <div class="row g-3">
              <div class="col-6 col-md-3"><div class="info-tile"><small>Experience</small><strong>${p.experience} years</strong></div></div>
              <div class="col-6 col-md-3"><div class="info-tile"><small>Price</small><strong>Nu. ${p.rate}/hr</strong></div></div>
              <div class="col-6 col-md-3"><div class="info-tile"><small>Service area</small><strong>${DS.esc(p.location)}</strong></div></div>
              <div class="col-6 col-md-3"><div class="info-tile"><small>Status</small><strong>${p.verified ? "Verified" : "Pending verification"}</strong></div></div>
            </div>
          </div>

          <div class="card-ds">
            <h2 class="h5 fw-bold mb-2">Customer Reviews</h2>
            ${reviewHtml}
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card-ds sticky-side">
            <div class="text-muted small">Starting price</div>
            <div class="fs-3 fw-bold mb-3">Nu. ${p.rate}<small class="fs-6 text-muted fw-normal">/hour</small></div>
            ${bookBtn}
            ${user ? "" : '<div class="small text-muted text-center mt-2">You will be asked to log in before booking.</div>'}
            <hr>
            <div class="small text-muted"><i class="bi bi-shield-check me-1"></i>Verified by Druk Serve admin</div>
            <div class="small text-muted"><i class="bi bi-credit-card me-1"></i>Pay online or cash on service</div>
          </div>
        </div>
      </div>`;
      document.title = p.name + " - Druk Serve";
    }
  }
})();
