import { render, screen } from "@testing-library/react";
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
