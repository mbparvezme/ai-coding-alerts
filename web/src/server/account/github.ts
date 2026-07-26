export type GithubIdentity = {
  githubId: number;
  email: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type GithubFetch = (
  url: string,
  init: { headers: Record<string, string> }
) => Promise<{ status: number; json(): Promise<unknown> }>;

interface GithubUserResponse {
  id: number;
  login: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GithubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "ai-coding-alerts",
    Accept: "application/vnd.github+json"
  };
}

async function fetchPrimaryVerifiedEmail(token: string, fetchImpl: GithubFetch): Promise<string | null> {
  const res = await fetchImpl("https://api.github.com/user/emails", {
    headers: githubHeaders(token)
  });
  if (res.status !== 200) return null;
  const emails = (await res.json()) as GithubEmailEntry[];
  const primary = emails.find((e) => e.primary && e.verified);
  if (primary) return primary.email;
  const verified = emails.find((e) => e.verified);
  return verified ? verified.email : null;
}

export async function verifyGithubToken(
  token: string,
  fetchImpl: GithubFetch
): Promise<GithubIdentity | null> {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: githubHeaders(token)
  });
  if (res.status !== 200) return null;
  const user = (await res.json()) as GithubUserResponse;

  let email = user.email;
  if (email === null) {
    email = await fetchPrimaryVerifiedEmail(token, fetchImpl);
  }

  return {
    githubId: user.id,
    email,
    name: user.name,
    username: user.login,
    avatarUrl: user.avatar_url
  };
}
