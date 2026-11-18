/* Druk Serve - frontend connector.
   Copy this file to  druk-serve/js/api.js  and load it BEFORE the other scripts:
       <script src="js/api.js"></script>
   Then replace the localStorage calls (the "// BACKEND:" comments) with API.get / API.post / API.put / API.del.

   Example (login, js/auth.js):
       const { token, user } = await API.post("/login", { email, password, role });
       API.saveSession(token, user);

   Example (provider list):
       const providers = await API.get("/providers", { service: "Plumbing", sort: "rating" });
*/
const API = (() => {
  const BASE = "http://localhost:5000/api";   // change when the backend is hosted
  const TOKEN_KEY = "ds_token";
  const USER_KEY = "ds_user";

  async function request(method, path, { query, body } = {}) {
    const url = new URL(BASE + path);
    Object.entries(query || {}).forEach(([k, v]) => { if (v !== "" && v != null) url.searchParams.set(k, v); });

    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;

    let res;
    try {
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw Object.assign(new Error("Cannot reach the server. Is the backend running?"), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && token && path !== "/login") {      // login expired or account suspended
      API.clearSession();
      location.href = location.pathname.includes("/customer/") || location.pathname.includes("/provider/") || location.pathname.includes("/admin/")
        ? "../login.html" : "login.html";
    }
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, fields: data.fields || {} });
    return data;
  }

  return {
    get: (path, query) => request("GET", path, { query }),
    post: (path, body) => request("POST", path, { body }),
    put: (path, body) => request("PUT", path, { body }),
    del: path => request("DELETE", path),
    fileUrl: path => (path ? BASE.replace(/\/api$/, "") + path : ""),
    saveSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
    clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
    currentUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } }
  };
})();
