import { eq } from "drizzle-orm";
import { db, siteAssets } from "@/server/db";

export const dynamic = "force-dynamic";

/** Public, immutable files used by sites (AI photos and logos). Ids are unguessable UUIDs. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const [a] = await db.select({ mime: siteAssets.mime, data: siteAssets.data }).from(siteAssets).where(eq(siteAssets.id, id));
  if (!a) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(a.mime === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src https:" } : {}),
    },
  });
}
