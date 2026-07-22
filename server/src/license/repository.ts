export interface LicenseRow {
  license_key: string;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  paddle_transaction_id: string | null;
  email: string | null;
  status: string;
  plan: string | null;
  device_limit: number;
  created_at: number;
  updated_at: number;
}

export async function getLicenseByKey(db: D1Database, key: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE license_key = ?").bind(key).first<LicenseRow>();
}

export async function getLicenseBySubscription(db: D1Database, subId: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE paddle_subscription_id = ?").bind(subId).first<LicenseRow>();
}

export async function getLicenseByTransaction(db: D1Database, txn: string): Promise<LicenseRow | null> {
  return db.prepare("SELECT * FROM licenses WHERE paddle_transaction_id = ?").bind(txn).first<LicenseRow>();
}

export async function insertLicense(db: D1Database, row: LicenseRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO licenses
       (license_key, paddle_subscription_id, paddle_customer_id, paddle_transaction_id,
        email, status, plan, device_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.license_key,
      row.paddle_subscription_id,
      row.paddle_customer_id,
      row.paddle_transaction_id,
      row.email,
      row.status,
      row.plan,
      row.device_limit,
      row.created_at,
      row.updated_at
    )
    .run();
}

export async function updateLicenseStatus(
  db: D1Database,
  subId: string,
  status: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE paddle_subscription_id = ?")
    .bind(status, now, subId)
    .run();
}

export async function setLicenseTransaction(
  db: D1Database,
  subId: string,
  txn: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE licenses SET paddle_transaction_id = ?, updated_at = ? WHERE paddle_subscription_id = ?")
    .bind(txn, now, subId)
    .run();
}

export async function countActivations(db: D1Database, key: string): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM activations WHERE license_key = ?")
    .bind(key)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getActivation(db: D1Database, key: string, deviceId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM activations WHERE license_key = ? AND device_id = ?")
    .bind(key, deviceId)
    .first<{ x: number }>();
  return row !== null;
}

export async function upsertActivation(
  db: D1Database,
  key: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activations (license_key, device_id, activated_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (license_key, device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
    .bind(key, deviceId, now, now)
    .run();
}

export async function deleteActivation(db: D1Database, key: string, deviceId: string): Promise<void> {
  await db
    .prepare("DELETE FROM activations WHERE license_key = ? AND device_id = ?")
    .bind(key, deviceId)
    .run();
}

export async function touchLastSeen(
  db: D1Database,
  key: string,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare("UPDATE activations SET last_seen_at = ? WHERE license_key = ? AND device_id = ?")
    .bind(now, key, deviceId)
    .run();
}
