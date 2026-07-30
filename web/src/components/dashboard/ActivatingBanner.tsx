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
