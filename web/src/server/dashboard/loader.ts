import {
  getUserById,
  getActiveSubscription,
  listDevices,
  getSettingsBackupMeta,
  type UserRow,
  type SubscriptionRow,
  type DeviceRow,
} from "@/server/account/repository";

export interface DashboardData {
  user: UserRow;
  subscription: SubscriptionRow | null;
  devices: DeviceRow[];
  backup: { updatedAt: number; bytes: number } | null;
}

export async function getDashboardData(db: D1Database, accountId: string): Promise<DashboardData | null> {
  const user = await getUserById(db, accountId);
  if (!user) return null;
  const [subscription, devices, backup] = await Promise.all([
    getActiveSubscription(db, accountId),
    listDevices(db, accountId),
    getSettingsBackupMeta(db, accountId),
  ]);
  return { user, subscription, devices, backup };
}
