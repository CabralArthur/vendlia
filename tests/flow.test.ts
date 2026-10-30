import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  organizations,
  users,
  memberships,
  leads,
  businesses,
  websites,
  whatsappInstances,
  conversations,
  messages,
  notifications,
  proposals,
  payments,
  subscriptions,
  suppressionList,
  products,
  contactPoints,
  providerEvents,
  intentClassifications,
} from "@/server/db";
import { defaultOrgSettings, seedOrgDefaults } from "@/server/org";
import { ingestCandidates } from "@/server/discovery/ingest";
import { mapOsmElements } from "@/server/discovery/connectors";
import { generateSiteForLead } from "@/server/sites/service";
import { EvolutionClient } from "@/server/whatsapp/evolution";
import { intakeEvolutionWebhook, processProviderEvent, queueOutreach, queueReply, sendQueuedMessage } from "@/server/whatsapp/service";
import { approveContent, checkoutProposal, createProposal, intakeAsaasWebhook, processAsaasEvent, publishWebsite } from "@/server/commerce";
import { resetDb, stubFetch } from "./helpers";

const MONDAY_10AM = new Date("2026-11-02T13:00:00Z");

let orgId: string;
let otherOrgId: string;
let userId: string;
let leadId: string;
let leadId2: string;
let instanceToken: string;
let sentCounter = 0;

const evo = stubFetch({
  "POST /message/sendText/.*": (_u, init: any) => ({
    key: { id: `OUT${++sentCounter}`, remoteJid: `${init.body.number}@s.whatsapp.net`, fromMe: true },
    status: "PENDING",
  }),
});
const evoClient = new EvolutionClient("http://evolution.test", "evo-key", evo.fetch);

function upsert(id: string, phone: string, text: string, fromMe = false) {
  return {
    event: "messages.upsert",
    instance: "vendlia-main",
    date_time: new Date().toISOString(),
    data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe, id }, pushName: "Zé", message: { conversation: text }, messageType: "conversation", messageTimestamp: Date.now() / 1000 },
  };
}

async function deliver(payload: any, token = instanceToken) {
  const r = await intakeEvolutionWebhook(token, payload);
  if (r.body === "ok") {
    const [ev] = await db.select().from(providerEvents).orderBy(providerEvents.createdAt);
    const all = await db.select().from(providerEvents);
    for (const e of all) if (!e.processedAt) await processProviderEvent(e.id);
    void ev;
  }
  return r;
}

beforeAll(async () => {
  await resetDb();
  const [u] = await db.insert(users).values({ email: "op@vendlia.test", name: "Rafael Operador", passwordHash: "x" }).returning();
  userId = u!.id;
  const [o] = await db.insert(organizations).values({ name: "Vendlia", slug: "vendlia", settings: defaultOrgSettings() }).returning();
  orgId = o!.id;
  await db.insert(memberships).values({ userId, orgId, role: "owner" });
  await seedOrgDefaults(db, orgId);
  const [o2] = await db.insert(organizations).values({ name: "Outra", slug: "outra", settings: defaultOrgSettings() }).returning();
  otherOrgId = o2!.id;
  instanceToken = "tok-" + "a".repeat(30);
  await db.insert(whatsappInstances).values({ orgId, name: "vendlia-main", label: "Principal", status: "open", webhookToken: instanceToken, warmupStartedAt: new Date("2026-01-01") });
});

