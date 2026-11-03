import { and, desc, eq } from "drizzle-orm";
import { db, businesses, leads, websites, websiteVersions, type SiteContent, type TemplateId, TEMPLATES } from "../db";
import { segmentById } from "../discovery/segments";
import { generateSiteContent } from "../ai/sitecopy";
import { designSite } from "../ai/sitedesign";
import { llmConfigured } from "../ai/llm";
import { setSiteGen } from "./progress";
import { randomToken, slugify } from "@/lib/text";
import { advanceStage, logLeadEvent } from "../events";
import { publish } from "../realtime";
import { THEMES } from "@/sites/themes";

async function uniqueSlug(base: string) {
  const root = slugify(base) || "site";
  for (let i = 0; i < 20; i++) {
    const s = i === 0 ? root : `${root}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const [hit] = await db.select({ id: websites.id }).from(websites).where(eq(websites.slug, s));
    if (!hit) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Generates (or regenerates) the demo site for a lead from verified business facts.
 * mode "ai" (default when an LLM is configured): the site model designs the whole page; the template is the fallback.
 */
export async function generateSiteForLead(
  orgId: string,
  leadId: string,
  opts: { template?: TemplateId; mode?: "ai" | "template"; instructions?: string; fetchImpl?: typeof fetch } = {},
) {
  const [row] = await db
    .select({ lead: leads, business: businesses })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  if (!row) throw new Error("Lead não encontrado");
  const b = row.business;
  const facts = { ...b, services: b.services ?? [] };
  const seg = segmentById(b.segment);
  const [prev] = await db.select().from(websites).where(eq(websites.leadId, leadId)).orderBy(desc(websites.createdAt)).limit(1);
  const wantAi = (opts.mode ?? "ai") === "ai" && llmConfigured();
  await setSiteGen(leadId, { status: "running", step: wantAi ? "A IA está criando o design e os textos (1 a 4 minutos)…" : "Montando o site…", mode: wantAi ? "ai" : "template", startedAt: Date.now() });
  try {
    const services = facts.services.length ? facts.services : seg.defaultServices;
    const photos = [prev?.content.coverImage, ...(prev?.content.gallery ?? [])].filter((x): x is string => !!x);
    const [content, ai] = await Promise.all([
      generateSiteContent(orgId, facts, opts.fetchImpl),
      wantAi
        ? designSite(
            orgId,
            facts,
            {
              services,
              servicesAreSuggestions: facts.services.length === 0,
              photos,
              previous: opts.instructions ? prev?.content.ai : undefined,
              instructions: opts.instructions,
              log: (m) => void setSiteGen(leadId, { status: "running", step: m }),
            },
            opts.fetchImpl,
          ).catch((e) => {
            console.error("[sites] design falhou", e instanceof Error ? e.message : e);
            return null;
          })
        : Promise.resolve(null),
    ]);
    if (prev) {
      content.coverImage = prev.content.coverImage;
      content.gallery = prev.content.gallery;
    }
    if (ai) content.ai = ai;
    else if (wantAi) content.pendingReview = ["A IA não conseguiu gerar o design agora; foi usado o modelo padrão. Tente “Gerar de novo”.", ...content.pendingReview];
    const siteId = await saveGenerated(orgId, leadId, b, content, opts.template ?? seg.template, prev, opts.instructions);
    await setSiteGen(leadId, { status: "done", step: ai ? "Site criado pela IA." : "Site criado com o modelo padrão." });
    return siteId;
  } catch (err) {
    await setSiteGen(leadId, { status: "failed", step: err instanceof Error ? err.message : "Falha ao gerar o site" });
    throw err;
  }
}

async function saveGenerated(
  orgId: string,
  leadId: string,
  b: { name: string; city: string | null },
  content: SiteContent,
  template: TemplateId,
  existing: typeof websites.$inferSelect | undefined,
  instructions?: string,
) {
  if (!TEMPLATES.includes(template)) throw new Error("Template inválido");
  const note = content.ai ? (instructions ? `Ajuste pela IA: ${instructions.slice(0, 120)}` : "Criado pela IA") : "Modelo padrão";
  let siteId: string;
  if (existing) {
    const version = existing.version + 1;
    const accent = template !== existing.template ? THEMES[template].accent : existing.accent;
    await db.update(websites).set({ content, template, version, accent }).where(eq(websites.id, existing.id));
    await db.insert(websiteVersions).values({ websiteId: existing.id, version, template, accent, content, note });
    siteId = existing.id;
  } else {
    const slug = await uniqueSlug(`${b.name}${b.city ? "-" + b.city : ""}`);
    const [w] = await db
      .insert(websites)
      .values({ orgId, leadId, slug, template, accent: THEMES[template].accent, content, previewToken: randomToken(9), status: "preview" })
      .returning({ id: websites.id });
    siteId = w!.id;
    await db.insert(websiteVersions).values({ websiteId: siteId, version: 1, template, accent: THEMES[template].accent, content, note });
  }
  await logLeadEvent(orgId, leadId, "preview", `Site de demonstração ${existing ? "gerado de novo" : "gerado"}`, { siteId });
  await advanceStage(orgId, leadId, "preview_ready");
  await publish(orgId, { type: "lead", leadId });
  return siteId;
}

/** Saves an operator edit as a new immutable version. */
export async function saveSiteEdit(
  orgId: string,
  siteId: string,
  patch: { content: SiteContent; template: TemplateId; accent: string },
  note: string,
) {
  const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId)));
  if (!w) throw new Error("Site não encontrado");
  if (!/^#[0-9a-fA-F]{6}$/.test(patch.accent)) throw new Error("Cor inválida");
  const version = w.version + 1;
  await db.transaction(async (tx) => {
    await tx.update(websites).set({ content: patch.content, template: patch.template, accent: patch.accent, version }).where(eq(websites.id, siteId));
    await tx.insert(websiteVersions).values({ websiteId: siteId, version, template: patch.template, accent: patch.accent, content: patch.content, note });
  });
  return version;
}

export async function rollbackSite(orgId: string, siteId: string, toVersion: number) {
  const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId)));
  if (!w) throw new Error("Site não encontrado");
  const [v] = await db.select().from(websiteVersions).where(and(eq(websiteVersions.websiteId, siteId), eq(websiteVersions.version, toVersion)));
  if (!v) throw new Error("Versão não encontrada");
  return saveSiteEdit(orgId, siteId, { content: v.content, template: v.template as TemplateId, accent: v.accent }, `Rollback para v${toVersion}`);
}
