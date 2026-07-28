import { verifyGithubToken } from "../account/github";
import * as repo from "../account/repository";
import type { AccountDeps } from "./authGithub";

export type SettingsBackupDeps = Pick<AccountDeps, "db" | "githubFetch" | "now">;

const MAX_BLOB_LENGTH = 65536;

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function handleSettingsBackupGet(request: Request, deps: SettingsBackupDeps): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const identity = await verifyGithubToken(token, deps.githubFetch);
  if (!identity) {
    return Response.json({ ok: false, error: "github_auth" }, { status: 401 });
  }

  const nowMs = deps.now();
  let user = await repo.getUserByGithubId(deps.db, identity.githubId);
  if (!user) {
    user = await repo.upsertUserByGithub(deps.db, identity, nowMs);
  }

  const blob = await repo.getSettingsBackup(deps.db, user.id);
  return Response.json({ ok: true, blob });
}

export async function handleSettingsBackupPut(request: Request, deps: SettingsBackupDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { githubToken?: string; blob?: string }
    | null;
  if (!body?.githubToken || typeof body.blob !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const identity = await verifyGithubToken(body.githubToken, deps.githubFetch);
  if (!identity) {
    return Response.json({ ok: false, error: "github_auth" }, { status: 401 });
  }

  if (body.blob.length > MAX_BLOB_LENGTH) {
    return Response.json({ ok: false, error: "too_large" }, { status: 400 });
  }

  const nowMs = deps.now();
  let user = await repo.getUserByGithubId(deps.db, identity.githubId);
  if (!user) {
    user = await repo.upsertUserByGithub(deps.db, identity, nowMs);
  }

  await repo.putSettingsBackup(deps.db, user.id, body.blob, nowMs);
  return Response.json({ ok: true });
}
