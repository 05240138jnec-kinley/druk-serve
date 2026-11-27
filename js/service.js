/* ===== Service results page (service.html?name=Plumbing) =====
   Shows the service name as the heading and, below it, the providers who offer that service and are available.
   Open to everyone: no login is needed. Login is only asked when "Book" is pressed (the booking page checks it). */

(async function () {
  const $ = id => document.getElementById(id);
  const name = (new URLSearchParams(location.search).get("name") || "").trim();
  const list = $("serviceProviders");

  const message = (icon, html) =>
    `<div class="col-12"><div class="card-ds empty-state"><i class="bi ${icon}"></i>${html}</div></div>`;

  if (!name) {
    $("serviceTitle").textContent = "Services";
    list.innerHTML = message("bi-grid", `Please choose a service first.<br><a href="index.html#services" class="btn btn-primary mt-3">See all services</a>`);
    return;
  }

  $("serviceTitle").textContent = name;                 // the heading: "Plumbing"
  document.title = name + " - Druk Serve";

  function card(p) {
    const sch = DS.schedule(p);
    return `<div class="col-md-6 col-lg-4"><div class="provider-card h-100">
      <div class="d-flex align-items-center gap-3 mb-3">
        ${DS.avatar(p)}
        <div>
          <h2 class="h6 mb-0">${DS.esc(p.name)} ${p.verified ? '<i class="bi bi-patch-check-fill text-primary" title="Verified"></i>' : ""}</h2>
          <small class="text-muted">${DS.esc(p.category)}</small>
        </div>
      </div>
      <div class="mb-2">${DS.stars(p.rating)} <small class="text-muted">${p.rating.toFixed(1)} (${p.reviews})</small></div>
      <div class="small text-muted mb-1"><i class="bi bi-geo-alt me-1"></i>${DS.esc(p.location)}</div>
      <div class="small text-success mb-3"><i class="bi bi-check-circle me-1"></i>Available &middot; ${DS.daysText(sch.days)}, ${DS.niceTime(sch.from)} to ${DS.niceTime(sch.to)}</div>
      <div class="d-grid">
        <a href="${DS.base}customer/booking.html?provider=${p.id}" class="btn btn-sm btn-primary">Book</a>
      </div></div></div>`;
  }

  list.innerHTML = message("bi-hourglass-split", "Loading providers...");
  try {
    // GET /api/providers?service=Plumbing  (the server only sends verified, available, not suspended providers of that service)
    const all = await API.get("/providers", { service: name, sort: "rating" });
    const providers = all.filter(p => p.category === name && DS.schedule(p).available);
    $("serviceCount").textContent = providers.length + (providers.length === 1 ? " provider available" : " providers available");
    list.innerHTML = providers.length ? providers.map(card).join("")
      : message("bi-search", `No ${DS.esc(name)} providers are available right now.<br><a href="index.html#services" class="btn btn-primary mt-3">Choose another service</a>`);
  } catch (err) {
    list.innerHTML = message("bi-wifi-off", DS.esc(err.message));
  }
})();