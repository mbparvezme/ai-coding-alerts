export const COPY = {
  hero: {
    headline: "Never babysit your AI coding agent again.",
    subhead:
      "Your agent runs for ten minutes, then quietly stops — waiting on a yes/no you didn't know it needed. AI Coding Alerts pings your phone the moment it needs you, and lets you approve or deny right from the notification.",
    trust: ["Free forever", "No credit card", "Works with your existing setup"],
  },
  pricing: {
    // Free tier — the self-hosted "bring your own bot" plan. Its CTA points at the
    // VS Code marketplace (the extension is what's free), not checkout.
    free: {
      name: "Free",
      price: "$0",
      cadence: "forever",
      tagline: "Self-hosted. Bring your own Telegram bot.",
      features: [
        "Instant phone alerts when your agent stops",
        "Approve / deny from the notification",
        "Your own bot — quick one-time setup",
        "Optional account: back up + restore settings",
      ],
      cta: "Get started free",
    },
    // Pro tier — managed convenience. The strike/price values here are FALLBACKS only:
    // the live figures come from Paddle PricePreview (with the launch discount) at runtime.
    // valueLine keeps the locked price-value framing ("under $1 a week" / "under 10¢ a day"),
    // now describing the discounted price — still accurate.
    pro: {
      name: "Pro",
      badge: "Launch offer · 25% off",
      guarantee: "14-day money-back guarantee",
      cta: "Start Pro",
      features: [
        "Everything in Free, zero setup",
        "Managed bot — we host it, no Telegram config",
        "Automatic sync across all your devices",
        "Web dashboard for devices + billing",
      ],
      monthly: {
        toggle: "Monthly",
        strike: "$4.99",
        price: "$3.74",
        cadence: "/mo",
        valueLine: "Under $1 a week.",
        note: "Billed monthly. Cancel anytime.",
      },
      annual: {
        toggle: "Annual · best value",
        strike: "$48",
        price: "$36",
        cadence: "/yr",
        valueLine: "Under 10¢ a day.",
        note: "Billed yearly · just $3/mo · two months free.",
      },
    },
  },
} as const;
