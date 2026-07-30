import { buttonVariants } from "@heroui/styles";
import { MARKETPLACE_URL } from "@/config/links";
import { COPY } from "@/config/copy";

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text sm:text-5xl">{COPY.hero.headline}</h1>
      <p className="mt-6 text-lg text-muted">{COPY.hero.subhead}</p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <a href={MARKETPLACE_URL} className={buttonVariants({ variant: "primary", size: "lg" })}>
          Add to VS Code — Free
        </a>
        <a href="#pricing" className="text-sm text-muted hover:text-text">See Pricing ↓</a>
      </div>
      <p className="mt-6 text-xs text-muted">{COPY.hero.trust.join("  ·  ")}</p>
    </section>
  );
}
