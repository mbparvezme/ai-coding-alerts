import { verifyToken } from "../lib/jwt";

export interface RelayIdentity {
  accountId: string;
  deviceId: string;
}

const ENTITLED = new Set(["active", "past_due"]);

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice("Bearer ".length).trim();
  return t || null;
}

export async function authenticateRelay(request: Request, verifyKey: CryptoKey, nowMs: number): Promise<RelayIdentity | null> {
  const token = bearer(request);
  if (!token) return null;
  const payload = await verifyToken(token, verifyKey);
  if (!payload) return null;
  if (payload.exp * 1000 <= nowMs) return null;
  if (!ENTITLED.has(payload.status)) return null;
  return { accountId: payload.sub, deviceId: payload.deviceId };
}
