/* ===== Landing page (index.html) - connected to the backend =====
   Anyone can see this page, so it only uses the public API addresses (no login needed). */

(async function () {
  // Service cards  (GET /api/categories): all services by default, filtered while the customer types.
  // A card opens the results page for that service: service.html?name=Plumbing
  const grid = document.getElementById("serviceGrid");
  const picker = document.getElementById("searchService");        // the ONE search bar: the "All services" dropdown
  let services = [];

  const serviceCard = s => `
    <div class="col-6 col-md-4 col-lg-3">
      <a class="service-card" href="${DS.base}service.html?name=${encodeURIComponent(s.name)}">
        <span class="icon-circle"><i class="bi ${DS.esc(s.icon)}"></i></span>
        <h3>${DS.esc(s.name)}</h3>
        <p>${DS.esc(s.desc)}</p>
      </a>
    </div>`;

  // Show every service when "All services" is chosen, otherwise only the chosen one.
  function showServices() {
    const chosen = picker.value;
    const shown = chosen ? services.filter(s => s.name === chosen) : services;
    grid.innerHTML = shown.length ? shown.map(serviceCard).join("")
      : `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-search"></i>No service found.</div></div>`;
  }

  try {
    services = await API.get("/categories");
    services.forEach(s => picker.insertAdjacentHTML("beforeend", `<option value="${DS.esc(s.name)}">${DS.esc(s.name)}</option>`));
    showServices();
  } catch (err) {
    grid.innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }
  picker.addEventListener("change", showServices);                 // choosing a service filters the cards below

  // Top rated providers (the server only sends verified ones, best 4)  (GET /api/providers)
  try {
    const best = await API.get("/providers", { sort: "rating", limit: 4 });
    document.getElementById("topProviders").innerHTML = best.map(p => DS.providerCard(p)).join("");
  } catch (err) {
    document.getElementById("topProviders").innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }

  // Search button: show the matching card(s) and take the customer down to them.
  // Clicking a card then opens the available providers (service.html?name=...).
  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    showServices();
    document.getElementById("services").scrollIntoView({ behavior: "smooth" });
  });
})();