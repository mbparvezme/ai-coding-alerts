"use client";

import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import type { SubscriptionRow } from "@/server/account/repository";

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
          {/* TODO(Task 7): wrap in <form action={openBillingPortalAction}> once billing portal lands */}
          <Button type="submit" variant="outline" isDisabled className="mt-4">Manage billing</Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">You&apos;re on the free plan.</p>
          <a href="/#pricing" className={buttonVariants({ variant: "primary" }) + " mt-4"}>Upgrade to Pro</a>
        </>
      )}
    </div>
  );
}
