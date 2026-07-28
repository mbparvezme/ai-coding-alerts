import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleAuthDeactivate } from "@/server/handlers/authDeactivate";
import { importSigningKey } from "@/server/lib/jwt";

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  const signingKey = await importSigningKey(env.LICENSE_SIGNING_PRIVATE_KEY);
  return handleAuthDeactivate(request, {
    db: env.DB,
    signingKey,
    githubFetch: (url, init) => fetch(url, init),
    now: () => Date.now()
  });
}
