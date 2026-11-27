/* ===== Landing page (index.html) - connected to the backend =====
   Anyone can see this page, so it only uses the public API addresses (no login needed). */

(async function () {
  const select = document.getElementById("searchService");

  // Service cards  (GET /api/categories): all services by default, filtered while the customer types.
  // A card opens the results page for that service: service.html?name=Plumbing
  const grid = document.getElementById("serviceGrid");
  const searchBox = document.getElementById("serviceSearch");
  let services = [];

  const serviceCard = s => `
    <div class="col-6 col-md-4 col-lg-3">
      <a class="service-card" href="${DS.base}service.html?name=${encodeURIComponent(s.name)}">
        <span class="icon-circle"><i class="bi ${DS.esc(s.icon)}"></i></span>
        <h3>${DS.esc(s.name)}</h3>
        <p>${DS.esc(s.desc)}</p>
      </a>
    </div>`;

  function showServices() {
    const typed = searchBox ? searchBox.value.trim() : "";
    const q = typed.toLowerCase();
    let shown = services;                                   // nothing typed: all services
    if (q) {
      const byName = services.filter(s => s.name.toLowerCase().includes(q));
      shown = byName.length ? byName : services.filter(s => (s.desc || "").toLowerCase().includes(q));
    }
    grid.innerHTML = shown.length ? shown.map(serviceCard).join("")
      : `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-search"></i>No service matches "${DS.esc(typed)}".<br>Try another name.</div></div>`;
  }

  try {
    services = await API.get("/categories");
    showServices();
    services.forEach(s => select.insertAdjacentHTML("beforeend", `<option value="${DS.esc(s.name)}">${DS.esc(s.name)}</option>`));
  } catch (err) {
    grid.innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }
  if (searchBox) searchBox.addEventListener("input", showServices);

  // Top rated providers (the server only sends verified ones, best 4)  (GET /api/providers)
  try {
    const best = await API.get("/providers", { sort: "rating", limit: 4 });
    document.getElementById("topProviders").innerHTML = best.map(p => DS.providerCard(p)).join("");
  } catch (err) {
    document.getElementById("topProviders").innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }

  // Search button (the dropdown at the top): open the results page of the chosen service,
  // or, when "All services" is chosen, jump down to the list of services.
  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    if (select.value) {
      location.href = DS.base + "service.html?name=" + encodeURIComponent(select.value);
    } else {
      document.getElementById("services").scrollIntoView({ behavior: "smooth" });
      if (searchBox) searchBox.focus();
    }
  });
})();