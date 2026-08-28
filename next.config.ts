import type { NextConfig } from "next";

// Standalone output: produces .next/standalone (self-host deploys) and is
// also what @opennextjs/cloudflare builds on for Workers deploys.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
};

export default nextConfig;
