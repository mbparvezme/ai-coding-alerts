const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

function fmt(ts) {
  return new Date(ts).toLocaleString();
}

function render(alerts) {
  if (!alerts.length) {
    root.innerHTML = '<div class="empty">No alerts yet.</div>';
    return;
  }
  root.innerHTML = alerts.map((a) => `
    <div class="row">
      <div class="msg"></div>
      <div class="meta">${fmt(a.receivedAt)} · ${a.agent}</div>
      <div class="status ${a.status}">${a.status}</div>
      <div>
        <button data-act="approve" data-id="${a.id}">Approve</button>
        <button data-act="deny" data-id="${a.id}">Deny</button>
        <button data-act="replay">Replay</button>
      </div>
    </div>`).join("");
  const msgs = root.querySelectorAll(".msg");
  alerts.forEach((a, i) => { msgs[i].textContent = a.message; });
}

root.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const act = btn.getAttribute("data-act");
  if (act === "replay") { vscode.postMessage({ type: "replay" }); return; }
  vscode.postMessage({ type: act, id: btn.getAttribute("data-id") });
});

window.addEventListener("message", (e) => {
  if (e.data.type === "data") render(e.data.alerts);
});
