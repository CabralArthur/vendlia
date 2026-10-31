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
