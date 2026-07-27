import type { TokenPayload } from "./token";

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day token TTL
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day offline grace (from iat)

export type LicenseMode = "active" | "grace" | "expired" | "inactive" | "none";

export interface LicenseState {
  pro: boolean;
  mode: LicenseMode;
}

export function evaluateLicense(payload: TokenPayload | null, nowMs: number): LicenseState {
  if (!payload) return { pro: false, mode: "none" };
  const iatMs = payload.iat * 1000;
  const expMs = payload.exp * 1000;
  if (payload.status !== "active") return { pro: false, mode: "inactive" };
  if (nowMs >= iatMs + GRACE_MS) return { pro: false, mode: "expired" };
  if (nowMs > expMs) return { pro: true, mode: "grace" };
  return { pro: true, mode: "active" };
}
