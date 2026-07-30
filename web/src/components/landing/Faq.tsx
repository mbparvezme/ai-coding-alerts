const QA = [
  { q: "Does it read my code?", a: "No — alerts are about events, not your source. (Exact data transmitted to be confirmed before launch.)" },
  { q: "Is the free tier a trial?", a: "No — it's free forever. Pro only adds managed hosting and sync." },
  { q: "Do I need a server or public URL?", a: "No. Free runs entirely on your machine." },
  { q: "Can I cancel anytime?", a: "Yes, one click. You keep the free tier." },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Questions, answered.</h2>
      <div className="mt-8 space-y-4">
        {QA.map((item) => (
          <div key={item.q} className="rounded-2xl border border-border bg-surface p-6">
            <div className="font-medium text-text">{item.q}</div>
            <p className="mt-2 text-sm text-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
