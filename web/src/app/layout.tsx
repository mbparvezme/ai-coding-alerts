import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "AI Coding Alerts — Know the instant your AI agent needs you",
  description:
    "Stop babysitting your AI coding agent. Get instant phone alerts and approve or deny its actions from anywhere. Free with your own bot. Pro from under $1/week.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
