import { and, eq } from "drizzle-orm";
import { getSession } from "@/server/auth";
import { db, leads } from "@/server/db";
import { getSiteGen } from "@/server/sites/progress";

export const dynamic = "force-dynamic";

/** Site generation progress for one lead (polled while the AI is working). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const [l] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), eq(leads.orgId, s.orgId)));
  if (!l) return new Response("not found", { status: 404 });
  return Response.json({ state: await getSiteGen(id) }, { headers: { "Cache-Control": "no-store" } });
}
