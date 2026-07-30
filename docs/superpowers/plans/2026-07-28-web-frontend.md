# Web Frontend Implementation Plan (Sub-project #2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public one-page marketing site + a protected account dashboard + an inline Paddle checkout on top of the existing `web/` accounts backend, so Pro becomes sellable.

**Architecture:** Extend the existing Next.js (App Router) app in `web/` — no new backend. The landing page is server-rendered; the dashboard is a session-authed protected route; checkout is Paddle.js inline, carrying `custom_data.accountId`. Entitlement stays webhook-driven (already built). UI is HeroUI v3 on Tailwind v4, dark-first, driven by a single brand-token block.

**Tech Stack:** Next.js 15 / React 19, HeroUI v3.2.2, Tailwind CSS v4.3.0 (CSS-first), next-themes, `@paddle/paddle-js`, Auth.js v5 (existing), Cloudflare Workers via `@opennextjs/cloudflare`, Vitest (Workers pool + a new jsdom project).

## Global Constraints

*Every task's requirements implicitly include this section.*

- **Repo/branch:** all work in `D:\ai-coding-alerts`, `web/` app, on branch `feature/web-frontend` (already checked out). Session cwd (`easyhi.re`) is a different, unrelated project — never touch it.
- **Versions (no compromise):** `tailwindcss@^4.3.0`, `@heroui/react@^3.2.2`, latest `@paddle/paddle-js`. Node 24 (matches CI).
- **Single source of color:** every brand color is defined once, as CSS custom properties in `src/app/globals.css` (`--brand-*`). Bridge to Tailwind via `@theme inline`; remap HeroUI semantic tokens to the same brand vars. Components use semantic utilities (`bg-primary`, `text-muted`, …) — **never a raw hex** in component markup. Changing `--brand-primary` recolors the whole app.
- **Dark-first:** app forced to dark for v1 (no toggle). `<html className="dark" data-theme="dark">`.
- **Palette:** primary Amber `#F59E0B` (fg `#1A1200`); secondary Indigo `#5B5BE6`; urgent accent Vermilion `#FF4D2E`; success Emerald `#10B981`; ground `#0B0B12`; surface `#16161F`; border `#24242F`; text `#F4F4F6`; muted `#8A8A99`.
- **Locked hero line** (both pricing cards share the benefit): *"Never babysit your AI coding agent — under $1 a week"* (monthly), *"…under 10¢ a day"* (annual). Prices: monthly **$3.89/mo**, annual **$36/yr** ("Save 23% — over 2 months free", most-popular).
- **Do not claim #3/#4 features as available** in copy (managed bot, two-way action bot). Extension is live at v0.7.0 (one-way notifications only).
- **Dashboard is session-authed** (Auth.js `session.accountId`), NOT GitHub-token authed. Never reuse `/api/auth/*` routes for the dashboard; use server actions authorized on `session.accountId`.
- **Webhook is the source of truth for Pro.** Never grant Pro from a client-side checkout "success" event.
- **Paddle: sandbox first.** Environment + client token + price IDs are environment-specific.
- **Price IDs:** monthly `pri_01kymh3e8seggz1xc3e163xwp7`, annual `pri_01kymh404r1avf25hk1zny63xy`.
- **Marketplace:** `https://marketplace.visualstudio.com/items?itemName=mbparvezme.ai-coding-alerts`; deep link `vscode:extension/mbparvezme.ai-coding-alerts`.
- **Tests:** `npm test` runs both Vitest projects; existing 34 Workers tests stay green; `npm run typecheck` clean; `npm run build` (OpenNext) succeeds. TDD, frequent commits, DRY, YAGNI.

## File Structure

**Setup / config**
- `web/postcss.config.mjs` (create) — Tailwind v4 PostCSS plugin.
- `web/src/app/globals.css` (create) — Tailwind + HeroUI imports; the single brand-token block.
- `web/src/app/providers.tsx` (create) — client providers (next-themes, forced dark).
- `web/src/app/layout.tsx` (modify) — import globals, force dark, wrap in providers.
- `web/vitest.workers.config.ts` (rename from `vitest.config.ts`) — server tests, Workers pool.
- `web/vitest.ui.config.ts` (create) — jsdom project for UI/logic tests.
- `web/vitest.workspace.ts` (create) — ties both projects together.
- `web/vitest.setup.ui.ts` (create) — `@testing-library/jest-dom` matchers.
- `web/.env.example` (create) — `NEXT_PUBLIC_PADDLE_*` (public, build-time).

**Config modules (pure)**
- `web/src/config/links.ts` — Marketplace URL + deep link.
- `web/src/config/paddle.ts` — price IDs + environment/token readers.
- `web/src/config/copy.ts` — locked marketing copy strings.
- `web/src/checkout/options.ts` — `buildCheckoutOptions()` (pure).

**Landing**
- `web/src/components/landing/Nav.tsx`, `Hero.tsx`, `Problem.tsx`, `HowItWorks.tsx`, `Features.tsx`, `FreeVsPro.tsx`, `Pricing.tsx`, `Faq.tsx`, `FinalCta.tsx`, `Footer.tsx`
- `web/src/components/checkout/InlineCheckout.tsx` (client) — the only file touching Paddle.js.
- `web/src/app/page.tsx` (replace placeholder) — assembles the landing sections.
- `web/src/app/auth-actions.ts` — `signInWithGithub`, `signOutAction` server actions.

**Dashboard**
- `web/src/server/account/repository.ts` (modify) — add `DeviceRow`, `listDevices`, `getSettingsBackupMeta`.
- `web/src/server/dashboard/loader.ts` — `getDashboardData()`.
- `web/src/server/dashboard/guard.ts` — `requireAccountId()` (pure guard signal).
- `web/src/server/dashboard/activation.ts` — `activationState()` (pure).
- `web/src/app/(dashboard)/account/actions.ts` — `deactivateDeviceAction`.
- `web/src/app/(dashboard)/account/page.tsx` — protected dashboard.
- `web/src/components/dashboard/AccountHeader.tsx`, `SubscriptionCard.tsx`, `DevicesCard.tsx`, `SettingsSyncCard.tsx`, `SignOutButton.tsx`, `ActivatingBanner.tsx`

**Billing portal (Task 7, separable)**
- `web/src/server/paddle/portal.ts` — `buildPortalSessionRequest()`, `parsePortalSessionResponse()` (pure).
- `web/src/app/(dashboard)/account/actions.ts` (modify) — `openBillingPortalAction`.

---

## Task 1: Toolchain + design-system foundation

Stand up Tailwind v4 + HeroUI v3, the single brand-token block, forced-dark providers, and the second (jsdom) Vitest project. Deliverable: the app renders a HeroUI Button on the dark ground using brand tokens, and a jsdom smoke test passes.

**Files:**
- Create: `web/postcss.config.mjs`, `web/src/app/globals.css`, `web/src/app/providers.tsx`, `web/vitest.ui.config.ts`, `web/vitest.workspace.ts`, `web/vitest.setup.ui.ts`
- Rename: `web/vitest.config.ts` → `web/vitest.workers.config.ts`
- Modify: `web/src/app/layout.tsx`, `web/package.json`
- Test: `web/src/app/theme-smoke.ui.test.tsx`

**Interfaces:**
- Produces: brand tokens (`--brand-primary` … in `globals.css`); Tailwind utilities `bg-primary`, `text-primary`, `bg-ground`, `bg-surface`, `text-muted`, `border-border`, `text-urgent`, `text-success`; a jsdom Vitest project keyed on `*.ui.test.ts(x)`.

