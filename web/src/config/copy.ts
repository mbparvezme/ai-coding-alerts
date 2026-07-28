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
