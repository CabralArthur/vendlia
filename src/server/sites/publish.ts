import { and, eq } from "drizzle-orm";
import { db, leads, websites } from "../db";
import { env } from "../env";
import { audit, logLeadEvent, setStage } from "../events";

export function siteUrls(site: { slug: string; customDomain: string | null }) {
  const e = env();
  const urls = [`${e.APP_URL.replace(/\/$/, "")}/s/${site.slug}`];
  if (e.SITES_BASE_DOMAIN) urls.unshift(`https://${site.slug}.${e.SITES_BASE_DOMAIN}`);
  if (site.customDomain) urls.unshift(`https://${site.customDomain}`);
  return urls;
}

/** Publishes the current version. The operator confirms the client approved it (recorded in the audit log). */
export async function publishWebsite(orgId: string, siteId: string, actorId: string | null) {
  const [site] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId)));
  if (!site) throw new Error("Site não encontrado");
  await db
    .update(websites)
    .set({ status: "published", publishedVersion: site.version, publishedAt: new Date(), content: { ...site.content, pendingReview: [] } })
    .where(eq(websites.id, siteId));
  await audit(orgId, actorId, "site.publish", siteId, { version: site.version });
  await logLeadEvent(orgId, site.leadId, "published", `Site publicado (v${site.version})`, { urls: siteUrls(site) }, actorId);
  const [lead] = await db.select({ stage: leads.stage }).from(leads).where(eq(leads.id, site.leadId));
  if (lead && lead.stage !== "won") await setStage(orgId, site.leadId, "won", actorId, lead.stage);
}

export async function unpublishWebsite(orgId: string, siteId: string, actorId: string | null, reason: string) {
  const [site] = await db.update(websites).set({ status: "unpublished" }).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId))).returning();
  if (site) {
    await audit(orgId, actorId, "site.unpublish", siteId, { reason });
    await logLeadEvent(orgId, site.leadId, "unpublished", `Site despublicado: ${reason}`, null, actorId);
  }
}
