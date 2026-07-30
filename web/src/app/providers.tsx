"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Dark-first for v1: force dark, no toggle. attribute="class" so HeroUI/Tailwind see `.dark`.
  return (
    <ThemeProvider attribute="class" forcedTheme="dark">
      {children}
    </ThemeProvider>
  );
}
