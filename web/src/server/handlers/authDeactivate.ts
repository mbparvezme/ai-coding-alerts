import { verifyGithubToken } from "../account/github";
import * as repo from "../account/repository";
import type { AccountDeps } from "./authGithub";

export async function handleAuthDeactivate(request: Request, deps: AccountDeps): Promise<Response> {
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
  if (user) {
    await repo.deleteDevice(deps.db, user.id, body.deviceId);
  }

  return Response.json({ ok: true });
}
