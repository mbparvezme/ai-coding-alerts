"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { deleteDevice } from "@/server/account/repository";

export async function deactivateDeviceAction(deviceId: string): Promise<void> {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) throw new Error("unauthorized");
  const { env } = getCloudflareContext();
  await deleteDevice(env.DB, accountId, deviceId);
  revalidatePath("/account");
}