- [ ] **Step 1: Install dependencies**

Run (in `web/`):
```bash
npm install @heroui/react@^3.2.2 next-themes @paddle/paddle-js
npm install -D tailwindcss@^4.3.0 @tailwindcss/postcss @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```
If HeroUI v3 lists `@heroui/styles` or `framer-motion` as separate peers during install, install those too (follow the install output). Verify versions:
```bash
npm ls @heroui/react tailwindcss
```
Expected: `@heroui/react@3.2.x`, `tailwindcss@4.3.x`.

- [ ] **Step 2: Add the Tailwind v4 PostCSS config**

Create `web/postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 3: Create `globals.css` with imports + the single brand-token block**

Create `web/src/app/globals.css`:
```css
@import "tailwindcss";
@import "@heroui/styles";

/*
  SINGLE SOURCE OF TRUTH for brand color. Change a value here and it updates the
  whole app: Tailwind utilities (via @theme inline) AND HeroUI components (via the
  remapped semantic tokens). Never hardcode a brand hex anywhere else.
*/
:root,
.dark,
[data-theme="dark"] {
  /* Brand primitives */
  --brand-primary: #f59e0b;
  --brand-primary-foreground: #1a1200;
  --brand-secondary: #5b5be6;
  --brand-accent: #ff4d2e;   /* vermilion — sparing urgency */
  --brand-success: #10b981;
  --brand-ground: #0b0b12;
  --brand-surface: #16161f;
  --brand-border: #24242f;
  --brand-text: #f4f4f6;
  --brand-muted: #8a8a99;

  /* Remap HeroUI v3 semantic tokens to the brand primitives.
     NOTE: confirm these token names against the installed @heroui/styles theme
     (HeroUI v3 uses --background/--foreground/--surface/--primary/--accent/
     --success/--muted/--border/--focus/--link). Adjust keys if the installed
     version differs; values must all point at --brand-* vars. */
  --background: var(--brand-ground);
  --foreground: var(--brand-text);
  --surface: var(--brand-surface);
  --surface-foreground: var(--brand-text);
  --primary: var(--brand-primary);
  --primary-foreground: var(--brand-primary-foreground);
  --accent: var(--brand-accent);
  --success: var(--brand-success);
  --muted: var(--brand-muted);
  --border: var(--brand-border);
  --focus: var(--brand-primary);
  --link: var(--brand-primary);
}

/* Bridge brand primitives to Tailwind utility colors (bg-primary, text-muted, …). */
@theme inline {
  --color-primary: var(--brand-primary);
  --color-primary-foreground: var(--brand-primary-foreground);
  --color-secondary: var(--brand-secondary);
  --color-accent: var(--brand-accent);
  --color-success: var(--brand-success);
  --color-ground: var(--brand-ground);
  --color-surface: var(--brand-surface);
  --color-border: var(--brand-border);
  --color-text: var(--brand-text);
  --color-muted: var(--brand-muted);
}

html, body {
  background: var(--brand-ground);
  color: var(--brand-text);
}
```

- [ ] **Step 4: Create the providers (forced dark)**

Create `web/src/app/providers.tsx`:
```tsx
"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Dark-first for v1: force dark, no toggle. attribute="class" so HeroUI/Tailwind see `.dark`.
  return (
    <ThemeProvider attribute="class" forcedTheme="dark">
      {children}
    </ThemeProvider>
  );
}
```
> If HeroUI v3 components that navigate or render overlays (Dropdown, Modal) misbehave, wrap the tree with `HeroUIProvider` from `@heroui/react` per the installed version's Next.js quickstart. The next-themes provider above is sufficient for static/presentational components.

- [ ] **Step 5: Wire layout — import globals, force dark, use providers**

Replace `web/src/app/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "AI Coding Alerts — Know the instant your AI agent needs you",
  description:
    "Stop babysitting your AI coding agent. Get instant phone alerts and approve or deny its actions from anywhere. Free with your own bot. Pro from under $1/week.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Split Vitest into two projects**

Rename `web/vitest.config.ts` → `web/vitest.workers.config.ts` and add a `name` and an exclude so it ignores UI tests. The file becomes:
```ts
import path from "node:path";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    name: "workers",
    exclude: ["**/node_modules/**", "**/*.ui.test.{ts,tsx}"],
    poolOptions: {
      workers: {
        main: "./src/server/lib/jwt.ts",
        miniflare: {
          compatibilityDate: "2024-09-23",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            PADDLE_WEBHOOK_SECRET: "whsec_test",
            LICENSE_SIGNING_PRIVATE_KEY: "TEST_ONLY_REPLACED_AT_RUNTIME",
          },
        },
      },
    },
  },
});
```

Create `web/vitest.ui.config.ts`:
```ts
import path from "node:path";
import { defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineProject({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.ui.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ui.ts"],
  },
});
```

Create `web/vitest.setup.ui.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Create `web/vitest.workspace.ts`:
```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["./vitest.workers.config.ts", "./vitest.ui.config.ts"]);
```

- [ ] **Step 7: Write the failing smoke test**

Create `web/src/app/theme-smoke.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Button } from "@heroui/react";

test("HeroUI Button renders (toolchain smoke)", () => {
  render(<Button data-testid="cta">Start Pro</Button>);
  expect(screen.getByTestId("cta")).toHaveTextContent("Start Pro");
});
```

- [ ] **Step 8: Run the UI project — verify it fails first, then passes**

Run: `npx vitest run --project ui`
Expected first run: FAIL if any config/import is wrong (fix until the failure is only "test not yet green"), then PASS once Steps 1–7 are correct. Also run the whole suite:
```bash
npm test
```
Expected: `workers` project = 34 passing (unchanged); `ui` project = 1 passing.

- [ ] **Step 9: Verify build + typecheck**

Run:
```bash
npm run typecheck && npm run build
```
Expected: typecheck clean; OpenNext build succeeds (Tailwind compiles, no missing-module errors).

- [ ] **Step 10: Commit**

```bash
git add web/package.json web/package-lock.json web/postcss.config.mjs web/src/app/globals.css web/src/app/providers.tsx web/src/app/layout.tsx web/vitest.workers.config.ts web/vitest.ui.config.ts web/vitest.workspace.ts web/vitest.setup.ui.ts web/src/app/theme-smoke.ui.test.tsx
git commit -m "feat(web): Tailwind v4 + HeroUI v3 foundation with single-source brand tokens"
```

---

## Task 2: Shared config + pure checkout-option builder

Central config for links, Paddle, and copy; and the pure, fully-tested `buildCheckoutOptions()` the checkout component will call.

**Files:**
- Create: `web/src/config/links.ts`, `web/src/config/paddle.ts`, `web/src/config/copy.ts`, `web/src/checkout/options.ts`, `web/.env.example`
- Test: `web/src/checkout/options.ui.test.ts`, `web/src/config/paddle.ui.test.ts`

**Interfaces:**
- Produces:
  - `MARKETPLACE_URL: string`, `VSCODE_DEEPLINK: string` (`links.ts`)
  - `PADDLE_PRICE_IDS: { monthly: string; yearly: string }`, `getPaddleEnv(): "sandbox" | "production"`, `getPaddleClientToken(): string` (`paddle.ts`)
  - `COPY` (`copy.ts`) — at least `COPY.hero.headline`, `COPY.pricing.monthly.valueLine`, `COPY.pricing.annual.valueLine`
  - `buildCheckoutOptions(input: { priceId: string; accountId: string; email?: string; containerClass?: string }): CheckoutOpenOptions` where `CheckoutOpenOptions = { items: {priceId: string; quantity: number}[]; customData: { accountId: string }; customer?: { email: string }; settings: { displayMode: "inline"; frameTarget: string; frameInitialHeight: number; frameStyle: string } }`

- [ ] **Step 1: Write config modules**

Create `web/src/config/links.ts`:
```ts
export const MARKETPLACE_URL =
  "https://marketplace.visualstudio.com/items?itemName=mbparvezme.ai-coding-alerts";
