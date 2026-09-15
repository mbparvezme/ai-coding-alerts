// src/relay/relayClient.ts
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; json: () => Promise<any> }>;

export interface RelayClientDeps {
  fetchImpl: FetchLike;
  baseUrl: () => string;
  token: () => Promise<string | undefined>;
}

export interface RelayClient {
  createPermission(p: { tool: string; command: string; ttlSec: number }): Promise<{ ok: true; requestId: string } | { ok: false; notLinked: boolean }>;
  getDecision(requestId: string): Promise<"pending" | "allow" | "deny" | "expired">;
}

export function createRelayClient(deps: RelayClientDeps): RelayClient {
  async function authHeaders(): Promise<Record<string, string>> {
    const t = await deps.token();
    return t ? { Authorization: `Bearer ${t}`, "content-type": "application/json" } : { "content-type": "application/json" };
  }
  return {
    async createPermission(p) {
      const res = await deps.fetchImpl(`${deps.baseUrl()}/relay/permission`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(p)
      });
      if (res.status === 200) {
        const body = await res.json();
        if (body?.ok && typeof body.requestId === "string") return { ok: true, requestId: body.requestId };
      }
      return { ok: false, notLinked: res.status === 409 };
    },
    async getDecision(requestId) {
      const res = await deps.fetchImpl(`${deps.baseUrl()}/relay/decision/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers: await authHeaders()
      });
      if (res.status !== 200) return "expired";
      const body = await res.json().catch(() => null);
      const s = body?.status;
      return s === "allow" || s === "deny" || s === "pending" ? s : "expired";
    }
  };
}
