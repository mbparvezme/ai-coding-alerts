import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Nav imports the signInWithGithub server action from @/app/auth-actions, which in turn
// imports @/auth (next-auth + @opennextjs/cloudflare). That chain pulls in `next/server`,
// which Vitest's jsdom "ui" project externalizes to Node's native ESM resolver — and since
// the installed `next` package has no `exports` map, Node's ESM loader (unlike Vite/CJS)
// won't resolve the extensionless "next/server" specifier, crashing module load before any
// component code runs. This test only exercises Nav's rendering per `signedIn`, so the real
// auth/DB stack is mocked out rather than exercised here.
vi.mock("@/app/auth-actions", () => ({
  signInWithGithub: async () => {},
}));

import { Nav } from "./Nav";

test("nav shows Sign in when signed out", () => {
  render(<Nav signedIn={false} />);
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("nav shows Dashboard when signed in", () => {
  render(<Nav signedIn={true} />);
  expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
});
