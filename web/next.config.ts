import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// Makes getCloudflareContext() (env bindings: DB + secrets) work under `next dev`.
// No-op in production builds — the Worker provides the real context there.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
