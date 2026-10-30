"use server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, requireRole } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, conversations, leads, proposals, websites, products, TEMPLATES, type SiteContent } from "@/server/db";
import { createProposal, markSetupPaidManually, proposalUrl, publishWebsite, unpublishWebsite } from "@/server/commerce";
import { queueReply, queueOutreach } from "@/server/whatsapp/service";
import { rollbackSite, saveSiteEdit } from "@/server/sites/service";
import { formatBRL } from "@/lib/text";
import { audit } from "@/server/events";

const cents = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);

export async function createProposalAction(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const setup = str(fd, "setup");
    const monthly = str(fd, "monthly");
    const p = await createProposal(
      s.orgId,
      {
        leadId,
        productId: str(fd, "productId"),
        setupPriceCents: setup ? cents(setup) : undefined,
        monthlyPriceCents: monthly ? cents(monthly) : undefined,
        notes: str(fd, "notes"),
      },
      s.userId,
    );
    if (fd.get("send") === "on") {
      const [conv] = await db.select().from(conversations).where(and(eq(conversations.leadId, leadId), eq(conversations.orgId, s.orgId))).orderBy(desc(conversations.lastMessageAt)).limit(1);
      if (!conv) return `Proposta criada, mas não há conversa no WhatsApp. Link: ${proposalUrl(p.token)}`;
      const r = await queueReply(s.orgId, conv.id, `Segue a proposta do seu site, com a demonstração e o link de pagamento:\n${proposalUrl(p.token)}\n\nImplantação: ${formatBRL(p.setupPriceCents)} • Mensalidade: ${formatBRL(p.monthlyPriceCents)}`, "human", s.userId);
      if (!r.ok) throw new Error(r.reason);
      return "Proposta criada e enviada no WhatsApp.";
    }
    return `Proposta criada: ${proposalUrl(p.token)}`;
  });
}

export async function markPaidAction(fd: FormData) {
  const s = await requireRole("owner", "admin");
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    await markSetupPaidManually(s.orgId, str(fd, "proposalId"), s.userId, str(fd, "note"));
    return "Pagamento registrado.";
  });
}

export async function cancelProposalAction(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    await db.update(proposals).set({ status: "canceled" }).where(and(eq(proposals.id, str(fd, "proposalId")), eq(proposals.orgId, s.orgId)));
    return "Proposta cancelada.";
  });
}

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
    const reason = str(fd, "overrideReason");
    if (reason && s.role === "operator") throw new Error("Apenas owner/admin pode publicar com aprovação externa.");
    await publishWebsite(s.orgId, siteId, s.userId, reason ? { reason } : undefined);
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

export async function saveProductAction(fd: FormData) {
  const s = await requireRole("owner", "admin");
  return act("/finance", async () => {
    const id = str(fd, "productId");
    const data = {
      name: str(fd, "name"),
      description: str(fd, "description"),
      features: lines(str(fd, "features")),
      setupPriceCents: cents(str(fd, "setup")),
      monthlyPriceCents: cents(str(fd, "monthly")),
      active: fd.get("active") === "on",
    };
    if (!data.name || Number.isNaN(data.setupPriceCents) || Number.isNaN(data.monthlyPriceCents)) throw new Error("Preencha nome e valores.");
    if (id) await db.update(products).set(data).where(and(eq(products.id, id), eq(products.orgId, s.orgId)));
    else await db.insert(products).values({ ...data, orgId: s.orgId });
    return "Plano salvo.";
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