export const VSCODE_DEEPLINK = "vscode:extension/mbparvezme.ai-coding-alerts";
```

Create `web/src/config/paddle.ts`:
```ts
export const PADDLE_PRICE_IDS = {
  monthly: "pri_01kymh3e8seggz1xc3e163xwp7",
  yearly: "pri_01kymh404r1avf25hk1zny63xy",
} as const;

export function getPaddleEnv(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function getPaddleClientToken(): string {
  return process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
}
```

Create `web/src/config/copy.ts` (copy is centralized so wording changes never require touching components):
```ts
export const COPY = {
  hero: {
    headline: "Never babysit your AI coding agent again.",
    subhead:
      "Your agent runs for ten minutes, then quietly stops — waiting on a yes/no you didn't know it needed. AI Coding Alerts pings your phone the moment it needs you, and lets you approve or deny right from the notification.",
    trust: ["Free forever", "No credit card", "Works with your existing setup"],
  },
  pricing: {
    monthly: { price: "$3.89", cadence: "/mo", valueLine: "Never babysit your AI coding agent — under $1 a week." },
    annual: {
      price: "$36",
      cadence: "/yr",
      valueLine: "Never babysit your AI coding agent — under 10¢ a day.",
      badge: "Save 23% — over 2 months free",
      note: "Just $3/month, billed yearly.",
    },
  },
} as const;
```

Create `web/.env.example`:
```
# Public, build-time (inlined by Next). Set in web/.env.local for dev and in the
# build environment for deploy. Sandbox first.
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
```

- [ ] **Step 2: Write the failing test for `buildCheckoutOptions`**

Create `web/src/checkout/options.ui.test.ts`:
```ts
import { buildCheckoutOptions } from "./options";

test("builds inline options with price, accountId, and email", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1", email: "a@b.co" });
  expect(opts.items).toEqual([{ priceId: "pri_x", quantity: 1 }]);
  expect(opts.customData).toEqual({ accountId: "acct_1" });
  expect(opts.customer).toEqual({ email: "a@b.co" });
  expect(opts.settings.displayMode).toBe("inline");
  expect(opts.settings.frameTarget).toBe("checkout-container");
});

