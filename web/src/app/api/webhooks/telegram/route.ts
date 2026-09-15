import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleTelegramWebhook } from "@/server/handlers/telegramWebhook";
import { createTelegramClient } from "@/server/relay/telegram";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleTelegramWebhook(request, {
    db: env.DB,
    now: () => Date.now(),
    telegram: createTelegramClient(env.TELEGRAM_BOT_TOKEN),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET
  });
}
