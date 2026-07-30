"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { getPaddleEnv, getPaddleClientToken } from "@/config/paddle";

// Single memoized Paddle.js instance, shared by price previews and checkout so we
// initialize (and load the script) exactly once per page. The webhook remains the sole
// source of truth for Pro — on checkout.completed we just navigate to the account page,
// which renders fresh server-side state; we never grant Pro from this client event.
let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: getPaddleEnv(),
      token: getPaddleClientToken(),
      eventCallback: (e) => {
        if (e?.name === "checkout.completed") {
          window.location.assign("/account?checkout=success");
        }
      },
    }).catch(() => {
      // Reset so a later interaction can retry initialization.
      paddlePromise = null;
      return undefined;
    });
  }
  return paddlePromise;
}
