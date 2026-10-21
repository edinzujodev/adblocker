"use strict";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5000;
let refreshTimer = null;
let currentTab = "home";

// --- API ---

class AuthError extends Error {}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401 && path !== "/api/login") throw new AuthError();
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function handleError(err) {
  if (err instanceof AuthError) return showLogin();
  toast(err.message || "Something went wrong");
}

// --- Views ---

function showLogin() {
  stopRefresh();
  $("app-view").hidden = true;
  $("login-view").hidden = false;
  $("password").value = "";
  $("password").focus();
}

function showApp() {
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  switchTab(currentTab);
}

function switchTab(name) {
  currentTab = name;
  if (name === "home") loadThisComputer().catch(handleError);
  for (const btn of document.querySelectorAll(".tabbar button")) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
  for (const sec of document.querySelectorAll(".tab")) {
    sec.hidden = sec.id !== `tab-${name}`;
  }
  refresh();
  startRefresh();
}

function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(() => {
    if (!document.hidden) refresh();
  }, REFRESH_MS);
}

function stopRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

async function refresh() {
  try {
    if (currentTab === "home") await loadStatus();
    if (currentTab === "activity") await loadActivity();
    if (currentTab === "lists") await loadLists();
  } catch (err) {
    handleError(err);
  }
}

// --- Home ---

function renderPower(enabled) {
  $("power").checked = enabled;
  $("power-card").classList.toggle("on", enabled);
  $("power-card").classList.toggle("off", !enabled);
  $("power-title").textContent = enabled ? "Blocking is on" : "Blocking is off";
  $("power-sub").textContent = enabled
    ? "Ads and trackers are being blocked."
    : "Everything is allowed through.";
}

async function loadStatus() {
  const s = await api("GET", "/api/status");
  renderPower(s.enabled);
  $("stat-total").textContent = fmt(s.totalQueries);
  $("stat-blocked").textContent = fmt(s.blockedQueries);
  $("stat-percent").textContent = s.totalQueries
    ? `${((100 * s.blockedQueries) / s.totalQueries).toFixed(1)}%`
    : "0%";
  $("stat-list").textContent = fmt(s.blocklistSize + s.customCount);
}

$("power").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  e.target.disabled = true;
  try {
    await api("POST", "/api/enabled", { enabled });
    renderPower(enabled);
    toast(enabled ? "Blocking turned on" : "Blocking turned off");
    if (!$("check-result").hidden) recheck();
  } catch (err) {
    e.target.checked = !enabled;
    handleError(err);
  } finally {
    e.target.disabled = false;
  }
});

// "Protect this computer" changes the DNS settings of the computer running
// the adblocker. Reading them starts PowerShell, so it is not polled.
async function loadThisComputer() {
  const s = await api("GET", "/api/this-computer");
  $("pc-card").hidden = !s.supported;
  if (!s.supported) return;
  const sw = $("pc-switch");
  sw.checked = s.enabled;
  sw.disabled = !s.admin || s.adapters.length === 0;
  $("pc-title").textContent = `Protect this computer (${s.computer})`;
  const servers = s.adapters.flatMap((a) => a.servers);
  const backup = servers.find((ip) => ip !== servers[0]);
  $("pc-sub").textContent = s.enabled
    ? `This computer is protected by EasioProtect.${backup ? ` If EasioProtect stops, it uses ${backup} so the internet keeps working.` : ""}`
    : `This computer uses ${servers[0] || "automatic DNS"}, not EasioProtect.`;
  $("pc-message").hidden = !s.message;
  $("pc-message").textContent = s.message || "";
}

$("pc-switch").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  e.target.disabled = true;
  try {
    await api("POST", "/api/this-computer", { enabled });
    toast(enabled ? "This computer is now protected" : "This computer is back to normal DNS");
  } catch (err) {
    handleError(err);
  }
  await loadThisComputer().catch(handleError);
});

const reasonText = {
  custom: "Blocked by your own list",
  blocklist: "Blocked by the ad/tracker blocklist",
  allowlist: "Allowed — it is on your always-allowed list",
  disabled: "Would be blocked, but blocking is switched off",
  "not-listed": "Allowed — not on any blocklist",
};

$("check-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = $("check-input").value.trim();
  if (!domain) return;
  try {
    const r = await api("GET", `/api/check?domain=${encodeURIComponent(domain)}`);
    renderCheck(r);
  } catch (err) {
    handleError(err);
  }
});

