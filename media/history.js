const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

let allAlerts = [];
const filters = { text: "", agent: "", type: "", date: "all" };

function fmt(ts) {
  return new Date(ts).toLocaleString();
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function withinDate(ts) {
  if (filters.date === "today") return ts >= startOfToday();
  if (filters.date === "7d") return ts >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  return true;
}

function matches(a) {
  if (filters.agent && a.agent !== filters.agent) return false;
  if (filters.type && a.type !== filters.type) return false;
  if (!withinDate(a.receivedAt)) return false;
  if (filters.text && !a.message.toLowerCase().includes(filters.text.toLowerCase())) return false;
  return true;
}

function distinct(key) {
  return [...new Set(allAlerts.map((a) => a[key]))].sort();
}

function optionList(values, selected) {
  const all = `<option value=""${selected === "" ? " selected" : ""}>All</option>`;
  return all + values.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
}

function dateOption(value, label) {
  return `<option value="${value}"${filters.date === value ? " selected" : ""}>${label}</option>`;
}

function renderControls() {
  root.innerHTML = `
    <div class="filters">
      <input id="f-text" type="text" placeholder="Search message…" value="${esc(filters.text)}" />
      <select id="f-agent">${optionList(distinct("agent"), filters.agent)}</select>
      <select id="f-type">${optionList(distinct("type"), filters.type)}</select>
      <select id="f-date">
        ${dateOption("all", "All time")}
        ${dateOption("today", "Today")}
        ${dateOption("7d", "Last 7 days")}
      </select>
    </div>
    <div id="results"></div>`;
  renderResults();
}

function renderResults() {
  const results = document.getElementById("results");
  const filtered = allAlerts.filter(matches);
  if (!filtered.length) {
    results.innerHTML = '<div class="empty">No alerts match.</div>';
    return;
  }
  results.innerHTML = filtered.map((a) => `
    <div class="row">
      <div class="msg"></div>
      <div class="meta">${fmt(a.receivedAt)} · ${esc(a.agent)}</div>
      <div class="status ${a.status}">${a.status}</div>
      <div>
        <button data-act="approve" data-id="${a.id}">Approve</button>
        <button data-act="deny" data-id="${a.id}">Deny</button>
        <button data-act="replay" data-id="${a.id}">Replay</button>
      </div>
    </div>`).join("");
  const msgs = results.querySelectorAll(".msg");
  filtered.forEach((a, i) => { msgs[i].textContent = a.message; });
}

root.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  vscode.postMessage({ type: btn.getAttribute("data-act"), id: btn.getAttribute("data-id") });
});

root.addEventListener("input", (e) => {
  if (e.target.id === "f-text") {
    filters.text = e.target.value;
    renderResults();
  }
});

root.addEventListener("change", (e) => {
  if (e.target.id === "f-agent") filters.agent = e.target.value;
  else if (e.target.id === "f-type") filters.type = e.target.value;
  else if (e.target.id === "f-date") filters.date = e.target.value;
  else return;
  renderResults();
});

window.addEventListener("message", (e) => {
  if (e.data.type === "data") {
    allAlerts = e.data.alerts;
    renderControls();
  }
});

vscode.postMessage({ type: "ready" });
