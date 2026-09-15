import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayLinkCode } from "@/server/handlers/relayLinkCode";
import { importVerifyKey } from "@/server/lib/jwt";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleRelayLinkCode(request, {
    db: env.DB,
    verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY),
    now: () => Date.now(),
    botUsername: env.TELEGRAM_BOT_USERNAME,
    genCode: () => crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    codeTtlMs: 10 * 60 * 1000
  });
}
