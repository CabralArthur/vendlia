import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

export async function resetDb() {
  await db.execute(sql`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP; END $$;`);
  await redis().flushdb();
}

type Handler = (url: URL, init: RequestInit) => unknown;
/** In-process HTTP stub standing in for provider APIs during tests (never used in production code paths). */
export function stubFetch(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: url.toString(), body, headers: Object.fromEntries(new Headers(init.headers).entries()) });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === method && new RegExp(`^${p}$`).test(url.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: "not stubbed", path: url.pathname }), { status: 404 });
    const out = routes[key]!(url, { ...init, body });
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: fn, calls };
}
