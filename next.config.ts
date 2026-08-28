import type { NextConfig } from "next";

// Standalone output: produces .next/standalone (self-host deploys) and is
// also what @opennextjs/cloudflare builds on for Workers deploys.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,

  // Prisma on Cloudflare Workers (Path A/B): the default Next build inlines
  // `@prisma/client` with NODE conditions — i.e. the Rust-engine client
  // (`index.js`), which cannot load inside workerd. Keeping BOTH the wrapper
  // package and the generated client external (official OpenNext recipe:
  // https://opennext.js.org/cloudflare/howtos/db) lets OpenNext's esbuild
  // step bundle them with the `workerd` condition and rewrite their
  // package.json exports so `wasm.js` (WASM engine + PrismaD1 adapter, no
  // Rust engine) wins. Local dev/self-host are unaffected: Node resolves
  // `@prisma/client` back to `index.js` and keeps using SQLite as before.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

// NOTE: deliberately NOT calling initOpenNextCloudflareForDev() here.
// It would make `getCloudflareContext()` resolve inside `next dev`,
// pointing the dev server at an EMPTY local miniflare D1 while the e2e
// suite and QA scripts (which run outside Next) stay on SQLite — a
// split-brain between the two databases that breaks the 34-check
// security suite and the QA fixtures. Production Workers still get D1
// via the sync getCloudflareContext() in src/lib/db.ts, and the D1 path
// is testable locally with `bun run preview` (the real worker + local
// D1 simulation). See src/lib/db.ts for the full rationale.
