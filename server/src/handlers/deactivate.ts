import * as repo from "../license/repository";
import type { LicenseDeps } from "./activate";

export async function handleDeactivate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  await repo.deleteActivation(deps.db, body.licenseKey, body.deviceId);
  return Response.json({ ok: true });
}
