import { and, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db, websites, websiteVersions, type SiteContent, type TemplateId } from "@/server/db";
import { env } from "@/server/env";

export type Resolved = { siteId: string; slug: string; content: SiteContent; template: TemplateId; accent: string; demo: boolean; customDomain: string | null };

/** Published sites are public; anything else requires the preview token (k). */
export const resolveBySlug = cache(async (slug: string, k?: string): Promise<Resolved | null> => {
  const [w] = await db.select().from(websites).where(eq(websites.slug, slug));
  if (!w) return null;
  if (k && k === w.previewToken) {
    // Preview: latest version, with demo banner unless the client has already approved/paid.
    return { siteId: w.id, slug: w.slug, content: w.content, template: w.template, accent: w.accent, demo: w.status !== "published" && w.status !== "approved", customDomain: w.customDomain };
  }
  if (w.status === "published" && w.publishedVersion) {
    const [v] = await db.select().from(websiteVersions).where(and(eq(websiteVersions.websiteId, w.id), eq(websiteVersions.version, w.publishedVersion)));
    if (!v) return null;
    return { siteId: w.id, slug: w.slug, content: { ...v.content, pendingReview: [] }, template: v.template as TemplateId, accent: v.accent, demo: false, customDomain: w.customDomain };
  }
  return null;
});

export const resolveByHost = cache(async (host: string): Promise<Resolved | null> => {
  const full = host.toLowerCase().replace(/:\d+$/, "");
  const h = full.replace(/^www\./, "");
  const base = env().SITES_BASE_DOMAIN?.toLowerCase();
  let slug: string | undefined;
  if (base && h.endsWith(`.${base}`)) slug = h.slice(0, -(base.length + 1));
  else {
    const [w] = await db.select({ slug: websites.slug }).from(websites).where(inArray(websites.customDomain, [full, h, `www.${h}`]));
    slug = w?.slug;
  }
  if (!slug) return null;
  return resolveBySlug(slug);
});

export async function countView(siteId: string) {
  await db.update(websites).set({ views: sql`${websites.views} + 1` }).where(eq(websites.id, siteId)).catch(() => {});
}

export function canonicalFor(r: Resolved) {
  const e = env();
  if (r.customDomain) return `https://${r.customDomain}`;
  if (e.SITES_BASE_DOMAIN) return `https://${r.slug}.${e.SITES_BASE_DOMAIN}`;
  return `${e.APP_URL.replace(/\/$/, "")}/s/${r.slug}`;
}
