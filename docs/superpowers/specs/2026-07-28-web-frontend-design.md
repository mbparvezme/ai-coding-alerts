# Web Frontend — Design (Sub-project #2: Marketing Site + Dashboard + Checkout)

> Date: 2026-07-28
> Status: proposed (awaiting user review)
> Repo: `D:\ai-coding-alerts` — the `web/` Next.js-on-Cloudflare app
> Precedes: `writing-plans` (implementation plan)

## 1. Purpose & success criteria

Sub-project #1 (accounts/auth backend) is built, merged, and deployed (API-only:
six route handlers + a placeholder `page.tsx`). This sub-project puts a **face** on it.

Two outcomes define success:

1. **Pro becomes sellable.** A visitor can understand the product, sign in with GitHub,
   and complete an **inline Paddle checkout** that carries `custom_data.accountId`, so the
   existing webhook links the payment to their account and they become Pro.
2. **Users get a real dashboard.** A signed-in user can see their plan, manage billing,
   manage devices, and see settings-sync status.

The public page is a **single-page, conversion-focused site** — minimal, dark-first,
developer-native. If a visitor can't grasp "what is this" in seconds, they won't pay; the
page's entire job is comprehension → free install → upgrade.

## 2. Scope

**In scope**
- Public one-page marketing site (nav → hero → problem → how → features → free/Pro → pricing → FAQ → final CTA → footer)
- GitHub sign-in surface (reuses the existing Auth.js config — already working)
- Authenticated dashboard (5 cards: account, subscription, devices, settings-sync, sign-out)
- **Inline Paddle checkout** wired with `custom_data.accountId`
- Design system: HeroUI + Tailwind, dark-first, brand palette below

