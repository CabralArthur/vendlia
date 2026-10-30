import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, discoveryRuns, contactPoints, leads, businesses, businessSources, whatsappInstances } from "../db";
import { fetchGooglePlaces, fetchOsm, type DiscoveryParams } from "./connectors";
import { ingestCandidates, rescoreLead } from "./ingest";
import { notify } from "../events";
import { EvolutionClient } from "../whatsapp/evolution";
import { env } from "../env";

export async function runDiscovery(runId: string, fetchImpl?: typeof fetch) {
  const [run] = await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, runId));
  if (!run || run.status === "done") return;
  await db.update(discoveryRuns).set({ status: "running" }).where(eq(discoveryRuns.id, runId));
  try {
    const params = run.params as DiscoveryParams;
    const candidates = run.source === "google_places" ? await fetchGooglePlaces(params, fetchImpl) : await fetchOsm(params, fetchImpl);
    const res = await ingestCandidates(run.orgId, candidates);
    await db
      .update(discoveryRuns)
      .set({ status: "done", found: candidates.length, created: res.created, finishedAt: new Date() })
      .where(eq(discoveryRuns.id, runId));
    await notify(run.orgId, {
      type: "discovery_done",
      title: "Busca concluída",
      body: `${candidates.length} empresas encontradas, ${res.created} novas (${params.segment} · ${params.city}/${params.state}).`,
      link: "/leads",
    });
    await verifyWhatsappNumbers(run.orgId).catch((e) => console.warn("[discovery] verificação de WhatsApp falhou", e?.message));
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(discoveryRuns).set({ status: "failed", error: msg.slice(0, 500), finishedAt: new Date() }).where(eq(discoveryRuns.id, runId));
    await notify(run.orgId, { type: "discovery_failed", title: "Busca falhou", body: msg.slice(0, 200), link: "/discovery" });
    throw err;
  }
}

/** Uses a connected number to check which unverified phones actually have WhatsApp. */
export async function verifyWhatsappNumbers(orgId: string, client?: EvolutionClient, limit = 100) {
  const e = env();
  if (!client && (!e.EVOLUTION_API_URL || !e.EVOLUTION_API_KEY)) return 0;
  const [inst] = await db
    .select()
    .from(whatsappInstances)
    .where(and(eq(whatsappInstances.orgId, orgId), eq(whatsappInstances.status, "open")))
    .limit(1);
  if (!inst) return 0;
  const pending = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.orgId, orgId), eq(contactPoints.channel, "whatsapp"), isNull(contactPoints.waExists)))
    .limit(limit);
  if (!pending.length) return 0;
  const c = client ?? EvolutionClient.fromEnv();
  const result = await c.checkNumbers(inst.name, pending.map((p) => p.value));
  const byNumber = new Map(result.map((r) => [r.number.replace(/\D/g, ""), r.exists]));
  for (const p of pending) {
    const exists = byNumber.get(p.value);
    if (exists === undefined) continue;
    await db.update(contactPoints).set({ waExists: exists, verifiedAt: new Date() }).where(eq(contactPoints.id, p.id));
    const [l] = await db.select({ id: leads.id }).from(leads).where(eq(leads.businessId, p.businessId));
    if (l) await rescoreLead(orgId, l.id);
  }
  return pending.length;
}

/** Google Places content may be cached ≤30 days: purge expired, never-contacted Google-only leads. */
export async function purgeExpiredSourceData() {
  const expired = await db
    .select({ businessId: businessSources.businessId })
    .from(businessSources)
    .where(and(eq(businessSources.source, "google_places"), lt(businessSources.expiresAt, new Date())));
  if (!expired.length) return 0;
  const ids = [...new Set(expired.map((e) => e.businessId))];
  // Only remove businesses that have no other source and were never worked on.
  const removable = await db
    .select({ id: businesses.id })
    .from(businesses)
    .innerJoin(leads, eq(leads.businessId, businesses.id))
    .where(
      and(
        inArray(businesses.id, ids),
        inArray(leads.stage, ["discovered", "qualified"]),
        sql`not exists (select 1 from business_sources s where s.business_id = ${businesses.id} and s.source <> 'google_places')`,
      ),
    );
  if (removable.length) await db.delete(businesses).where(inArray(businesses.id, removable.map((r) => r.id)));
  // For businesses we keep (worked leads), strip the cached payload and keep only place_id.
  await db
    .update(businessSources)
    .set({ payload: null })
    .where(and(eq(businessSources.source, "google_places"), lt(businessSources.expiresAt, new Date())));
  return removable.length;
}
