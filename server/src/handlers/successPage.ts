import * as repo from "../license/repository";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function page(inner: string, autoRefresh: boolean, status = 200): Response {
  const refresh = autoRefresh ? '<meta http-equiv="refresh" content="4">' : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh}
<title>AI Coding Alerts — Pro License</title>
<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1f2430}
.key{font-family:ui-monospace,monospace;font-size:1.25rem;background:#f2f3f7;border:1px solid #d9dce4;border-radius:.5rem;padding:1rem;text-align:center;letter-spacing:.05em}
h1{font-size:1.4rem}.muted{color:#6b7280}</style></head><body>${inner}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function handleSuccessPage(url: URL, db: D1Database): Promise<Response> {
  const txn = url.searchParams.get("txn");
  if (!txn) {
    return page(`<h1>Missing transaction</h1><p class="muted">No transaction id in the link.</p>`, false, 400);
  }
  const license = await repo.getLicenseByTransaction(db, txn);
  if (!license) {
    return page(
      `<h1>Your license is being generated…</h1>
       <p class="muted">This can take a few seconds after payment. This page refreshes automatically.</p>`,
      true
    );
  }
  return page(
    `<h1>You're Pro! 🎉</h1>
     <p>Your AI Coding Alerts license key:</p>
     <div class="key">${escapeHtml(license.license_key)}</div>
     <p class="muted">In VS Code, run <strong>“AI Coding Alerts: Enter Pro License”</strong> and paste this key. Keep it safe — treat it like a password.</p>`,
    false
  );
}
