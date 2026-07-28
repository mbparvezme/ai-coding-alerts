import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Pricing imports the signInWithGithub server action from @/app/auth-actions, which in turn
// imports @/auth (next-auth + @opennextjs/cloudflare). That chain pulls in `next/server`,
// which crashes module resolution under jsdom (see Nav.ui.test.tsx for the full explanation).
// This test only exercises Pricing's rendering/gating, so the real auth/DB stack is mocked
// out rather than exercised here.
vi.mock("@/app/auth-actions", () => ({
  signInWithGithub: () => {},
}));

import { Pricing } from "./Pricing";

test("shows both plans with the locked value lines and prices", () => {
  render(<Pricing accountId={null} email={null} />);
  expect(screen.getByText(/under \$1 a week/i)).toBeInTheDocument();
  expect(screen.getByText(/under 10¢ a day/i)).toBeInTheDocument();
  expect(screen.getByText("$3.89")).toBeInTheDocument();
  expect(screen.getByText("$36")).toBeInTheDocument();
});

test("signed-out users see a sign-in prompt on the Start Pro buttons", () => {
  render(<Pricing accountId={null} email={null} />);
  expect(screen.getAllByRole("button", { name: /sign in to start pro/i }).length).toBeGreaterThan(0);
});
