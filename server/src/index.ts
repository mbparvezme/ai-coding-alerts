/**
 * AI Coding Alerts — licensing backend (Cloudflare Worker).
 * Design: ../docs/superpowers/specs/2026-07-22-licensing-backend-design.md
 */
import { importSigningKey } from "./lib/jwt";
import { generateLicenseKey } from "./license/keygen";
import { noopDeliverer } from "./license/deliver";
import { handlePaddleWebhook } from "./handlers/webhook";
import { handleActivate, type LicenseDeps } from "./handlers/activate";
import { handleValidate } from "./handlers/validate";
import { handleDeactivate } from "./handlers/deactivate";
import { handleSuccessPage } from "./handlers/successPage";

export interface Env {
  DB: D1Database;
  PADDLE_WEBHOOK_SECRET: string;
  LICENSE_SIGNING_PRIVATE_KEY: string;
}

// Ed25519 key import is cheap but do it once per isolate.
let signingKeyPromise: Promise<CryptoKey> | null = null;
function getSigningKey(env: Env): Promise<CryptoKey> {
  if (!signingKeyPromise) signingKeyPromise = importSigningKey(env.LICENSE_SIGNING_PRIVATE_KEY);
  return signingKeyPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (route === "POST /webhooks/paddle") {
      return handlePaddleWebhook(request, {
        db: env.DB,
        webhookSecret: env.PADDLE_WEBHOOK_SECRET,
        deliver: noopDeliverer, // v1: success page delivers; swap to CloudflareEmailDeliverer when a domain exists
        now: () => Date.now(),
        newKey: generateLicenseKey
      });
    }

    if (route === "GET /license") {
      return handleSuccessPage(url, env.DB);
    }

    const licenseDeps: LicenseDeps = { db: env.DB, signingKey: await getSigningKey(env), now: () => Date.now() };
    if (route === "POST /license/activate") return handleActivate(request, licenseDeps);
    if (route === "POST /license/validate") return handleValidate(request, licenseDeps);
    if (route === "POST /license/deactivate") return handleDeactivate(request, licenseDeps);

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
