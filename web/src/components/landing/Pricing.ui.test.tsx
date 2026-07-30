import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Pricing imports the signInWithGithub server action from @/app/auth-actions, which in turn
// imports @/auth (next-auth + @opennextjs/cloudflare). That chain pulls in `next/server`,
// which crashes module resolution under jsdom (see Nav.ui.test.tsx for the full explanation).
// This test only exercises Pricing's rendering/gating, so the real auth/DB stack is mocked out.
vi.mock("@/app/auth-actions", () => ({
  signInWithGithub: () => {},
}));

import { Pricing } from "./Pricing";

test("renders Free and Pro tiers with fallback annual pricing", () => {
  render(<Pricing accountId={null} email={null} />);
  // Free tier
  expect(screen.getByText("Free")).toBeInTheDocument();
  expect(screen.getByText("$0")).toBeInTheDocument();
  expect(screen.getByText("Get started free")).toBeInTheDocument();
  // Pro defaults to annual: the $36 fallback promo price, its struck list price, and the
  // locked value line ("under 10¢ a day", now describing the discounted price).
  expect(screen.getByText("$36")).toBeInTheDocument();
  expect(screen.getByText("$48")).toBeInTheDocument();
  expect(screen.getByText(/under 10¢ a day/i)).toBeInTheDocument();
  // 14-day guarantee shows on the annual (default) view.
  expect(screen.getByText(/14-day money-back guarantee/i)).toBeInTheDocument();
});

test("signed-out users get a sign-in prompt on the Pro CTA", () => {
  render(<Pricing accountId={null} email={null} />);
  expect(screen.getByRole("button", { name: /sign in to start pro/i })).toBeInTheDocument();
});
