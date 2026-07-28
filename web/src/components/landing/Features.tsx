const FEATURES = [
  { t: "Approve from anywhere", d: "Your agent asks permission; you answer from your phone. Two-way control, not just a notification.", tier: "Free" },
  { t: "Zero-setup, managed alerts", d: "Skip the bot tokens. We host the relay; flip a switch and it works on every machine.", tier: "Pro" },
  { t: "Your setup, everywhere", d: "Settings and history sync automatically across every device you code on.", tier: "Pro" },
  { t: "Private by design", d: "Alerts are about events, not your code.", tier: "Free" },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Everything you need to stop watching and start shipping.</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <div className="font-medium text-text">{f.t}</div>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{f.tier}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
