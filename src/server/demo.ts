import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import {
  db,
  businesses,
  contactPoints,
  conversations,
  customers,
  intentClassifications,
  leads,
  messages,
  notifications,
  proposals,
  suppressionList,
  websites,
  whatsappInstances,
} from "./db";
import { ingestCandidates } from "./discovery/ingest";
import type { Candidate } from "./discovery/connectors";
import { generateSiteForLead } from "./sites/service";
import { publishWebsite } from "./sites/publish";
import { classifyByRules } from "./ai/classify";
import { transition } from "./handoff";
import { logLeadEvent, notify, setStage } from "./events";
import { previewUrl } from "./whatsapp/service";
import { getOrgSettings } from "./org";
import { renderTemplate, greeting } from "./whatsapp/limits";
import { DEMO_INSTANCE_PREFIX } from "@/lib/demo";
import { randomToken } from "@/lib/text";

/*
 * Sample data so a new operator can click through every screen without WhatsApp or Asaas.
 * Everything is flagged (businesses.is_demo, instance name prefix "demo-", notification type "demo:")
 * and guarded: demo leads/conversations can never send a real message.
 */

const base = { source: "manual" as const, license: "Dados de exemplo (fictícios)", city: "Recife", state: "PE" };
const DEMO: (Omit<Candidate, "source" | "license" | "payload" | "externalId"> & { key: string })[] = [
  { key: "barbearia", name: "Barbearia Exemplo Boa Vista", segment: "barbearia", phone: "81 90000-0001", instagram: "barbearia.exemplo", address: "Rua da Aurora, 100", neighborhood: "Boa Vista" },
  { key: "estetica", name: "Studio Exemplo Estética", segment: "estetica", phone: "81 90000-0002", address: "Av. Dezessete de Agosto, 200", neighborhood: "Casa Forte", openingHours: "Seg a Sáb, 9h às 19h" },
  { key: "oficina", name: "Oficina Exemplo Auto Center", segment: "oficina", phone: "81 90000-0003", address: "Av. Mal. Mascarenhas de Morais, 300", neighborhood: "Imbiribeira" },
  { key: "pet", name: "Pet Exemplo Banho e Tosa", segment: "petshop", phone: "81 90000-0004", website: "https://instagram.com/pet.exemplo", neighborhood: "Espinheiro" },
  { key: "salao", name: "Salão Exemplo Beleza", segment: "salao", phone: "81 90000-0005", neighborhood: "Graças" },
  { key: "restaurante", name: "Restaurante Exemplo Sabor", segment: "restaurante", phone: "81 3000-0006", neighborhood: "Recife Antigo" },
  { key: "clinica", name: "Clínica Exemplo Odonto", segment: "clinica", phone: "81 90000-0007", website: "https://clinica-exemplo-odonto.com.br", neighborhood: "Derby" },
];

export async function hasDemoData(orgId: string) {
  const [r] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.orgId, orgId), eq(businesses.isDemo, true))).limit(1);
  return !!r;
}

const ago = (min: number) => new Date(Date.now() - min * 60_000);

