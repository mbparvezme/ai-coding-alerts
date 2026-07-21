# AI Coding Alerts — Licensing Backend

Cloudflare Worker + D1 that turns a Paddle subscription into a verifiable Pro license
for the AI Coding Alerts VS Code extension. **Deployed and versioned independently of the
extension** — it only shares an HTTP contract (see the design doc).

- **Design & contract:** [`../docs/superpowers/specs/2026-07-22-licensing-backend-design.md`](../docs/superpowers/specs/2026-07-22-licensing-backend-design.md)
- **Status:** scaffold only — endpoints in `src/index.ts` return `501` until implemented.

## Layout
```
server/
├─ src/index.ts     Worker entry (routes stubbed)
├─ schema.sql       D1 tables (licenses, activations)
├─ wrangler.toml    Worker + D1 binding config
├─ .dev.vars.example  Local secrets template
└─ test/            Vitest (workers pool)
```

## Getting started (in the implementation conversation)
```bash
cd server
npm install
wrangler d1 create ai-coding-alerts        # paste the id into wrangler.toml
npm run db:apply:local                      # create tables locally
cp .dev.vars.example .dev.vars              # fill in secrets for local dev
npm run dev                                 # http://localhost:8787
```

## Endpoints (to implement — see spec §4.1)
| Route | Purpose |
|---|---|
| `POST /webhooks/paddle` | Verify signature; upsert license; generate key on new subscription |
| `GET  /license?txn=…` | Success page showing the buyer's key |
| `POST /license/activate` | Activate a device; return a signed token |
| `POST /license/validate` | Periodic re-check; fresh token + status |
| `POST /license/deactivate` | Free a device slot |

Secrets: `PADDLE_WEBHOOK_SECRET`, `LICENSE_SIGNING_PRIVATE_KEY` (never commit values).
