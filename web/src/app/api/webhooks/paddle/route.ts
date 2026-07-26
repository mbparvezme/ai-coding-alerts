import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleWebhook } from "@/server/handlers/webhook";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleWebhook(request, {
    db: env.DB,
    webhookSecret: env.PADDLE_WEBHOOK_SECRET,
    now: () => Date.now()
  });
}