describe("discovery + dedup", () => {
  it("ingests OSM candidates, dedups by phone/name and scores", async () => {
    const p = { city: "Recife", state: "PE", segment: "barbearia" as const };
    const cands = mapOsmElements(
      [
        { type: "node", id: 10, tags: { name: "Barbearia do Zé", shop: "hairdresser", phone: "(81) 99999-8888", "addr:street": "Rua Velha", "addr:housenumber": "12", "addr:suburb": "Boa Vista" } },
        { type: "node", id: 11, tags: { name: "BARBEARIA DO ZÉ LTDA", shop: "hairdresser", phone: "81999998888" } },
        { type: "node", id: 12, tags: { name: "Barber Shop Tem Site", shop: "hairdresser", phone: "81988887777", website: "https://barbershop.com.br" } },
        { type: "node", id: 13, tags: { name: "Salão Insta", shop: "hairdresser", phone: "81977776666", website: "https://instagram.com/salao.insta" } },
      ],
      p,
    );
    const r = await ingestCandidates(orgId, cands);
    expect(r.created).toBe(3);
    expect(r.updated).toBe(1);
    const again = await ingestCandidates(orgId, cands);
    expect(again.created).toBe(0);

    const rows = await db.select({ lead: leads, b: businesses }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(eq(leads.orgId, orgId));
    const ze = rows.find((x) => x.b.name === "Barbearia do Zé")!;
    const site = rows.find((x) => x.b.name === "Barber Shop Tem Site")!;
    const insta = rows.find((x) => x.b.name === "Salão Insta")!;
    expect(ze.b.phoneE164).toBe("5581999998888");
    expect(site.b.websiteStatus).toBe("has_website");
    expect(insta.b.websiteStatus).toBe("social_only");
    expect(insta.b.instagram).toBe("salao.insta");
    expect(ze.lead.score).toBeGreaterThan(site.lead.score);
    expect(ze.lead.stage).toBe("qualified");
    leadId = ze.lead.id;
    leadId2 = insta.lead.id;
  });

  it("isolates organizations", async () => {
    const other = await db.select().from(leads).where(eq(leads.orgId, otherOrgId));
    expect(other).toHaveLength(0);
    await expect(generateSiteForLead(otherOrgId, leadId)).rejects.toThrow();
  });
});

describe("website studio", () => {
  it("generates a preview site from facts only", async () => {
    const id = await generateSiteForLead(orgId, leadId);
    const [w] = await db.select().from(websites).where(eq(websites.id, id));
    expect(w!.template).toBe("barber");
    expect(w!.status).toBe("preview");
    expect(w!.content.generatedBy).toBe("rules");
    expect(w!.content.pendingReview.length).toBeGreaterThan(0);
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l!.stage).toBe("preview_ready");
  });
});

describe("whatsapp outreach → reply → handoff", () => {
  it("refuses outreach without a preview", async () => {
    const r = await queueOutreach(orgId, leadId2, userId);
    expect(r.ok).toBe(false);
  });

  it("queues and sends the first contact with pacing", async () => {
    const r = await queueOutreach(orgId, leadId, userId);
    expect(r.ok).toBe(true);
    const id = (r as { messageId: string }).messageId;

    // At night it must be delayed, not sent.
    const night = await sendQueuedMessage(id, { client: evoClient, now: new Date("2026-11-02T02:00:00Z") });
    expect(night.status).toBe("delay");

    const out = await sendQueuedMessage(id, { client: evoClient, now: MONDAY_10AM });
    expect(out.status).toBe("sent");
    const call = evo.calls.find((c) => c.url.includes("/message/sendText/vendlia-main"))!;
    expect(call.headers.apikey).toBe("evo-key");
    expect(call.body.number).toBe("5581999998888");
    expect(call.body.text).toContain("/s/");
    expect(call.body.text).toContain("SAIR");

    // Idempotent: a second attempt never re-sends.
    const again = await sendQueuedMessage(id, { client: evoClient, now: MONDAY_10AM });
    expect(again.status).toBe("skipped");
    expect(evo.calls.filter((c) => c.url.includes("sendText"))).toHaveLength(1);

    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l!.stage).toBe("contacted");
    // second outreach to same lead is blocked
    expect((await queueOutreach(orgId, leadId, userId)).ok).toBe(false);
  });

  it("rejects webhooks with a bad token and de-duplicates events", async () => {
    expect((await intakeEvolutionWebhook("wrong", upsert("IN1", "5581999998888", "oi") as any)).status).toBe(401);
    const first = await deliver(upsert("IN1", "5581999998888", "Gostei da demonstração. Quanto fica?"));
    expect(first.status).toBe(200);
    const dup = await deliver(upsert("IN1", "5581999998888", "Gostei da demonstração. Quanto fica?"));
    expect(dup.body).toBe("duplicado");
    const inbound = await db.select().from(messages).where(eq(messages.direction, "in"));
    expect(inbound).toHaveLength(1);
  });

  it("classifies interest, hands off to a human and alerts", async () => {
    const [conv] = await db.select().from(conversations).where(eq(conversations.leadId, leadId));
    expect(conv!.state).toBe("HUMAN_REQUESTED");
    expect(conv!.lastIntent).toBe("price_request");
    const [cls] = await db.select().from(intentClassifications);
    expect(cls!.handoffRequired).toBe(true);
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l!.stage).toBe("interested");
    const notes = await db.select().from(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.type, "hot_lead")));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.priority).toBe("high");
  });

  it("never lets AI and human talk at the same time", async () => {
    const [conv] = await db.select().from(conversations).where(eq(conversations.leadId, leadId));
    const ai = await queueReply(orgId, conv!.id, "resposta automática", "ai", null);
    expect(ai.ok).toBe(false);
    const human = await queueReply(orgId, conv!.id, "Oi Zé! O plano essencial fica R$ 497 + R$ 79/mês.", "human", userId);
    expect(human.ok).toBe(true);
    const [c2] = await db.select().from(conversations).where(eq(conversations.id, conv!.id));
    expect(c2!.state).toBe("HUMAN_ACTIVE");
    expect(c2!.assigneeId).toBe(userId);
    const sent = await sendQueuedMessage((human as any).messageId, { client: evoClient });
    expect(sent.status).toBe("sent"); // human replies are not limited to business hours

    // Status update via webhook moves message forward, never backwards.
    const providerId = (sent as any).providerMessageId;
    await deliver({ event: "messages.update", instance: "vendlia-main", data: { keyId: providerId, remoteJid: "5581999998888@s.whatsapp.net", fromMe: true, status: "READ" } });
    await deliver({ event: "messages.update", instance: "vendlia-main", data: { keyId: providerId, remoteJid: "5581999998888@s.whatsapp.net", fromMe: true, status: "DELIVERY_ACK" } });
    const [m] = await db.select().from(messages).where(eq(messages.providerMessageId, providerId));
    expect(m!.status).toBe("read");

    // Echo of our own send is not duplicated; a message typed on the phone is recorded as human.
    await deliver(upsert(providerId, "5581999998888", "Oi Zé! O plano...", true));
    await deliver(upsert("PHONE1", "5581999998888", "te mandei a proposta", true));
    const outs = await db.select().from(messages).where(and(eq(messages.conversationId, conv!.id), eq(messages.direction, "out")));
    expect(outs).toHaveLength(3);
  });
});

