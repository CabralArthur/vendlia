import { and, eq, or, sql } from "drizzle-orm";
import { db, businesses, businessSources, contactPoints, leads, leadEvents, type WebsiteStatus } from "../db";
import { normalizeName, onlyDigits } from "@/lib/text";
import { normalizeBrPhone } from "@/lib/phone";
import { classifyWebsite, normalizeInstagram, type Candidate } from "./connectors";
import { UF_DDD } from "./segments";
import { scoreLead } from "../scoring";

export type IngestResult = { created: number; updated: number; skipped: number; leadIds: string[] };

function websiteFor(c: Candidate): { status: WebsiteStatus; website?: string; instagram?: string } {
  const status = classifyWebsite(c.website);
  let instagram = c.instagram ? normalizeInstagram(c.instagram) : undefined;
  if (status === "social_only" && c.website && /instagram\.com/i.test(c.website)) instagram ??= normalizeInstagram(c.website);
  return { status, website: status === "has_website" ? c.website : undefined, instagram };
}

/** Upserts candidates with duplicate detection (source id → CNPJ → phone → name+city). */
export async function ingestCandidates(orgId: string, candidates: Candidate[]): Promise<IngestResult> {
  const res: IngestResult = { created: 0, updated: 0, skipped: 0, leadIds: [] };
  for (const c of candidates) {
    const normalizedName = normalizeName(c.name);
    if (!normalizedName) {
      res.skipped++;
      continue;
    }
    const phoneE164 = normalizeBrPhone(c.phone, c.state ? UF_DDD[c.state.toUpperCase()] : undefined);
    const cnpj = onlyDigits(c.cnpj).length === 14 ? onlyDigits(c.cnpj) : undefined;
    const web = websiteFor(c);

    await db.transaction(async (tx) => {
      // 1. Already ingested from the same source?
      const [src] = await tx
        .select({ businessId: businessSources.businessId })
        .from(businessSources)
        .where(and(eq(businessSources.orgId, orgId), eq(businessSources.source, c.source), eq(businessSources.externalId, c.externalId)))
        .limit(1);

      let businessId = src?.businessId;
      if (!businessId) {
        const conds = [and(eq(businesses.normalizedName, normalizedName), eq(sql`lower(coalesce(${businesses.city}, ''))`, (c.city ?? "").toLowerCase()))];
        if (cnpj) conds.push(eq(businesses.cnpj, cnpj));
        if (phoneE164) conds.push(eq(businesses.phoneE164, phoneE164));
        const [dup] = await tx
          .select({ id: businesses.id })
          .from(businesses)
          .where(and(eq(businesses.orgId, orgId), or(...conds)))
          .limit(1);
        businessId = dup?.id;
      }

      if (businessId) {
        const [b] = await tx.select().from(businesses).where(eq(businesses.id, businessId));
        if (!b) return;
        // Merge only missing fields; never overwrite operator-confirmed data.
        const patch: Partial<typeof businesses.$inferInsert> = {};
        if (!b.phoneE164 && phoneE164) Object.assign(patch, { phone: c.phone, phoneE164 });
        if (!b.cnpj && cnpj) patch.cnpj = cnpj;
        if (!b.address && c.address) patch.address = c.address;
        if (!b.neighborhood && c.neighborhood) patch.neighborhood = c.neighborhood;
        if (!b.openingHours && c.openingHours) patch.openingHours = c.openingHours;
        if (!b.instagram && web.instagram) patch.instagram = web.instagram;
        if (!b.email && c.email) patch.email = c.email;
        if (b.websiteStatus !== "confirmed_absent" && web.status === "has_website" && b.websiteStatus !== "has_website") {
          Object.assign(patch, { websiteStatus: "has_website", website: web.website });
        }
        if (Object.keys(patch).length) await tx.update(businesses).set(patch).where(eq(businesses.id, b.id));
        res.updated++;
      } else {
        const [b] = await tx
          .insert(businesses)
          .values({
            orgId,
            name: c.name.trim(),
            normalizedName,
            cnpj,
            segment: c.segment,
            category: c.category,
            address: c.address,
            neighborhood: c.neighborhood,
            city: c.city,
            state: c.state?.toUpperCase(),
            lat: c.lat,
            lng: c.lng,
            phone: c.phone,
            phoneE164,
            email: c.email,
            website: web.website,
            websiteStatus: web.status,
            instagram: web.instagram,
            openingHours: c.openingHours,
            active: c.active ?? true,
          })
          .returning({ id: businesses.id });
        businessId = b!.id;
        res.created++;
      }

      await tx
        .insert(businessSources)
        .values({
          orgId,
          businessId,
          source: c.source,
          externalId: c.externalId,
          license: c.license,
          restrictions: c.restrictions,
          payload: c.payload as object,
          expiresAt: c.expiresAt,
        })
        .onConflictDoUpdate({
          target: [businessSources.orgId, businessSources.source, businessSources.externalId],
          set: { fetchedAt: new Date(), payload: c.payload as object, expiresAt: c.expiresAt },
        });

      if (phoneE164) {
        await tx
          .insert(contactPoints)
          .values({ orgId, businessId, channel: "whatsapp", value: phoneE164, permission: "public_business", consentSource: `Telefone comercial público (${c.source})` })
          .onConflictDoNothing();
      }

      const [existingLead] = await tx.select().from(leads).where(eq(leads.businessId, businessId)).limit(1);
      const [b] = await tx.select().from(businesses).where(eq(businesses.id, businessId));
      const s = scoreLead({ ...b!, stage: existingLead?.stage });
      if (existingLead) {
        await tx.update(leads).set({ score: s.score, scoreFactors: s.factors, nextAction: s.nextAction }).where(eq(leads.id, existingLead.id));
        res.leadIds.push(existingLead.id);
      } else {
        const stage = b!.websiteStatus === "has_website" || !b!.active ? "discovered" : s.score >= 50 ? "qualified" : "discovered";
        const [l] = await tx
          .insert(leads)
          .values({ orgId, businessId, stage, score: s.score, scoreFactors: s.factors, nextAction: s.nextAction })
          .returning({ id: leads.id });
        res.leadIds.push(l!.id);
        await tx.insert(leadEvents).values({
          orgId,
          leadId: l!.id,
          type: "discovered",
          message: `Encontrado via ${c.source}`,
          data: { source: c.source, externalId: c.externalId },
        });
      }
    });
  }
  return res;
}

/** Recomputes score for one lead (after edits, contact checks or stage changes). */
export async function rescoreLead(orgId: string, leadId: string) {
  const [row] = await db
    .select({ lead: leads, business: businesses })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  if (!row) return;
  const [cp] = await db
    .select({ waExists: contactPoints.waExists })
    .from(contactPoints)
    .where(and(eq(contactPoints.businessId, row.business.id), eq(contactPoints.channel, "whatsapp")))
    .limit(1);
  const s = scoreLead({ ...row.business, waExists: cp?.waExists, stage: row.lead.stage });
  await db.update(leads).set({ score: s.score, scoreFactors: s.factors, nextAction: s.nextAction }).where(eq(leads.id, leadId));
}

