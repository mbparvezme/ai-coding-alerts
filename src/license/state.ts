import type { TokenPayload } from "./token";

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day token TTL
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day offline grace (from iat)
export const RECHECK_MS = 3 * 24 * 60 * 60 * 1000; // ~3-day re-check cadence

export type LicenseMode = "active" | "grace" | "expired" | "inactive" | "none";

export interface LicenseState {
  pro: boolean;
  mode: LicenseMode;
  shouldRevalidate: boolean;
}

export function evaluateLicense(payload: TokenPayload | null, nowMs: number): LicenseState {
  if (!payload) return { pro: false, mode: "none", shouldRevalidate: false };

  const iatMs = payload.iat * 1000;
  const expMs = payload.exp * 1000;
  const shouldRevalidate = nowMs >= iatMs + RECHECK_MS;

  if (payload.status !== "active") {
    return { pro: false, mode: "inactive", shouldRevalidate: true };
  }
  if (nowMs >= iatMs + GRACE_MS) {
    return { pro: false, mode: "expired", shouldRevalidate };
  }
  if (nowMs > expMs) {
    return { pro: true, mode: "grace", shouldRevalidate };
  }
  return { pro: true, mode: "active", shouldRevalidate };
}
