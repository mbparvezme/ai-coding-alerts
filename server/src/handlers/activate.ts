import { mintLicenseToken } from "../license/mintToken";
import * as repo from "../license/repository";

export interface LicenseDeps {
  db: D1Database;
  signingKey: CryptoKey;
  now: () => number;
}

export async function handleActivate(request: Request, deps: LicenseDeps): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { licenseKey?: string; deviceId?: string } | null;
  if (!body?.licenseKey || !body?.deviceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const license = await repo.getLicenseByKey(deps.db, body.licenseKey);
  if (!license) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (license.status !== "active") {
    return Response.json({ ok: false, error: "inactive", status: license.status }, { status: 403 });
  }

  const already = await repo.getActivation(deps.db, body.licenseKey, body.deviceId);
  if (!already) {
    const count = await repo.countActivations(deps.db, body.licenseKey);
    if (count >= license.device_limit) {
      return Response.json({ ok: false, error: "device_limit", deviceLimit: license.device_limit }, { status: 409 });
    }
  }

  const nowMs = deps.now();
  await repo.upsertActivation(deps.db, body.licenseKey, body.deviceId, nowMs);

  const token = await mintLicenseToken(license, body.deviceId, nowMs, deps.signingKey);

  return Response.json({ ok: true, token, status: license.status, plan: license.plan, deviceLimit: license.device_limit });
}
