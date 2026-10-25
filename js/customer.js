/* ===== Customer pages =====
   Used by: home.html, providers.html, provider-profile.html (and more pages in later steps).
   Each part below only runs if its page is open (it looks for a special id). */

(function () {
  // Only customers may see these pages. Others are sent to the login page.
  if (!DS.requireRole(["customer"])) return;

  const user = DS.user();
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // BACKEND: later this will be GET /api/providers?verified=true
  // Customers only see providers the admin has verified.
  const verifiedProviders = () => DS.get("providers", []).filter(p => p.verified);

  /* ================= HOME PAGE ================= */
  if ($("welcome")) {
    $("welcome").textContent = "Welcome, " + user.name.split(" ")[0];

    // Service tiles
    $("serviceGrid").innerHTML = SERVICES.map(s => `
      <div class="col-6 col-md-4 col-lg-3">
        <a class="service-card" href="providers.html?service=${encodeURIComponent(s.name)}">
          <span class="icon-circle"><i class="bi ${s.icon}"></i></span>
          <h3>${s.name}</h3><p>${s.desc}</p>
        </a>
      </div>`).join("");

    // Search form
    SERVICES.forEach(s => $("searchService").insertAdjacentHTML("beforeend", `<option>${s.name}</option>`));
    $("searchForm").addEventListener("submit", e => {
      e.preventDefault();
      const p = new URLSearchParams();
      if ($("searchText").value.trim()) p.set("q", $("searchText").value.trim());
      if ($("searchService").value) p.set("service", $("searchService").value);
      location.href = "providers.html?" + p.toString();
    });

    // Upcoming bookings (Pending or Confirmed), soonest first
    // BACKEND: later GET /api/bookings?customerId=...&status=Pending,Confirmed
    const providers = DS.get("providers", []);
    const upcoming = DS.get("bookings", [])
      .filter(b => b.customerId === user.id && (b.status === "Pending" || b.status === "Confirmed"))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);

    $("upcoming").innerHTML = upcoming.length ? upcoming.map(b => {
      const p = providers.find(x => x.id === b.providerId);
      return `<div class="col-md-6 col-lg-4"><div class="card-ds h-100">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <strong>${DS.esc(b.service)}</strong>
          <span class="badge-status st-${b.status}">${b.status}</span>
        </div>
        <div class="small text-muted"><i class="bi bi-person me-1"></i>${DS.esc(p ? p.name : "Provider")}</div>
        <div class="small text-muted"><i class="bi bi-calendar me-1"></i>${b.date} at ${b.time}</div>
        <div class="small text-muted"><i class="bi bi-geo-alt me-1"></i>${DS.esc(b.address)}</div>
      </div></div>`;
    }).join("") : `<div class="col-12"><div class="card-ds empty-state">
        <i class="bi bi-calendar-x"></i>You have no upcoming bookings yet.<br>
        <a href="providers.html" class="btn btn-primary mt-3">Find a service</a></div></div>`;

    // Top providers
    $("topProviders").innerHTML = verifiedProviders()
      .sort((a, b) => b.rating - a.rating).slice(0, 4)
      .map(p => DS.providerCard(p)).join("");
  }

  /* ================= PROVIDERS LIST PAGE ================= */
  if ($("providerList")) {
    // Fill dropdowns
    SERVICES.forEach(s => $("fService").insertAdjacentHTML("beforeend", `<option>${s.name}</option>`));
    LOCATIONS.forEach(l => $("fLocation").insertAdjacentHTML("beforeend", `<option>${l}</option>`));

    // Start with any search words sent from the home page
    $("fQ").value = params.get("q") || "";
    $("fService").value = params.get("service") || "";

    function showProviders() {
      let list = verifiedProviders();

      // Keyword: matches if ANY word (first 4 letters) appears in the name, category, bio or location
      // so "leaking tap" still finds "Fixes leaks, installs taps".
      const words = $("fQ").value.toLowerCase().split(/\s+/).filter(w => w.length >= 3).map(w => w.slice(0, 4));
      if (words.length) {
        list = list.filter(p => {
          const text = (p.name + " " + p.category + " " + p.bio + " " + p.location).toLowerCase();
          return words.some(w => text.includes(w));
        });
      }
      if ($("fService").value)  list = list.filter(p => p.category === $("fService").value);
      if ($("fLocation").value) list = list.filter(p => p.location === $("fLocation").value);
      if (Number($("fPrice").value))  list = list.filter(p => p.rate <= Number($("fPrice").value));
      if (Number($("fRating").value)) list = list.filter(p => p.rating >= Number($("fRating").value));

      const sorters = {
        rating:     (a, b) => b.rating - a.rating,
        priceLow:   (a, b) => a.rate - b.rate,
        priceHigh:  (a, b) => b.rate - a.rate,
        experience: (a, b) => b.experience - a.experience
      };
      list.sort(sorters[$("fSort").value]);

      $("resultCount").textContent = list.length + (list.length === 1 ? " provider found" : " providers found");
      $("providerList").innerHTML = list.length
        ? list.map(p => DS.providerCard(p, "col-md-6 col-xl-4")).join("")
        : `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-search"></i>
             No providers match your filters.<br>Try changing or resetting the filters.</div></div>`;
    }

    ["fQ", "fService", "fLocation", "fPrice", "fRating", "fSort"].forEach(id => {
      $(id).addEventListener(id === "fQ" ? "input" : "change", showProviders);
    });
    $("resetBtn").addEventListener("click", () => {
      $("fQ").value = ""; $("fService").value = ""; $("fLocation").value = "";
      $("fPrice").value = "0"; $("fRating").value = "0"; $("fSort").value = "rating";
      showProviders();
    });
    showProviders();
  }

  /* ================= PROVIDER PROFILE PAGE ================= */
  if ($("profileBox")) {
    // BACKEND: later GET /api/providers/:id
    const p = DS.get("providers", []).find(x => x.id === Number(params.get("id")));

    if (!p) {
      $("profileBox").innerHTML = `<div class="card-ds empty-state"><i class="bi bi-person-x"></i>
        Provider not found.<br><a href="providers.html" class="btn btn-primary mt-3">Back to providers</a></div>`;
    } else {
      // Reviews for this provider (table: Feedback)
      const users = DS.get("users", []);
      const reviews = DS.get("feedback", []).filter(f => f.providerId === p.id)
        .sort((a, b) => b.date.localeCompare(a.date));

      const reviewHtml = reviews.length ? reviews.map(r => {
        const c = users.find(u => u.id === r.customerId);
        return `<div class="review">
          <div class="d-flex justify-content-between">
            <strong>${DS.esc(c ? c.name : "Customer")}</strong><small class="text-muted">${r.date}</small>
          </div>
          <div>${DS.stars(r.rating)}</div>
          <p class="mb-0 mt-1">${DS.esc(r.comment || "")}</p></div>`;
      }).join("") : `<p class="text-muted mb-0">No reviews yet.</p>`;

      const bookBtn = p.verified
        ? `<a href="booking.html?provider=${p.id}" class="btn btn-accent w-100 py-2"><i class="bi bi-calendar-plus me-1"></i>Book Now</a>`
        : `<button class="btn btn-secondary w-100 py-2" disabled>Not yet verified</button>`;

      $("profileBox").innerHTML = `<div class="row g-4">
        <div class="col-lg-8">
          <div class="card-ds mb-4">
            <div class="d-flex flex-wrap align-items-center gap-3">
              <span class="avatar profile-avatar" style="background:${DS.color(p.id)}">${DS.initials(p.name)}</span>
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
            <p>${DS.esc(p.bio || "No description added yet.")}</p>
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
