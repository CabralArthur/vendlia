import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, organizations, discoveryRuns } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { runDiscovery } from "@/server/discovery/run";
import { resetDb } from "./helpers";

let orgId: string;
const ok = { elements: [{ type: "node", id: 77, tags: { name: "Barbearia Live", shop: "barber", phone: "81 99999-0001" } }] };

function fetchStub(overpassStatus: number) {
  return (async (url: string) => {
    if (new URL(url).host === "nominatim.openstreetmap.org") return new Response(JSON.stringify([{ osm_type: "relation", osm_id: 1, addresstype: "city" }]));
    return overpassStatus === 200 ? new Response(JSON.stringify(ok)) : new Response("busy", { status: overpassStatus });
  }) as unknown as typeof fetch;
}

async function newRun() {
  const [r] = await db.insert(discoveryRuns).values({ orgId, source: "osm", params: { city: "Recife", state: "PE", segment: "barbearia" } }).returning();
  return r!.id;
}

beforeAll(async () => {
  await resetDb();
  const [o] = await db.insert(organizations).values({ name: "Live", slug: "live", settings: defaultOrgSettings(), unlimited: true }).returning();
  orgId = o!.id;
});

describe("live search progress", () => {
  it("records each step of a successful search", async () => {
    const id = await newRun();
    await runDiscovery(id, fetchStub(200), { retryDelayMs: 0 });
    const [r] = await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, id));
    expect(r!.status).toBe("done");
    const msgs = r!.logs.map((l) => l.msg);
    expect(msgs[0]).toMatch(/Busca iniciada: Barbearia em Recife\/PE/);
    expect(msgs.some((m) => /Localizando Recife\/PE/.test(m))).toBe(true);
    expect(msgs.some((m) => /Cidade encontrada/.test(m))).toBe(true);
    expect(msgs.some((m) => /1 empresa recebida/.test(m))).toBe(true);
    expect(msgs.some((m) => /1 empresa nova/.test(m))).toBe(true);
    expect(msgs.at(-1)).toMatch(/Concluída/);
    expect(r!.logs.every((l) => !Number.isNaN(Date.parse(l.t)))).toBe(true);
  });

  it("records retries and a clear final error when servers fail", async () => {
    const id = await newRun();
    await expect(runDiscovery(id, fetchStub(502), { retryDelayMs: 0 })).rejects.toThrow();
    const [r] = await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, id));
    expect(r!.status).toBe("failed");
    expect(r!.logs.filter((l) => l.level === "warn" && /HTTP 502/.test(l.msg)).length).toBe(6);
    expect(r!.logs.some((l) => /Nova tentativa/.test(l.msg))).toBe(true);
    expect(r!.logs.at(-1)!.level).toBe("error");
    expect(r!.logs.at(-1)!.msg).toMatch(/sobrecarregado/);
  });
});
