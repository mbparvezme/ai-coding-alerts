const root = document.getElementById("root");

function ms(v) { return v == null ? "—" : (v / 1000).toFixed(1) + "s"; }
function hour(v) { return v == null ? "—" : String(v).padStart(2, "0") + ":00"; }
function txt(v) { return v == null ? "—" : v; }

function render(s) {
  const rows = [
    ["Alerts today", s.totalToday],
    ["Approved", s.approved],
    ["Denied", s.denied],
    ["Avg. response", ms(s.averageResponseMs)],
    ["Peak hour", hour(s.peakHour)],
    ["Most common type", txt(s.mostCommonType)]
  ];
  root.innerHTML = rows.map(([label, value]) =>
    `<div class="metric"><span>${label}</span><span class="value">${value}</span></div>`
  ).join("");
}

window.addEventListener("message", (e) => {
  if (e.data.type === "stats") render(e.data.stats);
});
