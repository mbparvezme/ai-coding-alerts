import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleRelayDecision } from "@/server/handlers/relayDecision";
import { importVerifyKey } from "@/server/lib/jwt";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { env } = getCloudflareContext();
  const { id } = await ctx.params;
  return handleRelayDecision(
    request,
    { db: env.DB, verifyKey: await importVerifyKey(env.LICENSE_PUBLIC_KEY), now: () => Date.now() },
    id
  );
}
