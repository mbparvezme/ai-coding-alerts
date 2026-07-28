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
