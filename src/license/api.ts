export interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{
    status: number;
    json(): Promise<unknown>;
  }>;
}

export type ActivateResult =
  | { ok: true; token: string; status: string; plan: string | null; deviceLimit: number }
  | {
      ok: false;
      code: "not_found" | "device_limit" | "inactive" | "not_activated" | "network" | "server";
      message: string;
    };

function mapError(status: number, error: unknown): ActivateResult {
  const known: Record<string, ActivateResult & { ok: false }> = {
    not_found: { ok: false, code: "not_found", message: "License key not found." },
    device_limit: { ok: false, code: "device_limit", message: "Device limit reached. Deactivate another device first." },
    inactive: { ok: false, code: "inactive", message: "This subscription is not active." },
    not_activated: { ok: false, code: "not_activated", message: "This device is not activated." }
  };
  if (typeof error === "string" && known[error]) return known[error];
  return { ok: false, code: "server", message: `Server error (${status}).` };
}

async function call(url: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId })
    });
  } catch {
    return { ok: false, code: "network", message: "Couldn't reach the license server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean; error?: string; token?: string; status?: string; plan?: string | null; deviceLimit?: number;
  };
  if (res.status === 200 && body.ok && body.token) {
    return { ok: true, token: body.token, status: body.status ?? "active", plan: body.plan ?? null, deviceLimit: body.deviceLimit ?? 3 };
  }
  return mapError(res.status, body.error);
}

export function activateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  return call(`${baseUrl}/license/activate`, licenseKey, deviceId, fetchImpl);
}

export function validateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<ActivateResult> {
  return call(`${baseUrl}/license/validate`, licenseKey, deviceId, fetchImpl);
}

export async function deactivateLicense(baseUrl: string, licenseKey: string, deviceId: string, fetchImpl: FetchLike): Promise<{ ok: boolean }> {
  try {
    const res = await fetchImpl(`${baseUrl}/license/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId })
    });
    return { ok: res.status === 200 };
  } catch {
    return { ok: false };
  }
}