test("omits customer when no email", () => {
  const opts = buildCheckoutOptions({ priceId: "pri_x", accountId: "acct_1" });
  expect(opts.customer).toBeUndefined();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --project ui src/checkout/options.ui.test.ts`
Expected: FAIL — "Cannot find module './options'".

- [ ] **Step 4: Implement `buildCheckoutOptions`**

Create `web/src/checkout/options.ts`:
```ts
export interface CheckoutOpenOptions {
  items: { priceId: string; quantity: number }[];
  customData: { accountId: string };
  customer?: { email: string };
  settings: {
    displayMode: "inline";
    frameTarget: string;
    frameInitialHeight: number;
    frameStyle: string;
  };
}

export function buildCheckoutOptions(input: {
  priceId: string;
  accountId: string;
  email?: string;
  containerClass?: string;
}): CheckoutOpenOptions {
  return {
    items: [{ priceId: input.priceId, quantity: 1 }],
    customData: { accountId: input.accountId },
    ...(input.email ? { customer: { email: input.email } } : {}),
    settings: {
      displayMode: "inline",
      frameTarget: input.containerClass ?? "checkout-container",
      frameInitialHeight: 450,
      frameStyle: "background: transparent; border: none;",
    },
  };
}
```

- [ ] **Step 5: Write the failing test for paddle config invariants**

Create `web/src/config/paddle.ui.test.ts`:
```ts
import { PADDLE_PRICE_IDS, getPaddleEnv } from "./paddle";

test("price IDs are the configured Paddle prices", () => {
  expect(PADDLE_PRICE_IDS.monthly).toMatch(/^pri_/);
  expect(PADDLE_PRICE_IDS.yearly).toMatch(/^pri_/);
  expect(PADDLE_PRICE_IDS.monthly).not.toBe(PADDLE_PRICE_IDS.yearly);
});

test("defaults to sandbox", () => {
  delete process.env.NEXT_PUBLIC_PADDLE_ENV;
  expect(getPaddleEnv()).toBe("sandbox");
});
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npx vitest run --project ui src/checkout/options.ui.test.ts src/config/paddle.ui.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/config web/src/checkout web/.env.example
git commit -m "feat(web): shared config + pure inline-checkout option builder"
```

---

## Task 3: Landing page — static sections + sign-in wiring

Build every non-pricing section and assemble the landing page, replacing the placeholder `page.tsx`. Wire GitHub sign-in/out as server actions.

**Files:**
- Create: `web/src/components/landing/Nav.tsx`, `Hero.tsx`, `Problem.tsx`, `HowItWorks.tsx`, `Features.tsx`, `FreeVsPro.tsx`, `Faq.tsx`, `FinalCta.tsx`, `Footer.tsx`, `web/src/app/auth-actions.ts`
- Modify: `web/src/app/page.tsx` (replace placeholder)
- Test: `web/src/components/landing/Hero.ui.test.tsx`, `web/src/components/landing/Nav.ui.test.tsx`

**Interfaces:**
- Consumes: `MARKETPLACE_URL` (`@/config/links`), `COPY` (`@/config/copy`).
- Produces: `signInWithGithub()` and `signOutAction()` server actions (`@/app/auth-actions`); section components rendering the locked copy. `Nav` accepts `{ signedIn: boolean }`.

- [ ] **Step 1: Create the auth server actions**

Create `web/src/app/auth-actions.ts`:
```ts
"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGithub(redirectTo = "/account") {
  await signIn("github", { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
```

- [ ] **Step 2: Write the failing tests (Hero + Nav)**

Create `web/src/components/landing/Hero.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

test("hero shows the locked headline and a free-install CTA to the Marketplace", () => {
  render(<Hero />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/never babysit your ai coding agent/i);
  const cta = screen.getByRole("link", { name: /add to vs code/i });
  expect(cta).toHaveAttribute("href", expect.stringContaining("marketplace.visualstudio.com"));
});
```

Create `web/src/components/landing/Nav.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Nav } from "./Nav";

test("nav shows Sign in when signed out", () => {
  render(<Nav signedIn={false} />);
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("nav shows Dashboard when signed in", () => {
  render(<Nav signedIn={true} />);
  expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --project ui src/components/landing`
Expected: FAIL — modules `./Hero`, `./Nav` not found.

- [ ] **Step 4: Implement Hero and Nav**

Create `web/src/components/landing/Hero.tsx`:
```tsx
import { Button } from "@heroui/react";
import { MARKETPLACE_URL } from "@/config/links";
import { COPY } from "@/config/copy";

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text sm:text-5xl">{COPY.hero.headline}</h1>
      <p className="mt-6 text-lg text-muted">{COPY.hero.subhead}</p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <Button as="a" href={MARKETPLACE_URL} variant="primary" size="lg">
          Add to VS Code — Free
        </Button>
        <a href="#pricing" className="text-sm text-muted hover:text-text">See Pricing ↓</a>
      </div>
      <p className="mt-6 text-xs text-muted">{COPY.hero.trust.join("  ·  ")}</p>
    </section>
  );
}
```

Create `web/src/components/landing/Nav.tsx`:
```tsx
import { Button } from "@heroui/react";
import { MARKETPLACE_URL } from "@/config/links";
import { signInWithGithub } from "@/app/auth-actions";

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-ground/80 px-6 py-3 backdrop-blur">
      <a href="#top" className="flex items-center gap-2 font-semibold text-text">
        <img src="/icon.png" alt="" width={24} height={24} /> AI Coding Alerts
      </a>
      <div className="flex items-center gap-4 text-sm">
        <a href="#features" className="text-muted hover:text-text">Features</a>
        <a href="#pricing" className="text-muted hover:text-text">Pricing</a>
        <Button as="a" href={MARKETPLACE_URL} variant="primary" size="sm">Add to VS Code — Free</Button>
        {signedIn ? (
          <a href="/account" className="text-muted hover:text-text">Dashboard</a>
        ) : (
          <form action={signInWithGithub}>
            <button type="submit" className="text-muted hover:text-text">Sign in</button>
          </form>
        )}
      </div>
    </nav>
  );
}
```
> Copy `media/icon.png` to `web/public/icon.png` so `/icon.png` resolves: `cp ../media/icon.png public/icon.png` (from `web/`).

- [ ] **Step 5: Implement the remaining static sections**

Create the following with the section copy from the spec (dark styling, semantic tokens only, no raw hex). Each is a plain server component exporting a named function.

`web/src/components/landing/Problem.tsx`:
```tsx
export function Problem() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-2xl font-semibold text-text">The AI agent didn&apos;t get faster. Your attention did.</h2>
      <ul className="mt-6 space-y-3 text-muted">
        <li>Alt-tabbing every 30 seconds &quot;just to check&quot; — the context-switching that kills deep work.</li>
        <li>Coming back to find it finished 20 minutes ago, or stuck the whole time on a permission prompt.</li>
        <li>Losing the thread on what it was doing by the time you notice.</li>
      </ul>
      <p className="mt-6 text-text">The bottleneck stopped being the AI. It became you having to be in the room.</p>
    </section>
  );
}
```

`web/src/components/landing/HowItWorks.tsx`:
```tsx
const STEPS = [
  { n: "1", t: "Install the extension", d: "One click in VS Code." },
  { n: "2", t: "Connect your alerts", d: "Bring your own Telegram bot (free), or let us host it (Pro, zero setup)." },
  { n: "3", t: "Walk away", d: "When your agent finishes or needs a decision, your phone buzzes. Tap Approve or Deny." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">From &quot;watching it work&quot; to &quot;getting a text.&quot;</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-surface p-6">
            <div className="text-urgent font-mono text-sm">{s.n}</div>
            <div className="mt-2 font-medium text-text">{s.t}</div>
            <p className="mt-2 text-sm text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`web/src/components/landing/Features.tsx`:
```tsx
const FEATURES = [
  { t: "Approve from anywhere", d: "Your agent asks permission; you answer from your phone. Two-way control, not just a notification.", tier: "Free" },
  { t: "Zero-setup, managed alerts", d: "Skip the bot tokens. We host the relay; flip a switch and it works on every machine.", tier: "Pro" },
  { t: "Your setup, everywhere", d: "Settings and history sync automatically across every device you code on.", tier: "Pro" },
  { t: "Private by design", d: "Alerts are about events, not your code.", tier: "Free" },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Everything you need to stop watching and start shipping.</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <div className="font-medium text-text">{f.t}</div>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{f.tier}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```
> **Copy-truth guard:** the "managed alerts" / "sync" (Pro) and two-way "approve from anywhere" features describe sub-projects #3/#4, which are not shipped yet. Leave them in the design, but per Global Constraints the site must not be published until those ship. Do not add stronger claims.

`web/src/components/landing/FreeVsPro.tsx`:
```tsx
const ROWS = [
  { label: "All local alerts + two-way approve/deny", free: true, pro: true },
  { label: "Bring your own Telegram bot", free: true, pro: true },
  { label: "Managed bot — zero setup", free: false, pro: true },
  { label: "Auto cross-device sync", free: false, pro: true },
  { label: "Web dashboard", free: false, pro: true },
];

export function FreeVsPro() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Self-host it free. Or let us run it.</h2>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-4 text-left font-normal">Feature</th>
              <th className="p-4 font-normal">Free</th>
              <th className="p-4 font-normal">Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td className="p-4 text-text">{r.label}</td>
                <td className="p-4 text-center">{r.free ? <span className="text-success">✓</span> : <span className="text-muted">—</span>}</td>
                <td className="p-4 text-center">{r.pro ? <span className="text-success">✓</span> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-center text-muted">Same power. Pro just means you never touch a config file.</p>
    </section>
  );
}
```

`web/src/components/landing/Faq.tsx`:
```tsx
const QA = [
  { q: "Does it read my code?", a: "No — alerts are about events, not your source. (Exact data transmitted to be confirmed before launch.)" },
  { q: "Is the free tier a trial?", a: "No — it's free forever. Pro only adds managed hosting and sync." },
  { q: "Do I need a server or public URL?", a: "No. Free runs entirely on your machine." },
  { q: "Can I cancel anytime?", a: "Yes, one click. You keep the free tier." },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold text-text">Questions, answered.</h2>
      <div className="mt-8 space-y-4">
        {QA.map((item) => (
          <div key={item.q} className="rounded-2xl border border-border bg-surface p-6">
            <div className="font-medium text-text">{item.q}</div>
            <p className="mt-2 text-sm text-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`web/src/components/landing/FinalCta.tsx`:
```tsx
import { Button } from "@heroui/react";
import { MARKETPLACE_URL } from "@/config/links";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold text-text">Get back to the interesting part.</h2>
      <p className="mt-4 text-muted">Let the agent do the work. Let your phone do the watching.</p>
      <div className="mt-8">
        <Button as="a" href={MARKETPLACE_URL} variant="primary" size="lg">Add to VS Code — Free</Button>
      </div>
    </section>
  );
}
```

`web/src/components/landing/Footer.tsx`:
```tsx
export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10 text-center text-xs text-muted">
      © {new Date().getFullYear()} AI Coding Alerts. All rights reserved.
    </footer>
  );
}
```

- [ ] **Step 6: Assemble the landing page**

Replace `web/src/app/page.tsx` (Pricing is added in Task 4 — leave a placeholder anchor for now):
```tsx
import { auth } from "@/auth";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { FreeVsPro } from "@/components/landing/FreeVsPro";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default async function HomePage() {
  const session = await auth();
  const signedIn = Boolean((session as any)?.accountId);
  return (
    <main id="top">
      <Nav signedIn={signedIn} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <FreeVsPro />
      <section id="pricing" className="mx-auto max-w-4xl px-6 py-20" />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --project ui src/components/landing`
Expected: PASS (Hero + Nav — 3 tests).

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/landing web/src/app/page.tsx web/src/app/auth-actions.ts web/public/icon.png
git commit -m "feat(web): landing page sections + GitHub sign-in wiring"
```

---

## Task 4: Pricing section + inline Paddle checkout

Add the pricing cards and the inline Paddle checkout, gated on sign-in, carrying `custom_data.accountId`.

**Files:**
- Create: `web/src/components/landing/Pricing.tsx` (client island), `web/src/components/checkout/InlineCheckout.tsx` (client)
- Modify: `web/src/app/page.tsx` (mount `Pricing` with session props)
- Test: `web/src/components/landing/Pricing.ui.test.tsx`

**Interfaces:**
- Consumes: `buildCheckoutOptions` (`@/checkout/options`), `PADDLE_PRICE_IDS`, `getPaddleEnv`, `getPaddleClientToken` (`@/config/paddle`), `COPY` (`@/config/copy`), `signInWithGithub` (`@/app/auth-actions`).
- Produces: `Pricing({ accountId, email }: { accountId: string | null; email: string | null })`; `InlineCheckout({ priceId, accountId, email }: { priceId: string; accountId: string; email: string | null })`.

- [ ] **Step 1: Write the failing test for Pricing**

Create `web/src/components/landing/Pricing.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Pricing } from "./Pricing";

test("shows both plans with the locked value lines and prices", () => {
  render(<Pricing accountId={null} email={null} />);
  expect(screen.getByText(/under \$1 a week/i)).toBeInTheDocument();
  expect(screen.getByText(/under 10¢ a day/i)).toBeInTheDocument();
  expect(screen.getByText("$3.89")).toBeInTheDocument();
  expect(screen.getByText("$36")).toBeInTheDocument();
});

test("signed-out users see a sign-in prompt on the Start Pro buttons", () => {
  render(<Pricing accountId={null} email={null} />);
  expect(screen.getAllByRole("button", { name: /sign in to start pro/i }).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project ui src/components/landing/Pricing.ui.test.tsx`
Expected: FAIL — `./Pricing` not found.

- [ ] **Step 3: Implement InlineCheckout (Paddle.js lifecycle)**

Create `web/src/components/checkout/InlineCheckout.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useRouter } from "next/navigation";
import { buildCheckoutOptions } from "@/checkout/options";
import { getPaddleEnv, getPaddleClientToken } from "@/config/paddle";

export function InlineCheckout({
  priceId,
  accountId,
  email,
}: {
  priceId: string;
  accountId: string;
  email: string | null;
}) {
  const router = useRouter();
  const paddleRef = useRef<Paddle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initializePaddle({
      environment: getPaddleEnv(),
      token: getPaddleClientToken(),
      eventCallback: (e) => {
        if (e?.name === "checkout.completed") router.push("/account?checkout=success");
      },
    })
      .then((paddle) => {
        if (cancelled || !paddle) return;
        paddleRef.current = paddle;
        paddle.Checkout.open(buildCheckoutOptions({ priceId, accountId, email: email ?? undefined }));
      })
      .catch(() => setError("Could not load checkout. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [priceId, accountId, email, router]);

  return (
    <div>
      {error ? <p className="text-urgent text-sm">{error}</p> : null}
      <div className="checkout-container min-h-[450px]" />
    </div>
  );
}
```

- [ ] **Step 4: Implement Pricing (client island with gating)**

Create `web/src/components/landing/Pricing.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { COPY } from "@/config/copy";
import { PADDLE_PRICE_IDS } from "@/config/paddle";
import { signInWithGithub } from "@/app/auth-actions";
import { InlineCheckout } from "@/components/checkout/InlineCheckout";

export function Pricing({ accountId, email }: { accountId: string | null; email: string | null }) {
  const [active, setActive] = useState<string | null>(null);

  const plans = [
    { key: "monthly", priceId: PADDLE_PRICE_IDS.monthly, ...COPY.pricing.monthly, badge: null as string | null },
    { key: "annual", priceId: PADDLE_PRICE_IDS.yearly, ...COPY.pricing.annual },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {plans.map((p) => (
        <div key={p.key} className="rounded-2xl border border-border bg-surface p-8">
          {"badge" in p && p.badge ? (
            <span className="rounded-full bg-urgent px-2 py-0.5 text-xs text-white">{p.badge}</span>
          ) : null}
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-text">{p.price}</span>
            <span className="text-muted">{p.cadence}</span>
          </div>
          <p className="mt-3 text-muted">{p.valueLine}</p>
          <div className="mt-6">
            {accountId ? (
              <Button variant="primary" className="w-full" onPress={() => setActive(p.priceId)}>
                Start Pro
              </Button>
            ) : (
              <form action={() => signInWithGithub("/#pricing")}>
                <Button type="submit" variant="primary" className="w-full">Sign in to Start Pro</Button>
              </form>
            )}
          </div>
          {active === p.priceId && accountId ? (
            <div className="mt-6">
              <InlineCheckout priceId={p.priceId} accountId={accountId} email={email} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```
> `form action={() => signInWithGithub("/#pricing")}` calls the server action with a bound arg; if the installed Next version rejects an inline bound server action from a client form, replace with a small `"use server"` wrapper `signInToPricing()` in `auth-actions.ts` and reference it directly.

- [ ] **Step 5: Mount Pricing in the page**

In `web/src/app/page.tsx`, replace the empty `#pricing` section:
```tsx
import { Pricing } from "@/components/landing/Pricing";
// ...
const email = (session?.user?.email as string | undefined) ?? null;
const accountId = ((session as any)?.accountId as string | undefined) ?? null;
// ...
<section id="pricing" className="mx-auto max-w-4xl px-6 py-20">
  <h2 className="mb-10 text-center text-2xl font-semibold text-text">Less than you spend not-thinking-about-it.</h2>
  <Pricing accountId={accountId} email={email} />
</section>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --project ui src/components/landing/Pricing.ui.test.tsx`
Expected: PASS (2 tests). If HeroUI `Button` under jsdom needs a provider, wrap the render in a minimal `<ThemeProvider attribute="class">` in the test.

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/landing/Pricing.tsx web/src/components/checkout/InlineCheckout.tsx web/src/app/page.tsx web/src/components/landing/Pricing.ui.test.tsx
git commit -m "feat(web): pricing cards + inline Paddle checkout with accountId"
```

---

## Task 5: Dashboard data layer (repository + loader + guard + actions)

Add the session-authed reads and mutations the dashboard needs. All D1-touching code is tested in the Workers pool.

**Files:**
- Modify: `web/src/server/account/repository.ts`
- Create: `web/src/server/dashboard/loader.ts`, `web/src/server/dashboard/guard.ts`, `web/src/server/dashboard/activation.ts`, `web/src/app/(dashboard)/account/actions.ts`
- Test: `web/src/server/dashboard/loader.test.ts` (Workers), `web/src/server/dashboard/guard.ui.test.ts`, `web/src/server/dashboard/activation.ui.test.ts`

**Interfaces:**
- Produces:
  - `interface DeviceRow { user_id: string; device_id: string; activated_at: number; last_seen_at: number }`
  - `listDevices(db, userId): Promise<DeviceRow[]>`
  - `getSettingsBackupMeta(db, userId): Promise<{ updatedAt: number; bytes: number } | null>`
  - `interface DashboardData { user: UserRow; subscription: SubscriptionRow | null; devices: DeviceRow[]; backup: { updatedAt: number; bytes: number } | null }`
  - `getDashboardData(db, accountId): Promise<DashboardData | null>`
  - `requireAccountId(session: { accountId?: string } | null): string` (throws a redirect-signalling value if absent — see below)
  - `activationState(checkoutParam: string | undefined, isPro: boolean): "active" | "activating" | "none"`
  - `deactivateDeviceAction(deviceId: string): Promise<void>` (server action)

- [ ] **Step 1: Write failing Workers tests for the repository additions + loader**

Create `web/src/server/dashboard/loader.test.ts`:
```ts
import { env } from "cloudflare:test";
import { upsertUserByGithub, upsertDevice, putSettingsBackup } from "@/server/account/repository";
import { listDevices, getSettingsBackupMeta } from "@/server/account/repository";
import { getDashboardData } from "./loader";

async function seedUser() {
  const u = await upsertUserByGithub(env.DB, { githubId: 5, email: "e@x.co", name: "E", username: "e", avatarUrl: null }, 1000);
  return u.id;
}

test("listDevices returns rows for the account", async () => {
  const id = await seedUser();
  await upsertDevice(env.DB, id, "dev-a", 1000);
  await upsertDevice(env.DB, id, "dev-b", 2000);
  const devices = await listDevices(env.DB, id);
  expect(devices.map((d) => d.device_id).sort()).toEqual(["dev-a", "dev-b"]);
});

test("getSettingsBackupMeta returns size + updatedAt", async () => {
  const id = await seedUser();
  await putSettingsBackup(env.DB, id, '{"k":1}', 4242);
  const meta = await getSettingsBackupMeta(env.DB, id);
  expect(meta).toEqual({ updatedAt: 4242, bytes: 7 });
});

test("getDashboardData composes user, devices, and backup", async () => {
  const id = await seedUser();
  await upsertDevice(env.DB, id, "dev-a", 1000);
  const data = await getDashboardData(env.DB, id);
  expect(data?.user.id).toBe(id);
  expect(data?.devices).toHaveLength(1);
  expect(data?.subscription).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project workers src/server/dashboard/loader.test.ts`
Expected: FAIL — `listDevices`/`getSettingsBackupMeta`/`./loader` not found.

- [ ] **Step 3: Add repository helpers**

Append to `web/src/server/account/repository.ts`:
```ts
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
```

- [ ] **Step 4: Implement the loader**

Create `web/src/server/dashboard/loader.ts`:
```ts
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
```

- [ ] **Step 5: Run the Workers tests to verify they pass**

Run: `npx vitest run --project workers src/server/dashboard/loader.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write failing tests for the pure guard + activation helpers**

Create `web/src/server/dashboard/guard.ui.test.ts`:
```ts
import { requireAccountId, REDIRECT_TO_SIGNIN } from "./guard";

test("returns the accountId when present", () => {
  expect(requireAccountId({ accountId: "acct_1" })).toBe("acct_1");
});

test("throws the sign-in redirect signal when absent", () => {
  expect(() => requireAccountId(null)).toThrow(REDIRECT_TO_SIGNIN);
});
```

Create `web/src/server/dashboard/activation.ui.test.ts`:
```ts
import { activationState } from "./activation";

test("pro users are active regardless of query", () => {
  expect(activationState("success", true)).toBe("active");
});
test("post-checkout not-yet-pro shows activating", () => {
  expect(activationState("success", false)).toBe("activating");
});
test("default is none", () => {
  expect(activationState(undefined, false)).toBe("none");
});
```

- [ ] **Step 7: Run to verify they fail**

Run: `npx vitest run --project ui src/server/dashboard`
Expected: FAIL — `./guard`, `./activation` not found.

- [ ] **Step 8: Implement guard + activation**

Create `web/src/server/dashboard/guard.ts`:
```ts
export const REDIRECT_TO_SIGNIN = "REDIRECT_TO_SIGNIN";

// The page catches this and calls next/navigation redirect(); kept pure/testable here.
export function requireAccountId(session: { accountId?: string } | null): string {
  const id = session?.accountId;
  if (!id) throw new Error(REDIRECT_TO_SIGNIN);
  return id;
}
```

Create `web/src/server/dashboard/activation.ts`:
```ts
export function activationState(
  checkoutParam: string | undefined,
  isPro: boolean
): "active" | "activating" | "none" {
  if (isPro) return "active";
  if (checkoutParam === "success") return "activating";
  return "none";
}
```

- [ ] **Step 9: Implement the deactivate server action**

Create `web/src/app/(dashboard)/account/actions.ts`:
```ts
"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { deleteDevice } from "@/server/account/repository";

export async function deactivateDeviceAction(deviceId: string): Promise<void> {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) throw new Error("unauthorized");
  const { env } = getCloudflareContext();
  await deleteDevice(env.DB, accountId, deviceId);
  revalidatePath("/account");
}
```

- [ ] **Step 10: Run the pure tests to verify they pass**

Run: `npx vitest run --project ui src/server/dashboard`
Expected: PASS (5 tests). Then full suite: `npm test` (workers unchanged + new passing).

- [ ] **Step 11: Commit**

```bash
git add web/src/server/account/repository.ts web/src/server/dashboard web/src/app/\(dashboard\)/account/actions.ts
git commit -m "feat(web): dashboard data layer — repo reads, loader, guard, deactivate action"
```

---

## Task 6: Dashboard page + cards + activation state

Assemble the protected dashboard with all five cards and the post-checkout "activating" banner.

**Files:**
- Create: `web/src/app/(dashboard)/account/page.tsx`, `web/src/components/dashboard/AccountHeader.tsx`, `SubscriptionCard.tsx`, `DevicesCard.tsx`, `SettingsSyncCard.tsx`, `SignOutButton.tsx`, `ActivatingBanner.tsx`
- Test: `web/src/components/dashboard/SubscriptionCard.ui.test.tsx`, `web/src/components/dashboard/DevicesCard.ui.test.tsx`

**Interfaces:**
- Consumes: `getDashboardData` (`@/server/dashboard/loader`), `requireAccountId`/`REDIRECT_TO_SIGNIN` (`@/server/dashboard/guard`), `activationState` (`@/server/dashboard/activation`), `deactivateDeviceAction` (`@/app/(dashboard)/account/actions`), `signOutAction` (`@/app/auth-actions`).
- Produces: `SubscriptionCard({ subscription })`, `DevicesCard({ devices })`, `SettingsSyncCard({ backup })`, `AccountHeader({ user, isPro })`.

- [ ] **Step 1: Write failing card tests**

Create `web/src/components/dashboard/SubscriptionCard.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { SubscriptionCard } from "./SubscriptionCard";

test("free account shows Upgrade to Pro", () => {
  render(<SubscriptionCard subscription={null} />);
  expect(screen.getByRole("link", { name: /upgrade to pro/i })).toBeInTheDocument();
});

test("pro account shows the plan and Manage billing", () => {
  render(<SubscriptionCard subscription={{ paddle_subscription_id: "sub_1", user_id: "acct_1", status: "active", plan: "yearly", created_at: 1, updated_at: 1 }} />);
  expect(screen.getByText(/yearly/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
});
```

Create `web/src/components/dashboard/DevicesCard.ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { DevicesCard } from "./DevicesCard";

test("renders each device with a deactivate control", () => {
  render(<DevicesCard devices={[{ user_id: "acct_1", device_id: "dev-a", activated_at: 1, last_seen_at: 2 }]} />);
  expect(screen.getByText("dev-a")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
});

test("empty state when no devices", () => {
  render(<DevicesCard devices={[]} />);
  expect(screen.getByText(/no active devices/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --project ui src/components/dashboard`
Expected: FAIL — card modules not found.

- [ ] **Step 3: Implement the cards**

Create `web/src/components/dashboard/AccountHeader.tsx`:
```tsx
import type { UserRow } from "@/server/account/repository";

export function AccountHeader({ user, isPro }: { user: UserRow; isPro: boolean }) {
  return (
    <div className="flex items-center gap-4">
      {user.avatar_url ? <img src={user.avatar_url} alt="" width={48} height={48} className="rounded-full" /> : null}
      <div>
        <div className="font-medium text-text">{user.name ?? user.username ?? "Your account"}</div>
        <div className="text-sm text-muted">{user.email ?? ""}</div>
      </div>
      <span className={`ml-auto rounded-full px-3 py-1 text-xs ${isPro ? "bg-primary text-primary-foreground" : "border border-border text-muted"}`}>
        {isPro ? "Pro" : "Free"}
      </span>
    </div>
  );
}
```

Create `web/src/components/dashboard/SubscriptionCard.tsx`:
```tsx
import { Button } from "@heroui/react";
import type { SubscriptionRow } from "@/server/account/repository";
import { openBillingPortalAction } from "@/app/(dashboard)/account/actions";

export function SubscriptionCard({ subscription }: { subscription: SubscriptionRow | null }) {
  const isPro = subscription?.status === "active";
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Subscription</div>
      {isPro ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Plan: <span className="text-text">{subscription!.plan}</span> · Status:{" "}
            <span className="text-success">{subscription!.status}</span>
          </p>
          <form action={openBillingPortalAction} className="mt-4">
            <Button type="submit" variant="outline">Manage billing</Button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">You&apos;re on the free plan.</p>
          <Button as="a" href="/#pricing" variant="primary" className="mt-4">Upgrade to Pro</Button>
        </>
      )}
    </div>
  );
}
```
> `openBillingPortalAction` is delivered in Task 7. If executing Task 6 before Task 7, temporarily replace the `Manage billing` form with a disabled button and wire the action in Task 7. Prefer doing Task 7 immediately after 6.

Create `web/src/components/dashboard/DevicesCard.tsx`:
```tsx
import { Button } from "@heroui/react";
import type { DeviceRow } from "@/server/account/repository";
import { deactivateDeviceAction } from "@/app/(dashboard)/account/actions";

export function DevicesCard({ devices }: { devices: DeviceRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Devices <span className="text-muted">({devices.length}/3)</span></div>
      {devices.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No active devices yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {devices.map((d) => (
            <li key={d.device_id} className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm text-text">{d.device_id}</div>
                <div className="text-xs text-muted">last seen {new Date(d.last_seen_at).toLocaleDateString()}</div>
              </div>
              <form action={deactivateDeviceAction.bind(null, d.device_id)}>
                <Button type="submit" size="sm" variant="outline">Deactivate</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Create `web/src/components/dashboard/SettingsSyncCard.tsx`:
```tsx
export function SettingsSyncCard({ backup }: { backup: { updatedAt: number; bytes: number } | null }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Settings sync</div>
      {backup ? (
        <p className="mt-2 text-sm text-muted">
          Last backup: <span className="text-text">{new Date(backup.updatedAt).toLocaleString()}</span> · {backup.bytes} bytes
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">No settings backed up yet. Sign in from the extension to sync.</p>
      )}
    </div>
  );
}
```

Create `web/src/components/dashboard/SignOutButton.tsx`:
```tsx
import { Button } from "@heroui/react";
import { signOutAction } from "@/app/auth-actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost">Sign out</Button>
    </form>
  );
}
```

Create `web/src/components/dashboard/ActivatingBanner.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ActivatingBanner() {
  const router = useRouter();
  // Webhook is source of truth; poll a couple of times for it to land, then stop.
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 4) clearInterval(t);
    }, 2500);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="rounded-2xl border border-urgent/40 bg-surface p-4 text-sm text-muted">
      Payment received — activating your Pro subscription… this can take a few seconds.
    </div>
  );
}
```

- [ ] **Step 4: Implement the protected dashboard page**

Create `web/src/app/(dashboard)/account/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";
import { getDashboardData } from "@/server/dashboard/loader";
import { activationState } from "@/server/dashboard/activation";
import { AccountHeader } from "@/components/dashboard/AccountHeader";
import { SubscriptionCard } from "@/components/dashboard/SubscriptionCard";
import { DevicesCard } from "@/components/dashboard/DevicesCard";
import { SettingsSyncCard } from "@/components/dashboard/SettingsSyncCard";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { ActivatingBanner } from "@/components/dashboard/ActivatingBanner";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) redirect("/api/auth/signin");

  const { env } = getCloudflareContext();
  const data = await getDashboardData(env.DB, accountId);
  if (!data) redirect("/api/auth/signin");

  const isPro = data.subscription?.status === "active";
  const { checkout } = await searchParams;
  const banner = activationState(checkout, isPro);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Your account</h1>
        <SignOutButton />
      </div>
      {banner === "activating" ? <div className="mb-6"><ActivatingBanner /></div> : null}
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <AccountHeader user={data.user} isPro={isPro} />
        </div>
        <SubscriptionCard subscription={data.subscription} />
        <DevicesCard devices={data.devices} />
        <SettingsSyncCard backup={data.backup} />
      </div>
    </main>
  );
}
```
> `redirect("/api/auth/signin")` uses Auth.js's built-in sign-in route. If the project prefers the landing nav sign-in, redirect to `/` instead.

- [ ] **Step 5: Run the card tests to verify they pass**

Run: `npx vitest run --project ui src/components/dashboard`
Expected: PASS (4 tests). (If `SubscriptionCard` import of `openBillingPortalAction` fails because Task 7 isn't done, either do Task 7 first or use the disabled-button stub noted above.)

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/\(dashboard\) web/src/components/dashboard
git commit -m "feat(web): protected dashboard with account/subscription/devices/settings cards"
```

