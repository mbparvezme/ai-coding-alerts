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

export type AuthResult =
  | {
      ok: true;
      token: string;
      status: string;
      plan: string | null;
      account?: { id: string; email: string | null; name: string | null; username: string | null; avatarUrl: string | null };
    }
  | {
      ok: false;
      code: "github_auth" | "device_limit" | "no_account" | "network" | "server";
      message: string;
    };

function mapAuthError(status: number, error: unknown): AuthResult & { ok: false } {
  const known: Record<string, AuthResult & { ok: false }> = {
    github_auth: { ok: false, code: "github_auth", message: "GitHub authentication failed." },
    device_limit: { ok: false, code: "device_limit", message: "Device limit reached. Deactivate another device first." },
    no_account: { ok: false, code: "no_account", message: "No account found for this GitHub user." }
  };
  if (typeof error === "string" && known[error]) return known[error];
  return { ok: false, code: "server", message: `Server error (${status}).` };
}

async function callAuth(url: string, githubToken: string, deviceId: string, fetchImpl: FetchLike): Promise<AuthResult> {
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ githubToken, deviceId })
    });
  } catch {
    return { ok: false, code: "network", message: "Couldn't reach the account server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    token?: string;
    status?: string;
    plan?: string | null;
    account?: { id: string; email: string | null; name: string | null; username: string | null; avatarUrl: string | null };
  };
  if (res.status === 200 && body.ok && body.token) {
    return { ok: true, token: body.token, status: body.status ?? "active", plan: body.plan ?? null, account: body.account };
  }
  return mapAuthError(res.status, body.error);
}

export function authGithub(baseUrl: string, githubToken: string, deviceId: string, fetchImpl: FetchLike): Promise<AuthResult> {
  return callAuth(`${baseUrl}/auth/github`, githubToken, deviceId, fetchImpl);
}

export function refreshAuth(baseUrl: string, githubToken: string, deviceId: string, fetchImpl: FetchLike): Promise<AuthResult> {
  return callAuth(`${baseUrl}/auth/refresh`, githubToken, deviceId, fetchImpl);
}

export async function deactivateAccount(baseUrl: string, githubToken: string, deviceId: string, fetchImpl: FetchLike): Promise<{ ok: boolean }> {
  try {
    const res = await fetchImpl(`${baseUrl}/auth/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ githubToken, deviceId })
    });
    return { ok: res.status === 200 };
  } catch {
    return { ok: false };
  }
}
