import { buttonVariants } from "@heroui/styles";
import { MARKETPLACE_URL } from "@/config/links";
import { signInWithGithub } from "@/app/auth-actions";

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-ground/80 px-6 py-3 backdrop-blur">
      <a href="#top" className="flex items-center gap-2 font-semibold text-text">
        <img src="/icon.png" alt="" width={24} height={24} /> AI Coding Alerts
      </a>
      <div className="flex items-center gap-4 text-sm">
        <a href="#features" className="text-muted hover:text-text">Features</a>
        <a href="#pricing" className="text-muted hover:text-text">Pricing</a>
        <a href={MARKETPLACE_URL} className={buttonVariants({ variant: "primary", size: "sm" })}>Add to VS Code — Free</a>
        {signedIn ? (
          <a href="/account" className="text-muted hover:text-text">Dashboard</a>
        ) : (
          <form action={signInWithGithub.bind(null, "/account")}>
            <button type="submit" className="text-muted hover:text-text">Sign in</button>
          </form>
        )}
      </div>
    </nav>
  );
}
