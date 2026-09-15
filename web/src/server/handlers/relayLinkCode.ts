import { authenticateRelay } from "../relay/relayAuth";
import { createLinkCode } from "../relay/repository";

export interface RelayLinkCodeDeps {
  db: D1Database;
  verifyKey: CryptoKey;
  now: () => number;
  botUsername: string;
  genCode: () => string;
  codeTtlMs: number;
}

export async function handleRelayLinkCode(request: Request, deps: RelayLinkCodeDeps): Promise<Response> {
  const now = deps.now();
  const id = await authenticateRelay(request, deps.verifyKey, now);
  if (!id) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const code = deps.genCode();
  await createLinkCode(deps.db, code, id.accountId, now + deps.codeTtlMs);
  return Response.json({ ok: true, code, deepLink: `https://t.me/${deps.botUsername}?start=${code}` });
}
