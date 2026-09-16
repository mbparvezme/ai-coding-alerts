import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayPermission } from "@/server/handlers/relayPermission";
import { importVerifyKey } from "@/server/lib/jwt";
import { createTelegramClient } from "@/server/relay/telegram";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleRelayPermission(request, {
    db: env.DB,
    verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY),
    now: () => Date.now(),
    telegram: createTelegramClient(env.TELEGRAM_BOT_TOKEN),
    genRequestId: () => "req_" + crypto.randomUUID(),
    maxPending: 5
  });
}
