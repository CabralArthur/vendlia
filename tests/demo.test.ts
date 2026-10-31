import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db, organizations, users, memberships, businesses, leads, websites, conversations, messages, notifications, suppressionList, whatsappInstances } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { seedDemo, removeDemo, hasDemoData } from "@/server/demo";
import { getDemoRefs, getSetupProgress } from "@/server/onboarding";
import { ingestCandidates } from "@/server/discovery/ingest";
import { queueOutreach, queueReply } from "@/server/whatsapp/service";
import { resetDb } from "./helpers";

let orgId: string;
let userId: string;

beforeAll(async () => {
  await resetDb();
  const [u] = await db.insert(users).values({ email: "demo@vendlia.test", name: "Op Demo", passwordHash: "x" }).returning();
  userId = u!.id;
  const [o] = await db.insert(organizations).values({ name: "Org", slug: "org-demo", settings: defaultOrgSettings() }).returning();
  orgId = o!.id;
  await db.insert(memberships).values({ userId, orgId, role: "owner" });
  // One real business that must survive demo removal.
  await ingestCandidates(orgId, [{ source: "manual", externalId: "real-1", license: "manual", payload: {}, name: "Barbearia Real", segment: "barbearia", phone: "81 98765-4321", city: "Recife", state: "PE" }]);
});

describe("demo data", () => {
  it("seeds a full sample journey", async () => {
    const r = await seedDemo(orgId, userId);
    expect(r.leads).toBe(7);
    expect(await hasDemoData(orgId)).toBe(true);
    const demoLeads = await db.select({ stage: leads.stage }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(and(eq(leads.orgId, orgId), eq(businesses.isDemo, true)));
    const stages = demoLeads.map((l) => l.stage);
    expect(stages).toContain("interested");
    expect(stages).toContain("won");
    expect(stages).toContain("preview_ready");
    expect(stages).toContain("do_not_contact");
    const [pub] = await db.select().from(websites).where(and(eq(websites.orgId, orgId), eq(websites.status, "published")));
    expect(pub).toBeTruthy();
    const conv = await db.select().from(conversations).where(eq(conversations.state, "HUMAN_REQUESTED"));
    expect(conv).toHaveLength(1);
    const refs = await getDemoRefs(orgId);
    expect(refs.leadId && refs.siteId && refs.conversationId).toBeTruthy();
    // Notifications produced by seeding are tagged.
    const untagged = await db.select().from(notifications).where(and(eq(notifications.orgId, orgId)));
    expect(untagged.every((n) => n.type.startsWith("demo:"))).toBe(true);
    await expect(seedDemo(orgId, userId)).rejects.toThrow(/já estão carregados/);
  });

  it("never sends messages from demo data", async () => {
    const refs = await getDemoRefs(orgId);
    const out = await queueOutreach(orgId, refs.leadId!, userId);
    expect(out.ok).toBe(false);
    const reply = await queueReply(orgId, refs.conversationId!, "olá", "human", userId);
    expect(reply.ok).toBe(false);
    const queued = await db.select().from(messages).where(eq(messages.status, "queued"));
    expect(queued).toHaveLength(0);
  });

  it("does not count demo data as real setup progress", async () => {
    const p = await getSetupProgress(orgId);
    const by = Object.fromEntries(p.steps.map((s) => [s.id, s.done]));
    expect(by.leads).toBe(true); // the real business
    expect(by.preview).toBe(false);
    expect(by.contact).toBe(false);
    expect(by.publish).toBe(false);
    expect(by.whatsapp).toBe(false);
  });

  it("removes every demo row and keeps real data", async () => {
    const n = await removeDemo(orgId);
    expect(n).toBe(7);
    expect(await hasDemoData(orgId)).toBe(false);
    expect(await db.select().from(whatsappInstances).where(like(whatsappInstances.name, "demo-%"))).toHaveLength(0);
    expect(await db.select().from(conversations)).toHaveLength(0);
    expect(await db.select().from(websites).where(eq(websites.orgId, orgId))).toHaveLength(0);
    expect(await db.select().from(suppressionList)).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.orgId, orgId))).toHaveLength(0);
    const real = await db.select().from(businesses).where(eq(businesses.orgId, orgId));
    expect(real.map((b) => b.name)).toEqual(["Barbearia Real"]);
  });
});
