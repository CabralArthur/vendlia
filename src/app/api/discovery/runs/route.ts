import { desc, eq } from "drizzle-orm";
import { getSession } from "@/server/auth";
import { db, discoveryRuns } from "@/server/db";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

/** Recent searches with their progress log; polled by the Prospecção screen while a search runs. */
export async function GET() {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const [runs, hb] = await Promise.all([
    db.select().from(discoveryRuns).where(eq(discoveryRuns.orgId, s.orgId)).orderBy(desc(discoveryRuns.createdAt)).limit(10),
    redis().get("vendlia:worker:heartbeat").catch(() => null),
  ]);
  const workerOk = !!hb && Date.now() - Number(hb) < 3 * 60_000;
  return Response.json({ workerOk, runs }, { headers: { "Cache-Control": "no-store" } });
}