**Out of scope (later / other sub-projects)**
- Multi-page marketing (blog, docs) — one page only for now
- Building any billing UI we can hand to Paddle's customer portal (cancel/card/invoices)
- Extension-side settings-sync wiring (that is sub-project #3; the dashboard shows read-only status until then)
- Managed-bot (#4) and DIY two-way bot (#3) *implementation* — this site *markets* them. The
  extension itself is already public (v0.7.0, one-way notifications), but **the site's copy must
  not claim #3/#4 features until a version shipping them is published**, or it overpromises.

## 3. Architecture

- **Framework:** existing Next.js (App Router) app in `web/`, deployed to Cloudflare Workers
  via `@opennextjs/cloudflare`. No new backend — the six API routes and Auth.js session already exist.
- **UI library:** **HeroUI** (Tailwind-native, distinctive look, accessible components we own),
  optionally borrowing one or two **Aceternity/Magic UI** motion effects on the hero. Chosen over
  shadcn/ui specifically to avoid the generic "stock template" look.
- **Styling:** Tailwind CSS; theme tokens (below) as CSS variables so color is set once.
- **Rendering:** landing page is static/server-rendered (fast first paint = conversion).
  Dashboard is a **protected server component** — reads the Auth.js session; unauthenticated
  visitors are redirected to sign-in.
- **Checkout:** Paddle.js (Billing) loaded client-side on the pricing section only.

### Component boundaries
- `app/page.tsx` → landing page, composed of section components (`components/landing/*`).
- `app/(dashboard)/account/page.tsx` → protected dashboard, composed of card components (`components/dashboard/*`).
- `components/checkout/InlineCheckout.tsx` → owns the Paddle.js lifecycle; takes `{ priceId, accountId }`, renders the embedded checkout, reports success/failure. It is the only place that touches Paddle.js.
- Each card/section is independently understandable: given its props, you know what it renders and which API it calls, without reading siblings.

## 4. Design system

- **Base:** HeroUI (+ Tailwind). Dark-first (library handles dark/light; we commit to dark).
- **Palette**
  - Primary (brand + most CTAs): **Amber `#F59E0B`**
  - Secondary (from the extension icon): **Indigo `#5B5BE6`**
  - Urgent accent (sparing — pulse, "limited" badge): **Vermilion `#FF4D2E`**
  - Success (active/checkmarks): **Emerald `#10B981`**
  - Ground `#0B0B12` · Surface `#16161F` · Border `#24242F`
  - Text `#F4F4F6` · Muted `#8A8A99`
- **Rationale:** an *alert*-colored primary (amber) is on-brand (it's the notification-dot color)
  and breaks from the blue/indigo every dev tool defaults to. Amber is used broadly; vermilion is
  reserved for rare urgency so it keeps its punch.
- **Logo:** none yet — use the extension icon at `media/icon.png` for now.
- **Type:** system sans for body; a monospace accent for code/numbers (developer-native feel).

## 5. Copy anchors (locked)

Hero value line (both pricing cards share the benefit, only cadence changes):
- **Monthly ($3.89/mo):** *Never babysit your AI coding agent — under $1 a week.*
- **Annual ($36/yr):** *Never babysit your AI coding agent — under 10¢ a day.*
- Annual card badge: **"Save 23% — over 2 months free"**, "most popular".

Full section copy (hero subhead, problem, features, FAQ) is written during the build. Final copy
must be truthful — see §9 content facts.

## 6. Landing page — section structure

1. **Sticky nav** — icon + name · Features/Pricing anchors · **"Add to VS Code — Free"** (primary, amber, persistent) · "Sign in".
2. **Hero** — headline value line + subhead + primary CTA **"Add to VS Code — Free"** + secondary "See Pricing ↓" + trust microcopy (free forever · no card · works with your setup).
3. **Problem** — the babysitting / context-switching pain, made specific.
4. **How it works** — 3 steps (install → connect alerts → walk away).
5. **Features** — benefit-led, each tagged Free or Pro.
6. **Free vs Pro** — comparison table framing Pro as *convenience, not paywall*.
7. **Pricing** — monthly + annual cards; **inline Paddle checkout**; "Start Pro" per card.
8. **FAQ** — objection handling (privacy, which tools, cancel, is-free-a-trial, security).
9. **Final CTA** — restate transformation + **"Add to VS Code — Free"**.
10. **Footer** — links, ©, legal.

**CTA hierarchy:** free install is the primary top-of-funnel action (nav, hero, final CTA);
"Start Pro" is the conversion, concentrated in the pricing section.

## 7. Purchase flow (the money path)

1. User clicks **"Start Pro"** (monthly or annual) in the pricing section.
2. If **not signed in** → GitHub sign-in first. We must hold the `accountId` before checkout,
   or the payment cannot be linked to the account.
3. **Inline Paddle checkout** renders in the pricing section, opened with:
   - `items: [{ priceId, quantity: 1 }]`
   - `customData: { accountId: <users.id from session> }`
   - `customer: { email }` prefilled from the session where available.
4. On **success** → redirect to the **dashboard**, which will show "Pro active" once the
   webhook has recorded the subscription (see note).

**Webhook timing note:** entitlement is authoritative via the existing
`/api/webhooks/paddle` → `subscriptions` row. The dashboard reads subscription state on load;
if the webhook hasn't landed within a second or two, the dashboard shows a brief "activating…"
state and re-checks. (Do **not** grant Pro purely from a client-side checkout "success" event —
the webhook is the source of truth.)

### Paddle specifics
- **Environment: sandbox first.** Wire and test entirely in Paddle **sandbox**, then swap to
  live at go-live. Sandbox and live price IDs / client tokens are different objects.
- **Price IDs (supplied — confirm environment):**
  - Monthly `pri_01kymh3e8seggz1xc3e163xwp7`
  - Annual `pri_01kymh404r1avf25hk1zny63xy`
- **Client-side token** (Paddle → Developer Tools → Authentication) — public value, needed to
  initialize Paddle.js. Store as a public env/config; set environment flag to sandbox/production.
- The webhook, HMAC verification, and `custom_data.accountId` linkage already exist from #1 and
  are unchanged.

## 8. Dashboard (`/account`, protected)

Server component; redirects to sign-in if no session. Five parts:

1. **Account header** — avatar + GitHub name/email + a **Free / Pro** badge (from subscription state).
2. **Subscription card** — status, plan, renewal/expiry.
   - Free → **"Upgrade to Pro"** (routes to pricing/checkout).
   - Pro → **"Manage billing"** → **Paddle customer portal** (cancel, update card, invoices — hosted by Paddle, we build none of it).
3. **Devices card** — lists active devices (≤3) with last-seen; **Deactivate** per device
   (calls existing `POST /api/auth/deactivate`) so users can free a slot at the 3-device limit.
4. **Settings-sync card** — last backup time + restore action (the free carrot), reading
   `GET /api/settings-backup`. Read-only status until extension wiring lands in #3.
5. **Sign out.**

Backend endpoints consumed (all already exist): `auth()` session, subscription/device/backup
reads via the account repository, `POST /api/auth/deactivate`, `GET/PUT /api/settings-backup`.
A small read helper may be added to surface device/subscription rows to the dashboard.

## 9. Content facts to confirm (before copy is finalized)

These gate truthful copy; not needed to start the build, but required before the site goes live:
- **(a) Which AI tools / events actually trigger an alert** — for the hero, features, FAQ, and SEO keywords.
- **(b) Exactly what data leaves the machine** — for the privacy claims, which must be airtight.
- **(c) Marketplace URL — RESOLVED.** Extension is already live (v0.7.0). Public install page:
  `https://marketplace.visualstudio.com/items?itemName=mbparvezme.ai-coding-alerts`; the
  "Add to VS Code" button uses this, optionally with the `vscode:extension/mbparvezme.ai-coding-alerts`
  deep link for one-click install. (The publisher-management hub URL is private and not usable here.)

## 10. Error handling

- **Not signed in at checkout** → route through GitHub sign-in, return to pricing, resume.
- **Checkout closed/failed** → return to pricing card, no state change, allow retry.
- **Checkout success but webhook lag** → dashboard "activating…" + re-check; never grant Pro from the client success event alone.
- **Device limit (409)** already surfaced by the backend → dashboard devices card explains and offers deactivate.
- **Session expired on dashboard** → redirect to sign-in.
- **Settings-backup empty/oversize** → dashboard shows empty/last-known state gracefully.

## 11. Testing

- **Component/unit:** section and card components render expected states (free vs pro, empty devices, no backup) via the existing Vitest setup.
- **Checkout wiring:** unit-test that `InlineCheckout` is invoked with the correct `priceId` and
  `customData.accountId` from the session (mock Paddle.js — do not hit Paddle in tests).
- **Dashboard gating:** unauthenticated request to `/account` redirects to sign-in.
- **Manual sandbox E2E** (from the deployment checklist): real sandbox purchase → webhook →
  `subscriptions` row → dashboard flips to Pro; device deactivate; settings backup round-trip.
- Keep the existing 34 web tests green; typecheck clean.

## 12. Inputs still needed from the user

- Confirm the **price IDs are sandbox** (or provide sandbox equivalents).
- **Paddle client-side token** (sandbox).
- **Paddle customer-portal** link/config for the "Manage billing" button.
- Later: the two content facts (§9a, §9b).

## 13. Open decisions (none blocking)

- Whether the hero uses an Aceternity/Magic UI motion effect or stays fully static (decide during build).
- Exact monospace face for numeric accents.
