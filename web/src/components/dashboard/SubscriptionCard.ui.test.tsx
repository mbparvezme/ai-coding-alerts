import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/app/(dashboard)/account/actions", () => ({
  openBillingPortalAction: () => {},
}));

import { SubscriptionCard } from "./SubscriptionCard";

test("free account shows Upgrade to Pro", () => {
  render(<SubscriptionCard subscription={null} />);
  expect(screen.getByRole("link", { name: /upgrade to pro/i })).toBeInTheDocument();
});

test("pro account shows the plan and Manage billing", () => {
  render(<SubscriptionCard subscription={{ paddle_subscription_id: "sub_1", user_id: "acct_1", status: "active", plan: "yearly", created_at: 1, updated_at: 1 }} />);
  expect(screen.getByText(/yearly/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
});

test("past_due account still shows Manage billing (so they can fix payment)", () => {
  render(<SubscriptionCard subscription={{ paddle_subscription_id: "sub_2", user_id: "acct_1", status: "past_due", plan: "monthly", created_at: 1, updated_at: 1 }} />);
  expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
});
