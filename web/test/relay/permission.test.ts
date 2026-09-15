import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, makeTestKeypair } from "../helpers";
import { signLicenseToken } from "../../src/server/lib/jwt";
import { handleRelayPermission } from "../../src/server/handlers/relayPermission";

let deps: any, signingKey: CryptoKey, sent: any[];
beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS relay_requests; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS users");
  await applySchema(env.DB);
  await env.DB.prepare("INSERT INTO users (id, github_id, created_at, updated_at) VALUES ('acct_1', 1, 0, 0)").run();
  const kp = await makeTestKeypair();
  signingKey = kp.signingKey;
  sent = [];
  const telegram = {
    sendMessage: async (chatId: string, text: string, keyboard: any) => { sent.push({ chatId, text, keyboard }); return { message_id: 77 }; },
    editMessageText: async () => {},
    answerCallbackQuery: async () => {}
  };
  deps = { db: env.DB, verifyKey: kp.publicKey, now: () => 1000, telegram, genRequestId: () => "req_1", maxPending: 5 };
});
const auth = async () => `Bearer ${await signLicenseToken({ sub: "acct_1", deviceId: "d1", status: "active", plan: "monthly", iat: 0, exp: 9_999_999 }, signingKey)}`;
const call = async (body: any) => handleRelayPermission(new Request("http://t/relay/permission", { method: "POST", headers: { Authorization: await auth() }, body: JSON.stringify(body) }), deps);

describe("relay permission", () => {
  it("409 when the account has no Telegram link", async () => {
    const res = await call({ tool: "Bash", command: "npm test", ttlSec: 300 });
    expect(res.status).toBe(409);
    expect((await res.json<any>()).error).toBe("not_linked");
  });

  it("creates a pending request and sends a two-button message when linked", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES ('acct_1', '555', 0)").run();
    const res = await call({ tool: "Bash", command: "npm test", ttlSec: 300 });
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, requestId: "req_1", expiresAt: 1000 + 300_000 });
    expect(sent[0].chatId).toBe("555");
    expect(sent[0].keyboard[0].map((b: any) => b.callback_data)).toEqual(["v1:req_1:approve", "v1:req_1:deny"]);
    const row = await env.DB.prepare("SELECT status, tg_message_id FROM relay_requests WHERE request_id = 'req_1'").first<any>();
    expect(row).toEqual({ status: "pending", tg_message_id: 77 });
  });

  it("is fail-safe when the Telegram send throws (200, row stays pending, no message id)", async () => {
    await env.DB.prepare("INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES ('acct_1', '555', 0)").run();
    deps.telegram.sendMessage = async () => { throw new Error("telegram down"); };
    const res = await call({ tool: "Bash", command: "npm test", ttlSec: 300 });
    const body = await res.json<any>();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.requestId).toBe("req_1");
    const row = await env.DB.prepare("SELECT status, tg_message_id FROM relay_requests WHERE request_id = 'req_1'").first<any>();
    expect(row).toEqual({ status: "pending", tg_message_id: null });
  });
});