describe("proposal → checkout → payment → publish", () => {
  let token: string;
  const asaas = stubFetch({
    "POST /v3/customers": () => ({ id: "cus_1" }),
    "POST /v3/payments": (_u, init: any) => ({ id: "pay_setup", customer: "cus_1", value: init.body.value, status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/pay_setup", dueDate: init.body.dueDate }),
    "POST /v3/subscriptions": (_u, init: any) => ({ id: "sub_1", nextDueDate: init.body.nextDueDate, status: "ACTIVE" }),
    "GET /v3/payments/pay_setup": () => ({ id: "pay_setup", customer: "cus_1", value: 497, status: "CONFIRMED" }),
    "GET /v3/payments/pay_m1": () => ({ id: "pay_m1", customer: "cus_1", subscription: "sub_1", value: 79, status: "OVERDUE", dueDate: "2026-12-02" }),
  });

  it("creates a proposal and cancels conflicting ones", async () => {
    const [prod] = await db.select().from(products).where(eq(products.orgId, orgId)).orderBy(products.setupPriceCents);
    await createProposal(orgId, { leadId, productId: prod!.id }, userId);
    const p = await createProposal(orgId, { leadId, productId: prod!.id, setupPriceCents: 45000 }, userId);
    token = p.token;
    const all = await db.select().from(proposals).where(eq(proposals.leadId, leadId));
    expect(all.filter((x) => x.status === "canceled")).toHaveLength(1);
    expect(p.setupPriceCents).toBe(45000);
  });

  it("validates checkout input", async () => {
    await expect(checkoutProposal(token, { name: "Zé", document: "123", email: "a@b.co", approveContent: false, acceptTerms: true }, asaas.fetch)).rejects.toThrow(/CPF/);
    await expect(checkoutProposal(token, { name: "José da Silva", document: "52998224725", email: "a@b.co", approveContent: false, acceptTerms: false }, asaas.fetch)).rejects.toThrow();
  });

  it("creates customer, setup charge and subscription at the gateway", async () => {
    const r = await checkoutProposal(token, { name: "José da Silva", document: "529.982.247-25", email: "ze@barbearia.com", approveContent: false, acceptTerms: true }, asaas.fetch);
    expect(r.redirectUrl).toBe("https://sandbox.asaas.com/i/pay_setup");
    const payCall = asaas.calls.find((c) => c.url.endsWith("/v3/payments") && c.method === "POST")!;
    expect(payCall.body.value).toBe(450);
    expect(payCall.headers.access_token).toBe("asaas-test-key");
    const subCall = asaas.calls.find((c) => c.url.endsWith("/v3/subscriptions"))!;
    expect(subCall.body.cycle).toBe("MONTHLY");
    // Re-submitting returns the same charge instead of creating another.
    const again = await checkoutProposal(token, { name: "José da Silva", document: "52998224725", email: "ze@barbearia.com", approveContent: false, acceptTerms: true }, asaas.fetch);
    expect(again.redirectUrl).toBe(r.redirectUrl);
    expect(asaas.calls.filter((c) => c.url.endsWith("/v3/payments") && c.method === "POST")).toHaveLength(1);
  });

  it("does not publish before payment", async () => {
    const [p] = await db.select().from(proposals).where(eq(proposals.token, token));
    await expect(publishWebsite(orgId, p!.websiteId!, userId)).rejects.toThrow(/pagamento/);
  });

  it("confirms payment only via authenticated webhook + provider re-check", async () => {
    const body = { id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_setup", customer: "cus_1", value: 450, status: "CONFIRMED" } };
    expect((await intakeAsaasWebhook("bad", body)).status).toBe(401);
    const ok = await intakeAsaasWebhook("asaas-webhook-token-123456789012345", body);
    expect(ok.status).toBe(200);
    expect((await intakeAsaasWebhook("asaas-webhook-token-123456789012345", body)).body).toBe("duplicado");
    const [ev] = await db.select().from(providerEvents).where(eq(providerEvents.eventId, "evt_1"));
    await processAsaasEvent(ev!.id, asaas.fetch);
    expect(asaas.calls.some((c) => c.url.endsWith("/v3/payments/pay_setup") && c.method === "GET")).toBe(true);
    const [p] = await db.select().from(proposals).where(eq(proposals.token, token));
    expect(p!.status).toBe("paid");
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l!.stage).toBe("won");
    const [pay] = await db.select().from(payments).where(eq(payments.providerPaymentId, "pay_setup"));
    expect(pay!.status).toBe("confirmed");
    const [w] = await db.select().from(websites).where(eq(websites.id, p!.websiteId!));
    expect(w!.status).toBe("preview"); // still waiting for content approval
  });

  it("publishes automatically once the client approves the content", async () => {
    await approveContent(token);
    const [p] = await db.select().from(proposals).where(eq(proposals.token, token));
    const [w] = await db.select().from(websites).where(eq(websites.id, p!.websiteId!));
    expect(w!.status).toBe("published");
    expect(w!.publishedVersion).toBe(w!.version);
    expect(w!.content.pendingReview).toEqual([]);
  });

  it("tracks overdue monthly charges from the subscription", async () => {
    const body = { id: "evt_2", event: "PAYMENT_OVERDUE", payment: { id: "pay_m1", customer: "cus_1", subscription: "sub_1", value: 79, status: "OVERDUE" } };
    await intakeAsaasWebhook("asaas-webhook-token-123456789012345", body);
    const [ev] = await db.select().from(providerEvents).where(eq(providerEvents.eventId, "evt_2"));
    await processAsaasEvent(ev!.id, asaas.fetch);
    const [m] = await db.select().from(payments).where(eq(payments.providerPaymentId, "pay_m1"));
    expect(m!.kind).toBe("monthly");
    expect(m!.status).toBe("overdue");
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, "sub_1"));
    expect(s!.status).toBe("overdue");
  });
});

