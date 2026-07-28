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
