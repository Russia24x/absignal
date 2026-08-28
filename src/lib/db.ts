import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

const globalForPrisma = globalThis as unknown as {
  prismaFallback: PrismaClient | undefined
}

/**
 * Returns a Prisma client wired to the right backend for where the code is
 * actually running. Call this at the top of every function that touches the
 * DB — never cache the D1-backed client at module scope.
 *
 * Cloudflare Workers (Path A/B): the D1 binding ("DB" in wrangler.jsonc) is
 * only reachable via OpenNext's request-scoped getCloudflareContext() — NOT
 * via process.env, despite what an earlier draft of docs/DEPLOYMENT.md said.
 * Resolved per call, inside a request handler. SYNC mode is deliberate:
 * only the deployed OpenNext worker entry sets the context on the global
 * scope, so this branch is exclusive to production Workers (and to
 * `bun run preview`, which runs the real worker locally).
 *
 * Everything else — `next dev`, standalone scripts (e2e suite, QA
 * fixtures), and the self-hosted Node build (Path C) — falls through to
 * the SQLite client via DATABASE_URL. That keeps the dev server and the
 * e2e/scripts tooling on ONE shared database, which the 34-check security
 * suite requires (fixtures are written directly, then read through the
 * API). NOTE: getCloudflareContext({ async: true }) must NOT be used here:
 * in async mode `next dev` auto-initializes wrangler's miniflare and
 * silently points the dev server at an EMPTY local D1 while scripts stay
 * on SQLite — a split-brain that breaks the whole QA apparatus.
 *
 * To exercise the D1 code path locally, run `bun run preview` (builds the
 * worker and serves it on :8787 with the local D1 simulation).
 */
export async function getDb(): Promise<PrismaClient> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    // Sync mode: throws unless running inside the deployed OpenNext worker.
    const { env } = getCloudflareContext()
    if (env?.DB) {
      return new PrismaClient({ adapter: new PrismaD1(env.DB) })
    }
  } catch {
    // Not inside the OpenNext worker request scope — SQLite fallback.
  }
  if (!globalForPrisma.prismaFallback) {
    globalForPrisma.prismaFallback = new PrismaClient({ log: ['query'] })
  }
  return globalForPrisma.prismaFallback
}
