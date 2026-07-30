import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { upsertOnSignIn } from "@/server/account/signIn";

export { upsertOnSignIn };

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Lazy config: on Workers, secrets/bindings are only available per-request via
  // getCloudflareContext().env, not at module-evaluation time via process.env. Auth.js's
  // bare `providers: [GitHub]` form would otherwise auto-read process.env.AUTH_GITHUB_ID /
  // AUTH_GITHUB_SECRET, which this project never sets — our declared secrets are
  // GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET (see AccountEnv), so the provider
  // is configured explicitly from those instead of relying on auto-detection.
  const { env } = getCloudflareContext();
  return {
    trustHost: true,
    // On Workers/OpenNext, secrets come from getCloudflareContext().env (.dev.vars locally,
    // `wrangler secret` in prod), NOT process.env — so Auth.js's auto-read of AUTH_SECRET
    // finds nothing. Pass it explicitly from env, same as the GitHub credentials below.
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt" },
    providers: [GitHub({ clientId: env.GITHUB_OAUTH_CLIENT_ID, clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET })],
    callbacks: {
      async jwt({ token, profile }) {
        if (profile) {
          token.accountId = await upsertOnSignIn(profile as any, env.DB, Date.now());
        }
        return token;
      },
      async session({ session, token }) {
        (session as any).accountId = token.accountId;
        return session;
      }
    }
  };
});