export async function seedDemo(orgId: string, userId: string) {
  if (await hasDemoData(orgId)) throw new Error("Os dados de exemplo já estão carregados.");
  const started = new Date(Date.now() - 1000);

  const res = await ingestCandidates(
    orgId,
    DEMO.map(({ key, ...c }) => ({ ...base, ...c, externalId: `demo|${key}|${randomToken(4)}`, payload: { demo: true } })),
  );
  const leadRows = await db
    .select({ lead: leads, b: businesses })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(inArray(leads.id, res.leadIds), gte(businesses.createdAt, started)));
  // Only businesses created now are flagged — a demo row that matched real data is never touched.
  await db.update(businesses).set({ isDemo: true }).where(inArray(businesses.id, leadRows.map((r) => r.b.id)));
  // Never let demo numbers reach a real WhatsApp check.
  await db.update(contactPoints).set({ waExists: true, verifiedAt: new Date() }).where(inArray(contactPoints.businessId, leadRows.map((r) => r.b.id)));
  const byKey = (k: string) => leadRows.find((r) => r.b.name === DEMO.find((d) => d.key === k)!.name)!;

  const [inst] = await db
    .insert(whatsappInstances)
    .values({ orgId, name: `${DEMO_INSTANCE_PREFIX}${orgId.slice(0, 8)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, label: "Exemplo (não envia mensagens)", status: "close", webhookToken: randomToken(24), paused: true })
    .returning();

  const settings = await getOrgSettings(orgId);

  async function conversation(
    k: string,
    contactName: string,
    thread: { dir: "in" | "out"; body: string; kind?: "outreach" | "reply" | "inbound"; author?: "lead" | "human" | "system"; min: number }[],
  ) {
    const r = byKey(k);
    const [conv] = await db
      .insert(conversations)
      .values({ orgId, leadId: r.lead.id, instanceId: inst!.id, remoteJid: `${r.b.phoneE164}@s.whatsapp.net`, phoneE164: r.b.phoneE164!, contactName, lastMessageAt: ago(thread.at(-1)!.min) })
      .returning();
    let lastIn: typeof messages.$inferSelect | undefined;
    for (const m of thread) {
      const [row] = await db
        .insert(messages)
        .values({
          orgId,
          conversationId: conv!.id,
          direction: m.dir,
          author: m.author ?? (m.dir === "in" ? "lead" : "human"),
          kind: m.kind ?? (m.dir === "in" ? "inbound" : "reply"),
          body: m.body,
          providerMessageId: `demo-${randomToken(8)}`,
          status: m.dir === "in" ? "received" : "read",
          sentAt: m.dir === "out" ? ago(m.min) : null,
          createdAt: ago(m.min),
        })
        .returning();
      if (m.dir === "in") lastIn = row;
    }
    if (lastIn) {
      const c = classifyByRules(lastIn.body);
      await db.insert(intentClassifications).values({
        orgId,
        messageId: lastIn.id,
        conversationId: conv!.id,
        intent: c.intent,
        confidence: c.confidence,
        urgency: c.urgency,
        sentiment: c.sentiment,
        suggestedAction: c.suggestedAction,
        suggestedReply: null,
        reason: c.reason,
        handoffRequired: c.handoffRequired,
        summary: c.summary,
        model: c.model,
      });
      await db.update(conversations).set({ lastIntent: c.intent, summary: c.summary, lastInboundAt: lastIn.createdAt, unread: 1 }).where(eq(conversations.id, conv!.id));
    }
    return { conv: conv!, r };
  }

  const firstMsg = async (k: string) => {
    const r = byKey(k);
    const [site] = await db.select().from(websites).where(eq(websites.leadId, r.lead.id)).limit(1);
    return renderTemplate(settings.outreachTemplate, { saudacao: greeting(new Date()), empresa: r.b.name, cidade: "Recife", link: previewUrl(site!), operador: "a equipe" });
  };

  // 1) Interested lead waiting for you (the "money" example).
  await generateSiteForLead(orgId, byKey("barbearia").lead.id);
  {
    const { conv, r } = await conversation("barbearia", "Carlos (exemplo)", [
      { dir: "out", kind: "outreach", author: "system", body: await firstMsg("barbearia"), min: 180 },
      { dir: "in", body: "Opa, boa tarde! Vi o site, ficou muito bom. Quanto fica pra fazer?", min: 12 },
    ]);
    await setStage(orgId, r.lead.id, "interested");
    await logLeadEvent(orgId, r.lead.id, "inbound", "Exemplo: lead respondeu perguntando o preço");
    await transition(orgId, conv.id, "HUMAN_REQUESTED", "price_request: exemplo");
    await notify(orgId, { type: "hot_lead", title: "🔥 Barbearia Exemplo Boa Vista · Recife", body: "“Quanto fica pra fazer?” — Apresentar planos e preços", link: `/inbox?c=${conv.id}`, priority: "high" });
  }

  // 2) Closed client: site approved and published.
  {
    const r = byKey("estetica");
    await db.update(businesses).set({ services: ["Limpeza de pele", "Design de sobrancelhas", "Massagem relaxante"], description: "Estúdio de estética em Casa Forte com atendimento com hora marcada." }).where(eq(businesses.id, r.b.id));
    const siteId = await generateSiteForLead(orgId, r.lead.id);
    await publishWebsite(orgId, siteId, userId);
  }

  // 3) Ready to contact.
  await generateSiteForLead(orgId, byKey("oficina").lead.id);

  // 4) Opt-out example: asked to stop → blocked forever.
  {
    const r = byKey("salao");
    await generateSiteForLead(orgId, r.lead.id);
    const { conv } = await conversation("salao", "Ana (exemplo)", [
      { dir: "out", kind: "outreach", author: "system", body: await firstMsg("salao"), min: 60 * 26 },
      { dir: "in", body: "Não tenho interesse, por favor não me mande mais mensagens.", min: 60 * 25 },
      { dir: "out", author: "system", body: "Tudo certo, não enviaremos mais mensagens. Obrigado e desculpe o incômodo!", min: 60 * 25 - 1 },
    ]);
    await db.insert(suppressionList).values({ orgId, value: r.b.phoneE164!, reason: "Exemplo: pediu para parar" }).onConflictDoNothing();
    await db.update(contactPoints).set({ permission: "opted_out" }).where(eq(contactPoints.businessId, r.b.id));
    await setStage(orgId, r.lead.id, "do_not_contact");
    await transition(orgId, conv.id, "RESOLVED", "Opt-out (exemplo)");
    await db.update(conversations).set({ unread: 0 }).where(eq(conversations.id, conv.id));
  }

  // Tag everything the seeding produced so it is easy to tell apart and remove.
  await db
    .update(notifications)
    .set({ type: sql`'demo:' || ${notifications.type}` })
    .where(and(eq(notifications.orgId, orgId), gte(notifications.createdAt, started), sql`${notifications.type} not like 'demo:%'`));
  return { leads: leadRows.length };
}

export async function removeDemo(orgId: string) {
  const demoBiz = await db.select({ id: businesses.id, phone: businesses.phoneE164 }).from(businesses).where(and(eq(businesses.orgId, orgId), eq(businesses.isDemo, true)));
  const phones = demoBiz.map((b) => b.phone).filter((p): p is string => !!p);
  await db.transaction(async (tx) => {
    if (phones.length) await tx.delete(suppressionList).where(and(eq(suppressionList.orgId, orgId), inArray(suppressionList.value, phones)));
    await tx.delete(whatsappInstances).where(and(eq(whatsappInstances.orgId, orgId), like(whatsappInstances.name, `${DEMO_INSTANCE_PREFIX}%`)));
    if (demoBiz.length) {
      const ids = demoBiz.map((b) => b.id);
      const demoLeadIds = (await tx.select({ id: leads.id }).from(leads).where(inArray(leads.businessId, ids))).map((l) => l.id);
      if (demoLeadIds.length) {
        // Payments/subscriptions reference customers without cascade: remove them via proposals first.
        await tx.delete(proposals).where(inArray(proposals.leadId, demoLeadIds));
        await tx.delete(customers).where(inArray(customers.leadId, demoLeadIds));
      }
      await tx.delete(businesses).where(inArray(businesses.id, ids));
    }
    await tx.delete(notifications).where(and(eq(notifications.orgId, orgId), like(notifications.type, "demo:%")));
  });
  return demoBiz.length;
}
