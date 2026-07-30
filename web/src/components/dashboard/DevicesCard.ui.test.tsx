import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// DevicesCard imports the deactivateDeviceAction server action from
// @/app/(dashboard)/account/actions, which in turn imports @/auth (next-auth +
// @opennextjs/cloudflare). That chain pulls in `next/server`, which crashes module
// resolution under jsdom (see Nav.ui.test.tsx for the full explanation). This test only
// exercises DevicesCard's rendering, so the real auth/DB stack is mocked out rather than
// exercised here.
vi.mock("@/app/(dashboard)/account/actions", () => ({
  deactivateDeviceAction: () => {},
}));

import { DevicesCard } from "./DevicesCard";

test("renders each device with a deactivate control", () => {
  render(<DevicesCard devices={[{ user_id: "acct_1", device_id: "dev-a", activated_at: 1, last_seen_at: 2 }]} />);
  expect(screen.getByText("dev-a")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
});

test("empty state when no devices", () => {
  render(<DevicesCard devices={[]} />);
  expect(screen.getByText(/no active devices/i)).toBeInTheDocument();
});
