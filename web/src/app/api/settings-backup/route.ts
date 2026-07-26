import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleSettingsBackupGet, handleSettingsBackupPut } from "@/server/handlers/settingsBackup";

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleSettingsBackupGet(request, {
    db: env.DB,
    githubFetch: (url, init) => fetch(url, init),
    now: () => Date.now()
  });
}

export async function PUT(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  return handleSettingsBackupPut(request, {
    db: env.DB,
    githubFetch: (url, init) => fetch(url, init),
    now: () => Date.now()
  });
}
