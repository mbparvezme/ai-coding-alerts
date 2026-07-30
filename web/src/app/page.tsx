import { auth } from "@/auth";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default async function HomePage() {
  const session = await auth();
  const signedIn = Boolean((session as any)?.accountId);
  const email = (session?.user?.email as string | undefined) ?? null;
  const accountId = ((session as any)?.accountId as string | undefined) ?? null;
  return (
    <main id="top">
      <Nav signedIn={signedIn} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <section id="pricing" className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="mb-10 text-center text-2xl font-semibold text-text">Less than you spend not-thinking-about-it.</h2>
        <Pricing accountId={accountId} email={email} />
      </section>
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
