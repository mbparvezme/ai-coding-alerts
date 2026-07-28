import { verifyGithubToken } from "../account/github";
import { resolveEntitlement } from "../account/entitlement";
import { mintAccountToken } from "../account/mintToken";
import * as repo from "../account/repository";
import type { AccountDeps } from "./authGithub";

export async function handleAuthRefresh(request: Request, deps: AccountDeps): Promise<Response> {
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

  const user = await repo.getUserByGithubId(deps.db, identity.githubId);
  if (!user) {
    return Response.json({ ok: false, error: "no_account" }, { status: 404 });
  }

  const nowMs = deps.now();
  await repo.touchDevice(deps.db, user.id, body.deviceId, nowMs);

  const subscription = await repo.getActiveSubscription(deps.db, user.id);
  const entitlement = resolveEntitlement(subscription);

  const token = await mintAccountToken(user.id, body.deviceId, entitlement, nowMs, deps.signingKey);

  return Response.json({
    ok: true,
    token,
    status: entitlement.status,
    plan: entitlement.plan
  });
}
