import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

test("hero shows the locked headline and a free-install CTA to the Marketplace", () => {
  render(<Hero />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/never babysit your ai coding agent/i);
  const cta = screen.getByRole("link", { name: /add to vs code/i });
  expect(cta).toHaveAttribute("href", expect.stringContaining("marketplace.visualstudio.com"));
});
