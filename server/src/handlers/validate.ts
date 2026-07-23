import { mintLicenseToken } from "../license/mintToken";
import * as repo from "../license/repository";
import type { LicenseDeps } from "./activate";

export async function handleValidate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const license = await repo.getLicenseByKey(deps.db, body.licenseKey);
  if (!license) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (license.status !== "active") {
    return Response.json({ ok: false, error: "inactive", status: license.status }, { status: 403 });
  }

  const activated = await repo.getActivation(deps.db, body.licenseKey, body.deviceId);
  if (!activated) {
    return Response.json({ ok: false, error: "not_activated" }, { status: 409 });
  }

  const nowMs = deps.now();
  await repo.touchLastSeen(deps.db, body.licenseKey, body.deviceId, nowMs);

  const token = await mintLicenseToken(license, body.deviceId, nowMs, deps.signingKey);

  return Response.json({ ok: true, token, status: license.status, plan: license.plan, deviceLimit: license.device_limit });
}
