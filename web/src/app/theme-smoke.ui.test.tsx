import { render, screen } from "@testing-library/react";
import { Button } from "@heroui/react";

test("HeroUI Button renders (toolchain smoke)", () => {
  render(<Button data-testid="cta">Start Pro</Button>);
  expect(screen.getByTestId("cta")).toHaveTextContent("Start Pro");
});
