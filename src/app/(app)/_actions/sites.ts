"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, leads, websites, TEMPLATES, type SiteContent } from "@/server/db";
import { publishWebsite, unpublishWebsite } from "@/server/sites/publish";
import { queueOutreach } from "@/server/whatsapp/service";
import { rollbackSite, saveSiteEdit } from "@/server/sites/service";
import { audit } from "@/server/events";
import { enqueue, QUEUES } from "@/server/queue";
import { setSiteGen } from "@/server/sites/progress";
import { llmConfigured } from "@/server/ai/llm";


const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

export async function saveSiteAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    if (!w) throw new Error("Site não encontrado");
    const pair = (raw: string) =>
      lines(raw).map((l) => {
        const [a, ...b] = l.split("|");
        return { a: a!.trim(), b: b.join("|").trim() };
      });
    const content: SiteContent = {
      ...w.content,
      businessName: str(fd, "businessName") || w.content.businessName,
      tagline: str(fd, "tagline"),
      heroTitle: str(fd, "heroTitle"),
      heroSubtitle: str(fd, "heroSubtitle"),
      about: str(fd, "about"),
      ctaLabel: str(fd, "ctaLabel") || "Falar no WhatsApp",
      services: pair(str(fd, "services")).map((p) => ({ name: p.a, description: p.b })),
      highlights: pair(str(fd, "highlights")).map((p) => ({ title: p.a, description: p.b })),
      faq: pair(str(fd, "faq")).map((p) => ({ question: p.a, answer: p.b })).filter((f) => f.answer),
      contact: {
        ...w.content.contact,
        whatsapp: str(fd, "whatsapp").replace(/\D/g, "") || undefined,
        address: str(fd, "address") || undefined,
        openingHours: str(fd, "openingHours") || undefined,
        instagram: str(fd, "instagram").replace(/^@/, "") || undefined,
        email: str(fd, "email") || undefined,
      },
      coverImage: /^https:\/\/\S+$/.test(str(fd, "coverImage")) ? str(fd, "coverImage") : undefined,
      ai: undefined, // editing these fields switches the site to the ready-made template
      gallery: lines(str(fd, "gallery")).filter((u) => /^https:\/\/\S+$/.test(u)).slice(0, 8),
      sections: {
        ...w.content.sections,
        servicesTitle: str(fd, "servicesTitle") || undefined,
        highlightsTitle: str(fd, "highlightsTitle") || undefined,
        ctaTitle: str(fd, "ctaTitle") || undefined,
        ctaText: str(fd, "ctaText") || undefined,
      },
      seo: { title: str(fd, "seoTitle") || w.content.seo.title, description: str(fd, "seoDescription") || w.content.seo.description },
      pendingReview: lines(str(fd, "pendingReview")),
    };
    const template = z.enum(TEMPLATES).parse(str(fd, "template"));
    const v = await saveSiteEdit(s.orgId, siteId, { content, template, accent: str(fd, "accent") || w.accent }, `Editado por ${s.user.name}`);
    return `Versão ${v} salva.${w.status === "published" ? " Clique em “Publicar alterações” para colocar no ar." : ""}`;
  });
}

export async function rollbackAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    const v = await rollbackSite(s.orgId, siteId, Number(str(fd, "version")));
    return `Restaurado como versão ${v}.`;
  });
}

export async function publishAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    await publishWebsite(s.orgId, siteId, s.userId);
    return "Site publicado.";
  });
}

export async function unpublishAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    await unpublishWebsite(s.orgId, siteId, s.userId, str(fd, "reason") || "Manual");
    return "Site retirado do ar.";
  });
}

export async function setDomainAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    const d = str(fd, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (d && !/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) throw new Error("Domínio inválido.");
    await db.update(websites).set({ customDomain: d || null }).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    await audit(s.orgId, s.userId, "site.domain", siteId, { domain: d });
    return d ? `Domínio salvo. Agora adicione ${d} no Railway e aponte o DNS (veja instruções abaixo).` : "Domínio removido.";
  });
}