describe("opt-out", () => {
  it("suppresses the number, cancels queued messages and blocks future sends", async () => {
    await generateSiteForLead(orgId, leadId2);
    const q = await queueOutreach(orgId, leadId2, userId);
    expect(q.ok).toBe(true);
    await sendQueuedMessage((q as any).messageId, { client: evoClient, now: new Date("2026-11-02T15:00:00Z") });
    await deliver(upsert("IN-STOP", "5581977776666", "SAIR"));
    const sup = await db.select().from(suppressionList).where(eq(suppressionList.orgId, orgId));
    expect(sup.map((s) => s.value)).toContain("5581977776666");
    const [cp] = await db.select().from(contactPoints).where(eq(contactPoints.value, "5581977776666"));
    expect(cp!.permission).toBe("opted_out");
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId2));
    expect(l!.stage).toBe("do_not_contact");
    const [conv] = await db.select().from(conversations).where(eq(conversations.leadId, leadId2));
    const blocked = await queueReply(orgId, conv!.id, "oi de novo", "human", userId);
    expect(blocked.ok).toBe(false);
    // The single confirmation message is allowed through.
    const ack = (await db.select().from(messages).where(and(eq(messages.conversationId, conv!.id), eq(messages.author, "system"), eq(messages.kind, "reply"))))[0]!;
    const sent = await sendQueuedMessage(ack.id, { client: evoClient });
    expect(sent.status).toBe("sent");
  });
});
