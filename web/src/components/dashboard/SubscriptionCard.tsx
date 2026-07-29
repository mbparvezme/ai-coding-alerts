"use client";

import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import type { SubscriptionRow } from "@/server/account/repository";
import { openBillingPortalAction } from "@/app/(dashboard)/account/actions";

export function SubscriptionCard({ subscription }: { subscription: SubscriptionRow | null }) {
  const isActive = subscription?.status === "active";
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Subscription</div>
      {subscription ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Plan: <span className="text-text">{subscription.plan}</span> · Status:{" "}
            <span className={isActive ? "text-success" : "text-urgent"}>{subscription.status}</span>
          </p>
          {/* Show billing management for any subscription row (incl. past_due) so a
              failed-renewal customer can reach the Paddle portal to fix payment. */}
          <form action={openBillingPortalAction} className="mt-4">
            <Button type="submit" variant="outline">Manage billing</Button>
          </form>
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
