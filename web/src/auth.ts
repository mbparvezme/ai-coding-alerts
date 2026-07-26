import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { upsertUserByGithub } from "@/server/account/repository";

export async function upsertOnSignIn(
  profile: { id: number; login: string; name: string | null; email: string | null; avatar_url: string | null },
  db: D1Database,
  now: number
): Promise<string> {
  const u = await upsertUserByGithub(
    db,
    { githubId: profile.id, email: profile.email, name: profile.name, username: profile.login, avatarUrl: profile.avatar_url },
    now
  );
  return u.id;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [GitHub],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const { env } = getCloudflareContext();
        token.accountId = await upsertOnSignIn(profile as any, env.DB, Date.now());
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accountId = token.accountId;
      return session;
    }
  }
});