---

## Task 7: Billing portal handoff (Manage billing)

Generate a Paddle customer-portal session server-side and redirect to it. Separable — if deferred, hide the "Manage billing" button.

**Files:**
- Create: `web/src/server/paddle/portal.ts`
- Modify: `web/src/app/(dashboard)/account/actions.ts` (add `openBillingPortalAction`), `web/.dev.vars.example` (add `PADDLE_API_KEY`), `web/vitest.workers.config.ts` (add `PADDLE_API_KEY` test binding), `web/src/server/lib/env.ts` (add `PADDLE_API_KEY` to the env type — match the file's existing pattern)
- Test: `web/src/server/paddle/portal.ui.test.ts`

**Interfaces:**
- Produces:
  - `buildPortalSessionRequest(customerId: string, env: "sandbox" | "production", apiKey: string): { url: string; init: RequestInit }`
  - `parsePortalSessionResponse(json: unknown): string` (returns the overview URL; throws on unexpected shape)
  - `openBillingPortalAction(): Promise<void>` (server action; redirects)

- [ ] **Step 1: Write failing tests for the pure portal helpers**

Create `web/src/server/paddle/portal.ui.test.ts`:
```ts
import { buildPortalSessionRequest, parsePortalSessionResponse } from "./portal";

test("builds a sandbox portal-session request", () => {
  const { url, init } = buildPortalSessionRequest("ctm_1", "sandbox", "apikey");
  expect(url).toBe("https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer apikey");
});

test("uses production host when production", () => {
  const { url } = buildPortalSessionRequest("ctm_1", "production", "k");
  expect(url).toBe("https://api.paddle.com/customers/ctm_1/portal-sessions");
});

test("parses the overview URL", () => {
  const url = parsePortalSessionResponse({ data: { urls: { general: { overview: "https://portal/x" } } } });
  expect(url).toBe("https://portal/x");
});

test("throws on unexpected shape", () => {
  expect(() => parsePortalSessionResponse({ data: {} })).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project ui src/server/paddle/portal.ui.test.ts`
Expected: FAIL — `./portal` not found.

- [ ] **Step 3: Implement the pure helpers**

Create `web/src/server/paddle/portal.ts`:
```ts
export function buildPortalSessionRequest(
  customerId: string,
  env: "sandbox" | "production",
  apiKey: string
): { url: string; init: RequestInit } {
  const host = env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  return {
    url: `${host}/customers/${customerId}/portal-sessions`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  };
}

export function parsePortalSessionResponse(json: unknown): string {
  const overview = (json as any)?.data?.urls?.general?.overview;
  if (typeof overview !== "string") throw new Error("paddle_portal: unexpected response shape");
  return overview;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run --project ui src/server/paddle/portal.ui.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the server action**

Append to `web/src/app/(dashboard)/account/actions.ts`:
```ts
import { redirect } from "next/navigation";
import { getUserById } from "@/server/account/repository";
import { buildPortalSessionRequest, parsePortalSessionResponse } from "@/server/paddle/portal";
import { getPaddleEnv } from "@/config/paddle";

export async function openBillingPortalAction(): Promise<void> {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) throw new Error("unauthorized");
  const { env } = getCloudflareContext();
  const user = await getUserById(env.DB, accountId);
  if (!user?.paddle_customer_id) redirect("/#pricing"); // no customer yet → send to pricing
  const { url, init } = buildPortalSessionRequest(
    user.paddle_customer_id,
    getPaddleEnv(),
    (env as any).PADDLE_API_KEY as string
  );
  const res = await fetch(url, init);
  const portalUrl = parsePortalSessionResponse(await res.json());
  redirect(portalUrl);
}
```
> Note: `getPaddleEnv()` reads `NEXT_PUBLIC_PADDLE_ENV`; on the server that value is available at build/runtime. Keep sandbox until go-live.

- [ ] **Step 6: Register the new secret (config only — no value in git)**

Add `PADDLE_API_KEY=` to `web/.dev.vars.example`. Add `PADDLE_API_KEY: "pdl_test"` to the Miniflare `bindings` in `web/vitest.workers.config.ts`. Add `PADDLE_API_KEY: string` to the env interface in `web/src/server/lib/env.ts` following its existing declaration style. (At deploy: `wrangler secret put PADDLE_API_KEY` with the sandbox key.)

- [ ] **Step 7: Typecheck + build + full suite**

Run: `npm run typecheck && npm run build && npm test`
Expected: clean; build ok; all tests green.

- [ ] **Step 8: Commit**

```bash
git add web/src/server/paddle/portal.ts web/src/app/\(dashboard\)/account/actions.ts web/.dev.vars.example web/vitest.workers.config.ts web/src/server/lib/env.ts
git commit -m "feat(web): Paddle customer-portal handoff for Manage billing"
```

---

## Task 8: Full verification + sandbox E2E gate

No new features — prove the whole thing works end-to-end and record the manual sandbox checklist result.

**Files:** none (verification only), plus any small fixes surfaced.

- [ ] **Step 1: Run the complete suite**

Run (in `web/`):
```bash
npm test && npm run typecheck && npm run build
```
Expected: both Vitest projects green (34 existing + all new), typecheck clean, OpenNext build succeeds.

- [ ] **Step 2: Local smoke of the landing + dashboard**

Set `web/.env.local` (`NEXT_PUBLIC_PADDLE_ENV=sandbox`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=<sandbox token>`) and `web/.dev.vars` (the five existing secrets + `PADDLE_API_KEY` sandbox). Run `npm run dev`, then verify by hand:
- Landing renders dark, amber CTAs, all sections; nav "Add to VS Code" → Marketplace URL.
- Signed-out "Start Pro" → GitHub sign-in.
- Signed-in "Start Pro" → inline Paddle sandbox checkout appears embedded.
- `/account` while signed out → redirected to sign-in.

