import { upsertUserByGithub } from "./repository";

/**
 * The testable core of the Auth.js `jwt` callback: maps a GitHub OAuth profile onto our
 * `users` table and returns the account id. Deliberately has NO dependency on `next-auth`
 * (or anything it pulls in, like `next/headers`/`next/server`) so it can be unit-tested
 * without booting Auth.js's config factory under the Workers test runtime.
 */
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