function renderCheck(r) {
  const box = $("check-result");
  box.replaceChildren();
  box.hidden = false;
  box.className = `check-result ${r.blocked ? "blocked" : "allowed"}`;

  const text = el("div");
  text.append(el("strong", r.blocked ? `${r.domain} is blocked` : `${r.domain} is allowed`));
  let detail = reasonText[r.reason] || r.reason;
  if (r.rule && r.rule !== r.domain) detail += ` (matches ${r.rule})`;
  text.append(el("span", detail, "muted"));
  box.append(text);

  // Offer the action that flips the result.
  const actions = el("div", null, "row");
  if (r.reason === "custom") {
    actions.append(button(`Unblock ${r.rule}`, "outline", () => removeFrom("custom", r.rule, recheck)));
  } else if (r.reason === "blocklist" || r.reason === "disabled") {
    actions.append(button(`Always allow ${r.domain}`, "outline", () => addTo("allowlist", r.domain, recheck)));
  } else if (r.reason === "allowlist") {
    actions.append(button(`Stop allowing ${r.rule}`, "outline", () => removeFrom("allowlist", r.rule, recheck)));
  } else {
    actions.append(button(`Block ${r.domain}`, "danger", () => addTo("custom", r.domain, recheck)));
  }
  box.append(actions);
}

function recheck() {
  $("check-form").requestSubmit();
}

// --- Activity ---

async function loadActivity() {
  const [recent, top] = await Promise.all([
    api("GET", "/api/queries?blocked=true&limit=500"),
    api("GET", "/api/top-blocked"),
  ]);

  // A page load asks for the same domain several times (A + AAAA, retries),
  // so show each domain once with its latest time.
  const seen = new Map();
  for (const q of recent) {
    const item = seen.get(q.domain);
    if (item) item.count++;
    else seen.set(q.domain, { ...q, count: 1 });
  }
  const rows = [...seen.values()].slice(0, 50).map((q) => {
    const info = el("div");
    info.append(el("div", q.domain, "domain"));
    info.append(el("div", `${timeAgo(q.time)} · ${q.client}${q.count > 1 ? ` · ${q.count}×` : ""}`, "meta"));
    return li(info, button("Allow", "outline small", () => addTo("allowlist", q.domain, loadActivity)));
  });
  fillList($("recent"), rows, "Nothing blocked yet. Browse a site with ads and check back.");

  fillList(
    $("top"),
    top.map((d) => li(el("span", d.domain, "domain"), el("span", fmt(d.count), "count"))),
    "Nothing blocked yet."
  );
}

// --- Lists ---

async function loadLists() {
  const [custom, allow] = await Promise.all([
    api("GET", "/api/custom"),
    api("GET", "/api/allowlist"),
  ]);
  fillList(
    $("custom"),
    custom.map((d) => li(el("span", d, "domain"), button("Remove", "danger small", () => removeFrom("custom", d, loadLists)))),
    "You haven't blocked any sites yourself."
  );
  fillList(
    $("allow"),
    allow.map((d) => li(el("span", d, "domain"), button("Remove", "danger small", () => removeFrom("allowlist", d, loadLists)))),
    "No always-allowed sites."
  );
}

for (const [form, input, list] of [
  ["custom-form", "custom-input", "custom"],
  ["allow-form", "allow-input", "allowlist"],
]) {
  $(form).addEventListener("submit", async (e) => {
    e.preventDefault();
    const domain = $(input).value.trim();
    if (!domain) return;
    await addTo(list, domain, () => {
      $(input).value = "";
      return loadLists();
    });
  });
}

async function addTo(list, domain, then) {
  try {
    await api("POST", `/api/${list}`, { domain });
    toast(list === "custom" ? `Blocked ${domain}` : `${domain} is always allowed`);
    if (then) await then();
  } catch (err) {
    handleError(err);
  }
}

async function removeFrom(list, domain, then) {
  try {
    await api("DELETE", `/api/${list}/${encodeURIComponent(domain)}`);
    toast(list === "custom" ? `Unblocked ${domain}` : `${domain} removed from allowed`);
    if (then) await then();
  } catch (err) {
    handleError(err);
  }
}

// --- Login / logout ---

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  $("login-error").textContent = "";
  try {
    await api("POST", "/api/login", { password: $("password").value });
    showApp();
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  await api("POST", "/api/logout").catch(() => {});
  showLogin();
});

for (const btn of document.querySelectorAll(".tabbar button")) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !$("app-view").hidden) refresh();
});

// --- Helpers ---

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function button(label, kind, onClick) {
  const b = el("button", label, `btn ${kind}`);
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await onClick();
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function li(...children) {
  const item = el("li");
  item.append(...children);
  return item;
}

function fillList(ul, items, emptyText) {
  ul.replaceChildren(...(items.length ? items : [li(el("span", emptyText))]));
  if (!items.length) ul.firstChild.classList.add("empty");
}

function fmt(n) {
  return Number(n).toLocaleString();
}

function timeAgo(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

// --- Start: if the session cookie is still valid, skip the login screen. ---

api("GET", "/api/status")
  .then(showApp)
  .catch((err) => (err instanceof AuthError ? showLogin() : handleError(err)));
