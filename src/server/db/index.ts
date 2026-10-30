import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __vendliaPool?: pg.Pool; __vendliaDb?: DB };

function init() {
  if (!g.__vendliaDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__vendliaPool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
    g.__vendliaPool.on("error", (err) => console.error("[pg] erro no pool", err.message));
    g.__vendliaDb = drizzle(g.__vendliaPool, { schema });
  }
  return g.__vendliaDb;
}

/** Lazily connected so builds and imports never require a database. */
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export const pool = {
  end: async () => {
    await g.__vendliaPool?.end();
  },
};

export type { DB };
export * from "./schema";