- [ ] **Step 3: Manual sandbox purchase E2E** (mirrors `docs/DEPLOYMENT-CHECKLIST.md` §9)

- Complete a sandbox purchase → confirm webhook wrote a `subscriptions` row (`wrangler d1 execute ai-coding-alerts --remote --command="SELECT * FROM subscriptions"`).
- Confirm the inbound webhook payload carried `data.custom_data.accountId` (matches your `users.id`).
- Dashboard flips to **Pro** after the redirect + activation poll.
- "Manage billing" opens the Paddle portal.
- Deactivate a device → row removed; `Devices (n/3)` decrements.

- [ ] **Step 4: Verify the single-source color requirement**

Temporarily change `--brand-primary` in `globals.css` to a different hex, run `npm run dev`, confirm every CTA/badge/accent shifts together, then revert. This proves the one-place theming constraint. Also grep for stray hex in components:
```bash
grep -rEn "#[0-9a-fA-F]{6}" web/src/components || echo "no raw hex in components (good)"
```
Expected: no matches in `web/src/components`.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A web/
git commit -m "chore(web): verification pass — full suite green, sandbox E2E confirmed"
```

---

## Self-Review

**Spec coverage:** §2 scope → Tasks 1–7; §3 architecture/boundaries → Tasks 1,3,4,5,6; §4 design system + theming → Task 1 (+ Task 8 Step 4 proof); §5 copy anchors → Tasks 2,3,4 (`copy.ts`, Hero, Pricing); §6 landing sections → Tasks 3,4; §7 purchase flow + Paddle specifics → Tasks 2,4 (+ Task 8 E2E); §8 dashboard (5 parts) → Tasks 5,6,7; §9 content facts → surfaced as copy guards in Task 3 (a/b still user-supplied before launch); §10 error handling → InlineCheckout error state (T4), activation banner (T6), redirects (T6), empty states (T6); §11 testing (two projects, pure-logic focus) → Task 1 setup + tests throughout; §12 inputs → `.env.example`/`.dev.vars.example` + deploy notes.

**Placeholder scan:** no "TBD/TODO/handle edge cases" left; each code step has real code. Two explicitly-flagged runtime-verifications remain by necessity (HeroUI v3 exact semantic-token names in `globals.css`; the inline bound server-action form in Pricing) — both are written with a concrete known-good default plus the exact fallback, not left open.

**Type consistency:** `DeviceRow`, `UserRow`, `SubscriptionRow` names match `repository.ts`; `getDashboardData`/`DashboardData` consistent across Tasks 5–6; `buildCheckoutOptions` signature consistent across Tasks 2 and 4; `activationState`/`requireAccountId` signatures consistent across Tasks 5–6; `deactivateDeviceAction`/`openBillingPortalAction`/`signOutAction`/`signInWithGithub` names consistent across the tasks that define and consume them.
