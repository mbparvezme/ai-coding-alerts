import type { GithubIdentity } from "./github";

export interface UserRow {
  id: string;
  github_id: number;
  email: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  paddle_customer_id: string | null;
  marketing_consent: number;
  created_at: number;
  updated_at: number;
}

export interface SubscriptionRow {
  paddle_subscription_id: string;
  user_id: string;
  status: string;
  plan: string;
  created_at: number;
  updated_at: number;
}

export async function upsertUserByGithub(
  db: D1Database,
  identity: GithubIdentity,
  now: number
): Promise<UserRow> {
  const id = "acct_" + crypto.randomUUID();
  const row = await db
    .prepare(
      `INSERT INTO users
       (id, github_id, email, name, username, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         username = excluded.username,
         avatar_url = excluded.avatar_url,
         updated_at = excluded.updated_at
       RETURNING *`
    )
    .bind(
      id,
      identity.githubId,
      identity.email,
      identity.name,
      identity.username,
      identity.avatarUrl,
      now,
      now
    )
    .first<UserRow>();
  if (!row) throw new Error("upsertUserByGithub: no row returned");
  return row;
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function getUserByGithubId(db: D1Database, githubId: number): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE github_id = ?").bind(githubId).first<UserRow>();
}

export async function setPaddleCustomerId(
  db: D1Database,
  userId: string,
  customerId: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE users SET paddle_customer_id = ?, updated_at = ? WHERE id = ?")
    .bind(customerId, now, userId)
    .run();
}

export async function getActiveSubscription(db: D1Database, userId: string): Promise<SubscriptionRow | null> {
  return db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND status IN ('active', 'past_due')
       ORDER BY updated_at DESC LIMIT 1`
    )
    .bind(userId)
    .first<SubscriptionRow>();
}

export async function upsertSubscription(db: D1Database, row: SubscriptionRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscriptions
       (paddle_subscription_id, user_id, status, plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(paddle_subscription_id) DO UPDATE SET
         status = excluded.status,
         plan = excluded.plan,
         updated_at = excluded.updated_at`
    )
    .bind(row.paddle_subscription_id, row.user_id, row.status, row.plan, row.created_at, row.updated_at)
    .run();
}

export async function getSubscriptionById(db: D1Database, subId: string): Promise<SubscriptionRow | null> {
  return db
    .prepare("SELECT * FROM subscriptions WHERE paddle_subscription_id = ?")
    .bind(subId)
    .first<SubscriptionRow>();
}

export async function countDevices(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM devices WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function hasDevice(db: D1Database, userId: string, deviceId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM devices WHERE user_id = ? AND device_id = ?")
    .bind(userId, deviceId)
    .first<{ x: number }>();
  return row !== null;
}

export async function upsertDevice(
  db: D1Database,
  userId: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO devices (user_id, device_id, activated_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
    .bind(userId, deviceId, now, now)
    .run();
}

export async function deleteDevice(db: D1Database, userId: string, deviceId: string): Promise<void> {
  await db
    .prepare("DELETE FROM devices WHERE user_id = ? AND device_id = ?")
    .bind(userId, deviceId)
    .run();
}

export async function touchDevice(
  db: D1Database,
  userId: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE devices SET last_seen_at = ? WHERE user_id = ? AND device_id = ?")
    .bind(now, userId, deviceId)
    .run();
}

export async function getSettingsBackup(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT blob FROM settings_backups WHERE user_id = ?")
    .bind(userId)
    .first<{ blob: string }>();
  return row?.blob ?? null;
}

export async function putSettingsBackup(
  db: D1Database,
  userId: string,
  blob: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings_backups (user_id, blob, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`
    )
    .bind(userId, blob, now)
    .run();
}

export async function hasProcessedEvent(db: D1Database, eventId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM processed_events WHERE event_id = ?")
    .bind(eventId)
    .first<{ x: number }>();
  return row !== null;
}

export async function recordProcessedEvent(db: D1Database, eventId: string, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?, ?)")
    .bind(eventId, now)
    .run();
}

export interface DeviceRow {
  user_id: string;
  device_id: string;
  activated_at: number;
  last_seen_at: number;
}

export async function listDevices(db: D1Database, userId: string): Promise<DeviceRow[]> {
  const res = await db
    .prepare("SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC")
    .bind(userId)
    .all<DeviceRow>();
  return res.results ?? [];
}

export async function getSettingsBackupMeta(
  db: D1Database,
  userId: string
): Promise<{ updatedAt: number; bytes: number } | null> {
  const row = await db
    .prepare("SELECT updated_at AS updatedAt, length(blob) AS bytes FROM settings_backups WHERE user_id = ?")
    .bind(userId)
    .first<{ updatedAt: number; bytes: number }>();
  return row ?? null;
}
