/**
 * AI Coding Alerts — licensing backend (Cloudflare Worker).
 *
 * Design & contract: ../docs/superpowers/specs/2026-07-22-licensing-backend-design.md
 *
 * This is a scaffold: routes are wired but not yet implemented. Build them in the
 * dedicated implementation conversation, test-first (Vitest + workers pool).
 */

export interface Env {
  DB: D1Database;
  PADDLE_WEBHOOK_SECRET: string;
  LICENSE_SIGNING_PRIVATE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case "POST /webhooks/paddle":
        // Verify Paddle signature; on subscription events upsert a license row,
        // generating a license key on creation. Spec §4.1, §4.5.
        return notImplemented("paddle webhook");

      case "GET /license":
        // Post-checkout success page: show the buyer their key for ?txn=. Spec §4.1.
        return notImplemented("license success page");

      case "POST /license/activate":
        // { licenseKey, deviceId } -> check status + device_limit, record activation,
        // return a signed token (TTL 7d). Spec §4.1, §4.4.
        return notImplemented("activate");

      case "POST /license/validate":
        // Periodic re-check -> fresh signed token + current status. Spec §4.1.
        return notImplemented("validate");

      case "POST /license/deactivate":
        // { licenseKey, deviceId } -> free a device slot. Spec §4.1.
        return notImplemented("deactivate");

      default:
        return new Response("Not found", { status: 404 });
    }
  }
} satisfies ExportedHandler<Env>;

function notImplemented(route: string): Response {
  return Response.json({ ok: false, error: "not_implemented", route }, { status: 501 });
}
