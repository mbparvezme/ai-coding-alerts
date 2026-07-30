"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { COPY } from "@/config/copy";
import { PADDLE_PRICE_IDS, PADDLE_DISCOUNT_ID } from "@/config/paddle";
import { MARKETPLACE_URL } from "@/config/links";
import { signInWithGithub } from "@/app/auth-actions";
import { getPaddle } from "@/checkout/paddle-client";
import { previewPromoPrices, type PromoPrice } from "@/checkout/price-preview";
import { buildCheckoutOptions } from "@/checkout/options";

type Cadence = "monthly" | "annual";

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 flex-none text-success">
      <path fill="currentColor" d="M8.1 13.3 4.8 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
    </svg>
  );
}

export function Pricing({ accountId, email }: { accountId: string | null; email: string | null }) {
  const { free, pro } = COPY.pricing;
  const [cadence, setCadence] = useState<Cadence>("annual");
  const [live, setLive] = useState<Record<string, PromoPrice> | null>(null);

  // Pull live prices (with the launch discount) from Paddle once. On any failure we keep the
  // static fallback figures from copy.ts, so the section always renders something sensible.
  useEffect(() => {
    let cancelled = false;
    getPaddle()
      .then((paddle) =>
        paddle
          ? previewPromoPrices(paddle, [PADDLE_PRICE_IDS.monthly, PADDLE_PRICE_IDS.yearly], PADDLE_DISCOUNT_ID)
          : null,
      )
      .then((prices) => {
        if (!cancelled && prices) setLive(prices);
      })
      .catch(() => {
        /* keep static fallback prices */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceId = cadence === "monthly" ? PADDLE_PRICE_IDS.monthly : PADDLE_PRICE_IDS.yearly;
  const plan = pro[cadence];
  const livePrice = live?.[priceId];
  const strike = livePrice?.strike ?? plan.strike;
  const now = livePrice?.now ?? plan.price;
  // Only show the strike + promo badge when a discount is actually applied. Live data carries a
  // `discounted` flag; before it loads we assume the launch promo is on (the fallback copy is
  // written with the discounted price) and let live data correct it if the promo has ended.
  const discounted = livePrice ? livePrice.discounted : true;

  async function startCheckout() {
    if (!accountId) return;
    const paddle = await getPaddle();
    if (!paddle) return;
    paddle.Checkout.open(
      buildCheckoutOptions({ priceId, accountId, email: email ?? undefined, discountId: PADDLE_DISCOUNT_ID }),
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Free — self-hosted. CTA points at the VS Code marketplace, not checkout. */}
      <div className="flex flex-col rounded-2xl border border-border bg-surface p-8">
        <div className="text-lg font-semibold text-text">{free.name}</div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-4xl font-bold text-text">{free.price}</span>
          <span className="text-muted">{free.cadence}</span>
        </div>
        <p className="mt-3 text-sm text-muted">{free.tagline}</p>
        <ul className="mt-6 flex flex-col gap-3 text-sm">
          {free.features.map((f) => (
            <li key={f} className="flex gap-2 text-muted">
              <Check />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <a href={MARKETPLACE_URL} className={buttonVariants({ variant: "secondary" }) + " mt-8 w-full"}>
          {free.cta}
        </a>
      </div>

      {/* Pro — managed. Featured with a 2px amber border; promo badge in vermilion. */}
      <div className="flex flex-col rounded-2xl border-2 border-primary bg-surface p-8">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold text-text">{pro.name}</div>
          {discounted ? (
            <span className="rounded-full bg-urgent px-2.5 py-0.5 text-xs font-medium text-white">{pro.badge}</span>
          ) : null}
        </div>

        {/* Billing-cadence toggle (amber active state). */}
        <div className="mt-4 inline-flex self-start rounded-lg border border-border p-1">
          {(["monthly", "annual"] as Cadence[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              aria-pressed={cadence === c}
              className={
                "rounded-md px-3 py-1 text-xs transition-colors " +
                (cadence === c ? "bg-primary text-primary-foreground" : "text-muted hover:text-text")
              }
            >
              {pro[c].toggle}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          {discounted ? <span className="text-lg text-muted line-through">{strike}</span> : null}
          <span className="text-4xl font-bold text-text">{now}</span>
          <span className="text-muted">{plan.cadence}</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {plan.valueLine} {plan.note}
        </p>

        <ul className="mt-6 flex flex-col gap-3 text-sm">
          {pro.features.map((f) => (
            <li key={f} className="flex gap-2 text-muted">
              <Check />
              <span>{f}</span>
            </li>
          ))}
          {/* 14-day money-back guarantee — annual only. */}
          {cadence === "annual" ? (
            <li className="flex gap-2 text-muted">
              <Check />
              <span>{pro.guarantee}</span>
            </li>
          ) : null}
        </ul>

        <div className="mt-8">
          {accountId ? (
            <Button variant="primary" className="w-full" onPress={startCheckout}>
              {pro.cta}
            </Button>
          ) : (
            <form action={() => signInWithGithub("/#pricing")}>
              <Button type="submit" variant="primary" className="w-full">
                Sign in to {pro.cta}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
