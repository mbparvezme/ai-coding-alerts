const ROWS = [
  { label: "All local alerts + two-way approve/deny", free: true, pro: true },
  { label: "Bring your own Telegram bot", free: true, pro: true },
  { label: "Managed bot — zero setup", free: false, pro: true },
  { label: "Auto cross-device sync", free: false, pro: true },
  { label: "Web dashboard", free: false, pro: true },
];

export function FreeVsPro() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Self-host it free. Or let us run it.</h2>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-4 text-left font-normal">Feature</th>
              <th className="p-4 font-normal">Free</th>
              <th className="p-4 font-normal">Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td className="p-4 text-text">{r.label}</td>
                <td className="p-4 text-center">{r.free ? <span className="text-success">✓</span> : <span className="text-muted">—</span>}</td>
                <td className="p-4 text-center">{r.pro ? <span className="text-success">✓</span> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-center text-muted">Same power. Pro just means you never touch a config file.</p>
    </section>
  );
}
