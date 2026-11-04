import { sql } from "drizzle-orm";
import { db, businesses } from "@/server/db";
import { env } from "@/server/env";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

const NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;

/**
 * Serves a Google Places photo without exposing the API key: resolves the photo's public
 * URL (cached 12 h to avoid paying twice) and redirects to it. Only photos already attached to
 * a business in our database are served, so the endpoint can't be used to spend quota.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const name = u.searchParams.get("n") ?? "";
  const w = Math.max(200, Math.min(1600, Number(u.searchParams.get("w")) || 800));
  const key = env().GOOGLE_PLACES_API_KEY;
  if (!NAME.test(name) || !key) return new Response("not found", { status: 404 });

  const cacheKey = `vendlia:gphoto:${name}:${w}`;
  let target = await redis().get(cacheKey).catch(() => null);
  if (!target) {
    const [known] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(sql`${businesses.photos} @> ${JSON.stringify([{ name }])}::jsonb`)
      .limit(1);
    if (!known) return new Response("not found", { status: 404 });
    const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": key },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) return new Response("unavailable", { status: 502 });
    const j = (await res.json().catch(() => ({}))) as { photoUri?: string };
    if (!j.photoUri?.startsWith("https://")) return new Response("unavailable", { status: 502 });
    target = j.photoUri;
    await redis().set(cacheKey, target, "EX", 12 * 3600).catch(() => {});
  }
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "public, max-age=3600" } });
}
