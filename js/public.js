/* ===== Landing page (index.html) ===== */

// Service category cards
document.getElementById("serviceGrid").innerHTML = SERVICES.map(s => `
  <div class="col-6 col-md-4 col-lg-3">
    <a class="service-card" href="${DS.base}customer/providers.html?service=${encodeURIComponent(s.name)}">
      <span class="icon-circle"><i class="bi ${s.icon}"></i></span>
      <h3>${s.name}</h3>
      <p>${s.desc}</p>
    </a>
  </div>`).join("");

// Top rated providers (verified only, best 4)
const bestProviders = DS.get("providers", [])
  .filter(p => p.verified)
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 4);
document.getElementById("topProviders").innerHTML = bestProviders.map(p => DS.providerCard(p)).join("");

// Search box: fill the service dropdown
const select = document.getElementById("searchService");
SERVICES.forEach(s => select.insertAdjacentHTML("beforeend", `<option value="${s.name}">${s.name}</option>`));

// Search button: go to the providers page with the search words
// (the providers page is built in Step 2)
document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("searchText").value.trim();
  const service = select.value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (service) params.set("service", service);
  location.href = DS.base + "customer/providers.html?" + params.toString();
});