export async function followUpNow(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const [l] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, s.orgId)));
    if (!l) throw new Error("Lead não encontrado");
    const r = await queueOutreach(s.orgId, leadId, s.userId, "followup");
    if (!r.ok) throw new Error(r.reason);
    return "Follow-up enfileirado.";
  });
}

/** Asks the AI to adjust (or fully redo) the site. Photos given here are passed to the AI. */
export async function aiSiteAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    if (!llmConfigured()) throw new Error("Configure a OPENROUTER_API_KEY no Railway para usar a IA.");
    const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    if (!w) throw new Error("Site não encontrado");
    const instructions = str(fd, "instructions").slice(0, 1200);
    const fresh = str(fd, "op") === "fresh";
    const cover = str(fd, "coverImage");
    const gallery = lines(str(fd, "gallery")).filter((u) => /^https:\/\/\S+$/.test(u)).slice(0, 8);
    const coverImage = /^https:\/\/\S+$/.test(cover) ? cover : undefined;
    if (coverImage !== w.content.coverImage || gallery.join() !== (w.content.gallery ?? []).join()) {
      await saveSiteEdit(s.orgId, siteId, { content: { ...w.content, coverImage, gallery }, template: w.template, accent: w.accent }, "Fotos atualizadas");
    }
    if (!fresh && !instructions && !w.content.ai) throw new Error("Descreva o ajuste ou clique em “Criar outro design”.");
    await setSiteGen(w.leadId, { status: "queued", step: "", mode: "ai", startedAt: Date.now() });
    await enqueue(QUEUES.sites, "generate", { orgId: s.orgId, leadId: w.leadId, mode: "ai", instructions: fresh ? undefined : instructions || undefined }, { jobId: `site-${w.leadId}-${Date.now()}`, attempts: 1 });
    return fresh || !instructions ? "A IA está criando um novo design (1 a 4 minutos)." : "A IA está aplicando o ajuste (1 a 4 minutos).";
  });
}

/** Switches an AI site back to the ready-made template (keeps the AI version in history). */
export async function useTemplateAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    if (!w) throw new Error("Site não encontrado");
    const v = await saveSiteEdit(s.orgId, siteId, { content: { ...w.content, ai: undefined }, template: w.template, accent: w.accent }, "Trocado para o modelo pronto");
    return `Versão ${v}: agora usando o modelo pronto. O design da IA continua no histórico.`;
  });
}

/** Queues 3 AI logo proposals for the site. */
export async function requestLogoAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    if (!llmConfigured()) throw new Error("Configure a OPENROUTER_API_KEY no Railway para usar a IA.");
    const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    if (!w) throw new Error("Site não encontrado");
    await setSiteGen(w.leadId, { status: "queued", step: "", mode: "ai", startedAt: Date.now() });
    await enqueue(QUEUES.sites, "logo", { orgId: s.orgId, siteId }, { jobId: `logo-${siteId}-${Date.now()}`, attempts: 1 });
    return "A IA está desenhando 3 propostas de logo (cerca de 1 minuto).";
  });
}

/** Picks a logo proposal and whether the site shows it instead of the name. */
export async function saveLogoAction(fd: FormData) {
  const s = await requireSession();
  const siteId = str(fd, "siteId");
  return act(`/studio/${siteId}`, async () => {
    const [w] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, s.orgId)));
    if (!w?.content.logo) throw new Error("Gere o logo primeiro.");
    const idx = Number(str(fd, "selected"));
    const selected = Number.isInteger(idx) && idx >= 0 && idx < w.content.logo.options.length ? idx : null;
    const use = fd.get("use") === "on" && selected !== null;
    const v = await saveSiteEdit(s.orgId, siteId, { content: { ...w.content, logo: { ...w.content.logo, selected, use } }, template: w.template, accent: w.accent }, use ? "Logo aplicado no site" : "Logo escolhido (não aplicado)");
    return use ? `Versão ${v}: o logo agora aparece no site.` : `Versão ${v}: escolha salva. Marque “Usar no site” para aplicar.`;
  });
}
