import { buttonVariants } from "@heroui/styles";
import { MARKETPLACE_URL } from "@/config/links";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold text-text">Get back to the interesting part.</h2>
      <p className="mt-4 text-muted">Let the agent do the work. Let your phone do the watching.</p>
      <div className="mt-8">
        <a href={MARKETPLACE_URL} className={buttonVariants({ variant: "primary", size: "lg" })}>Add to VS Code — Free</a>
      </div>
    </section>
  );
}
