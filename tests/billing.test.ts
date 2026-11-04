import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, organizations } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { access, assertQuota, consumeQuota, handleAsaasEvent, quotaStatus, startCheckout, windowStart, assertCanSend, assertCanAddNumber, cancelSubscription } from "@/server/billing";
import { AsaasClient } from "@/server/billing/asaas";
import { priceFor } from "@/lib/plans";
import { resetDb } from "./helpers";

const DAY = 86_400_000;
let orgId: string;

function asaasStub() {
  const calls: { method: string; path: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace("/v3", "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method ?? "GET", path, body });
    if (path === "/customers") return new Response(JSON.stringify({ id: "cus_1" }));
    if (path === "/subscriptions") return new Response(JSON.stringify({ id: `sub_${calls.length}`, nextDueDate: "2026-11-04", status: "ACTIVE" }));
    if (/\/subscriptions\/.+\/payments/.test(path)) return new Response(JSON.stringify({ data: [{ id: "pay_1", status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/abc", value: 197, customer: "cus_1" }] }));
    if (init.method === "DELETE") return new Response(JSON.stringify({ deleted: true }));
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { client: new AsaasClient("https://api-sandbox.asaas.com/v3", "k", f), calls };
}

beforeAll(async () => {
  await resetDb();
  const [o] = await db.insert(organizations).values({ name: "Agência X", slug: "agx", settings: defaultOrgSettings(), trialEndsAt: new Date(Date.now() + 7 * DAY) }).returning();
  orgId = o!.id;
});

describe("plans and quotas", () => {
  it("prices cycles with discounts", () => {
    expect(priceFor("pro", "monthly")).toEqual({ perMonth: 197, total: 197 });
    expect(priceFor("pro", "quarterly")).toEqual({ perMonth: 177.3, total: 531.9 });
    expect(priceFor("inicial", "yearly")).toEqual({ perMonth: 77.6, total: 931.2 });
  });

  it("trial allows 1 AI site and 3 searches, no sending, no numbers", async () => {
    await assertQuota(orgId, "site");
    await consumeQuota(orgId, "site");
    await expect(assertQuota(orgId, "site")).rejects.toThrow(/teste grátis/);
    for (let i = 0; i < 3; i++) await consumeQuota(orgId, "search");
    await expect(assertQuota(orgId, "search")).rejects.toThrow(/3 buscas/);
    await expect(assertCanSend(orgId)).rejects.toThrow(/Copiar mensagem/);
    await expect(assertCanAddNumber(orgId)).rejects.toThrow(/não conecta número/);
  });

  it("blocks everything when the trial ends", async () => {
    const [o] = await db.update(organizations).set({ trialEndsAt: new Date(Date.now() - DAY) }).where(eq(organizations.id, orgId)).returning();
    expect(access(o!).ok).toBe(false);
    await expect(assertQuota(orgId, "logo")).rejects.toThrow(/teste grátis terminou/);
  });

  it("counts quotas monthly from the subscription anniversary", () => {
    const o = { plan: "pro", periodStart: new Date("2026-08-15T12:00:00Z"), createdAt: new Date("2026-08-01") } as never;
    expect(windowStart(o, new Date("2026-11-04T10:00:00Z")).toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(windowStart(o, new Date("2026-11-20T10:00:00Z")).toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
});

describe("Asaas checkout and webhook", () => {
  it("creates customer + subscription and returns the invoice link", async () => {
    const { client, calls } = asaasStub();
    await expect(startCheckout(orgId, { plan: "pro", cycle: "monthly", name: "Agência X", email: "a@x.com", cpfCnpj: "111.111.111-11" }, client)).rejects.toThrow(/CPF ou CNPJ inválido/);
    const url = await startCheckout(orgId, { plan: "pro", cycle: "quarterly", name: "Agência X", email: "a@x.com", cpfCnpj: "529.982.247-25" }, client);
    expect(url).toBe("https://sandbox.asaas.com/i/abc");
    const sub = calls.find((c) => c.path === "/subscriptions")!;
    expect(sub.body).toMatchObject({ customer: "cus_1", value: 531.9, cycle: "QUARTERLY", billingType: "UNDEFINED", externalReference: `sub:${orgId}:pro:quarterly` });
    const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(o!.billingStatus).toBe("pending");
    expect(access(o!).reason).toMatch(/aguardando a confirmação/);
  });

  it("activates the plan when the payment is confirmed (once)", async () => {
    const [o0] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const ev = { id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1", customer: "cus_1", subscription: o0!.asaasSubscriptionId, value: 531.9, status: "CONFIRMED", externalReference: `sub:${orgId}:pro:quarterly` } };
    expect(await handleAsaasEvent(ev)).toBe("assinatura ativa");
    expect(await handleAsaasEvent(ev)).toBe("duplicado");
    const q = await quotaStatus(orgId);
    expect(q.org.plan).toBe("pro");
    expect(q.org.billingStatus).toBe("active");
    expect(q.access.ok).toBe(true);
    expect(q.used.site).toBe(0); // new plan → fresh quota window
    expect(Math.round((q.org.currentPeriodEnd!.getTime() - Date.now()) / DAY)).toBeGreaterThanOrEqual(89);
    await assertCanSend(orgId);
    await assertCanAddNumber(orgId);
  });

  it("adds pack credits, marks overdue and cancels", async () => {
    expect(await handleAsaasEvent({ id: "evt_2", event: "PAYMENT_RECEIVED", payment: { id: "pay_2", customer: "cus_1", value: 39, status: "RECEIVED", externalReference: `pack:${orgId}:10` } })).toBe("pacote liberado");
    expect((await quotaStatus(orgId)).extraSites).toBe(10);
    const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(await handleAsaasEvent({ id: "evt_3", event: "PAYMENT_OVERDUE", payment: { id: "pay_3", customer: "cus_1", subscription: o!.asaasSubscriptionId, value: 1, status: "OVERDUE" } })).toBe("em atraso");
    expect((await quotaStatus(orgId)).access.ok).toBe(true); // grace period
    const { client } = asaasStub();
    await cancelSubscription(orgId, client);
    const q = await quotaStatus(orgId);
    expect(q.org.billingStatus).toBe("canceled");
    expect(q.access.ok).toBe(true); // keeps access until the end of the paid period
  });
});

describe("quota on AI sites in the generation job", () => {
  it("falls back to the free template when the AI site quota is used up", async () => {
    const { businesses, leads, websites } = await import("@/server/db");
    const { generateSiteForLead } = await import("@/server/sites/service");
    const [o] = await db.insert(organizations).values({ name: "Trial", slug: "trial-q", settings: defaultOrgSettings(), trialEndsAt: new Date(Date.now() + DAY) }).returning();
    await consumeQuota(o!.id, "site");
    const [b] = await db.insert(businesses).values({ orgId: o!.id, name: "Bar Teste", normalizedName: "bar teste", segment: "restaurante", city: "Recife", state: "PE" }).returning();
    const [l] = await db.insert(leads).values({ orgId: o!.id, businessId: b!.id }).returning();
    await generateSiteForLead(o!.id, l!.id);
    const [w] = await db.select().from(websites).where(eq(websites.leadId, l!.id));
    expect(w!.content.ai).toBeUndefined();
    expect(w!.content.pendingReview[0]).toMatch(/modelo pronto: Você já usou/);
  });
});
