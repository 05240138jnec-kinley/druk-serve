/* ===== Landing page (index.html) - connected to the backend =====
   Anyone can see this page, so it only uses the public API addresses (no login needed). */

(async function () {
  const select = document.getElementById("searchService");

  // Service category cards + search dropdown  (GET /api/categories)
  try {
    const services = await API.get("/categories");
    document.getElementById("serviceGrid").innerHTML = services.map(s => `
      <div class="col-6 col-md-4 col-lg-3">
        <a class="service-card" href="${DS.base}customer/providers.html?service=${encodeURIComponent(s.name)}">
          <span class="icon-circle"><i class="bi ${DS.esc(s.icon)}"></i></span>
          <h3>${DS.esc(s.name)}</h3>
          <p>${DS.esc(s.desc)}</p>
        </a>
      </div>`).join("");
    services.forEach(s => select.insertAdjacentHTML("beforeend", `<option value="${DS.esc(s.name)}">${DS.esc(s.name)}</option>`));
  } catch (err) {
    document.getElementById("serviceGrid").innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }

  // Top rated providers (the server only sends verified ones, best 4)  (GET /api/providers)
  try {
    const best = await API.get("/providers", { sort: "rating", limit: 4 });
    document.getElementById("topProviders").innerHTML = best.map(p => DS.providerCard(p)).join("");
  } catch (err) {
    document.getElementById("topProviders").innerHTML =
      `<div class="col-12"><div class="card-ds empty-state"><i class="bi bi-wifi-off"></i>${DS.esc(err.message)}</div></div>`;
  }

  // Search button: go to the providers page with the search words
  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchText").value.trim();
    const service = select.value;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (service) params.set("service", service);
    location.href = DS.base + "customer/providers.html?" + params.toString();
  });
})();