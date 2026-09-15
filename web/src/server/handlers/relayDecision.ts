import { authenticateRelay } from "../relay/relayAuth";
import { getRelayRequest } from "../relay/repository";

export interface RelayDecisionDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
}

export async function handleRelayDecision(request: Request, deps: RelayDecisionDeps, requestId: string): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const row = await getRelayRequest(deps.db, requestId);
  if (!row || row.user_id !== id.accountId) {
    return Response.json({ status: "expired" });
  }
  const status = row.status === "pending" && now >= row.expires_at ? "expired" : row.status;
  return Response.json({ status });
}
