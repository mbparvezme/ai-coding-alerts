"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteDevice, getUserById } from "@/server/account/repository";
import { buildPortalSessionRequest, parsePortalSessionResponse } from "@/server/paddle/portal";
import { getPaddleEnv } from "@/config/paddle";

export async function deactivateDeviceAction(deviceId: string): Promise<void> {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) throw new Error("unauthorized");
  const { env } = getCloudflareContext();
  await deleteDevice(env.DB, accountId, deviceId);
  revalidatePath("/account");
}

export async function openBillingPortalAction(): Promise<void> {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) throw new Error("unauthorized");
  const { env } = getCloudflareContext();
  const user = await getUserById(env.DB, accountId);
  if (!user?.paddle_customer_id) redirect("/#pricing"); // no customer yet → send to pricing
  const { url, init } = buildPortalSessionRequest(
    user.paddle_customer_id,
    getPaddleEnv(),
    (env as any).PADDLE_API_KEY as string
  );
  const res = await fetch(url, init);
  const portalUrl = parsePortalSessionResponse(await res.json());
  redirect(portalUrl);
}
