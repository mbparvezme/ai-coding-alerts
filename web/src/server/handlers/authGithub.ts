import { verifyGithubToken } from "../account/github";
import type { GithubFetch } from "../account/github";
import { resolveEntitlement } from "../account/entitlement";
import { mintAccountToken } from "../account/mintToken";
import * as repo from "../account/repository";

export interface AccountDeps {
  db: D1Database;
  signingKey: CryptoKey;
  githubFetch: GithubFetch;
  now: () => number;
}

const DEVICE_LIMIT = 3;

export async function handleAuthGithub(request: Request, deps: AccountDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { githubToken?: string; deviceId?: string }
    | null;
  if (!body?.githubToken || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const identity = await verifyGithubToken(body.githubToken, deps.githubFetch);
  if (!identity) {
    return Response.json({ ok: false, error: "github_auth" }, { status: 401 });
  }

  const nowMs = deps.now();
  const user = await repo.upsertUserByGithub(deps.db, identity, nowMs);

  const already = await repo.hasDevice(deps.db, user.id, body.deviceId);
  if (!already) {
    const count = await repo.countDevices(deps.db, user.id);
    if (count >= DEVICE_LIMIT) {
      return Response.json({ ok: false, error: "device_limit" }, { status: 409 });
    }
  }
  await repo.upsertDevice(deps.db, user.id, body.deviceId, nowMs);

  const subscription = await repo.getActiveSubscription(deps.db, user.id);
  const entitlement = resolveEntitlement(subscription);

  const token = await mintAccountToken(user.id, body.deviceId, entitlement, nowMs, deps.signingKey);

  return Response.json({
    ok: true,
    token,
    status: entitlement.status,
    plan: entitlement.plan,
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatar_url
    }
  });
}
