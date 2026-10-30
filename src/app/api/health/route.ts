import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = { ok: true, time: new Date().toISOString() };
  try {
    await db.execute(sql`select 1`);
    out.db = "ok";
  } catch (e) {
    out.ok = false;
    out.db = String(e).slice(0, 120);
  }
  try {
    await redis().ping();
    out.redis = "ok";
    const hb = await redis().get("vendlia:worker:heartbeat");
    out.worker = hb ? `ok (${Math.round((Date.now() - Number(hb)) / 1000)}s)` : "sem heartbeat";
  } catch (e) {
    out.ok = false;
    out.redis = String(e).slice(0, 120);
  }
  return Response.json(out, { status: out.ok ? 200 : 503 });
}
