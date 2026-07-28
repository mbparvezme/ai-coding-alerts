import { auth } from "@/auth";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { FreeVsPro } from "@/components/landing/FreeVsPro";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default async function HomePage() {
  const session = await auth();
  const signedIn = Boolean((session as any)?.accountId);
  return (
    <main id="top">
      <Nav signedIn={signedIn} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <FreeVsPro />
      <section id="pricing" className="mx-auto max-w-4xl px-6 py-20" />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
