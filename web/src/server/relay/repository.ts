export interface TelegramLinkRow {
  user_id: string;
  chat_id: string;
  linked_at: number;
}

export interface RelayRequestRow {
  request_id: string;
  user_id: string;
  device_id: string;
  status: string;
  tg_message_id: number | null;
  created_at: number;
  expires_at: number;
}

export async function getTelegramLink(db: D1Database, userId: string): Promise<TelegramLinkRow | null> {
  return db.prepare("SELECT * FROM telegram_links WHERE user_id = ?").bind(userId).first<TelegramLinkRow>();
}

export async function getTelegramLinkByChat(db: D1Database, chatId: string): Promise<TelegramLinkRow | null> {
  return db.prepare("SELECT * FROM telegram_links WHERE chat_id = ?").bind(chatId).first<TelegramLinkRow>();
}

export async function upsertTelegramLink(db: D1Database, userId: string, chatId: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at`
    )
    .bind(userId, chatId, now)
    .run();
}

export async function deleteTelegramLink(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM telegram_links WHERE user_id = ?").bind(userId).run();
}

export async function createLinkCode(db: D1Database, code: string, userId: string, expiresAt: number): Promise<void> {
  await db.prepare("INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)").bind(code, userId, expiresAt).run();
}

export async function consumeLinkCode(db: D1Database, code: string, now: number): Promise<{ user_id: string } | null> {
  const row = await db.prepare("SELECT user_id, expires_at FROM telegram_link_codes WHERE code = ?").bind(code).first<{ user_id: string; expires_at: number }>();
  if (!row) return null;
  await db.prepare("DELETE FROM telegram_link_codes WHERE code = ?").bind(code).run();
  if (now >= row.expires_at) return null;
  return { user_id: row.user_id };
}

export async function createRelayRequest(db: D1Database, row: RelayRequestRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO relay_requests (request_id, user_id, device_id, status, tg_message_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(row.request_id, row.user_id, row.device_id, row.status, row.tg_message_id, row.created_at, row.expires_at)
    .run();
}

export async function getRelayRequest(db: D1Database, requestId: string): Promise<RelayRequestRow | null> {
  return db.prepare("SELECT * FROM relay_requests WHERE request_id = ?").bind(requestId).first<RelayRequestRow>();
}

export async function setRelayMessageId(db: D1Database, requestId: string, messageId: number): Promise<void> {
  await db.prepare("UPDATE relay_requests SET tg_message_id = ? WHERE request_id = ?").bind(messageId, requestId).run();
}

export async function resolveRelayRequest(db: D1Database, requestId: string, status: "allow" | "deny", now: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE relay_requests SET status = ? WHERE request_id = ? AND status = 'pending' AND expires_at > ?")
    .bind(status, requestId, now)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function countPendingRelay(db: D1Database, userId: string, now: number): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM relay_requests WHERE user_id = ? AND status = 'pending' AND expires_at > ?")
    .bind(userId, now)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
