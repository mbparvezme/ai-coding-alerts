const STEPS = [
  { n: "1", t: "Install the extension", d: "One click in VS Code." },
  { n: "2", t: "Connect your alerts", d: "Bring your own Telegram bot (free), or let us host it (Pro, zero setup)." },
  { n: "3", t: "Walk away", d: "When your agent finishes or needs a decision, your phone buzzes. Tap Approve or Deny." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">From &quot;watching it work&quot; to &quot;getting a text.&quot;</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-surface p-6">
            <div className="text-urgent font-mono text-sm">{s.n}</div>
            <div className="mt-2 font-medium text-text">{s.t}</div>
            <p className="mt-2 text-sm text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
