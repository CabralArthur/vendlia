import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, organizations, businesses, leads, websites, usageRecords } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { resetEnvCache } from "@/server/env";
import { checkDesign, fillPlaceholders, googleFontsHref, parseDesign, sanitizeDesign, visibleText } from "@/server/ai/sitedesign";
import { generateSiteForLead } from "@/server/sites/service";
import { getSiteGen } from "@/server/sites/progress";
import { resetDb } from "./helpers";

const sample = readFileSync(new URL("./fixtures/design-mariazinha.txt", import.meta.url), "utf8");
const facts = {
  name: "Mariazinha Bar e Comida Brasileira",
  segment: "restaurante",
  neighborhood: "Tamarineira",
  city: "Recife",
  state: "PE",
  address: "Rua Cônego Barata, 210",
  phoneE164: "5581999991002",
  instagram: "mariazinhabar",
  openingHours: "Mo-Sa 11:00-16:00; Su 11:00-15:00",
  services: [] as string[],
};

function modelStub(texts: string[]) {
  const calls: { body: any }[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ body });
    const isDesign = body.model === "anthropic/claude-opus-5.5";
    const content = isDesign ? texts.shift() ?? "" : "{}"; // copy call returns junk → rule copy is used
    const usage = { prompt_tokens: 5000, completion_tokens: 9000, cost: isDesign ? 0.2 : 0.001 };
    if (body.stream) {
      // Server-sent events in small chunks, usage in the last event (as OpenRouter does).
      const parts = content.match(/[\s\S]{1,500}/g) ?? [""];
      const sse = [": OPENROUTER PROCESSING\n\n", ...parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage })}\n\n`, "data: [DONE]\n\n"].join("");
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("AI design: parse, sanitize, check", () => {
  it("parses meta + site and strips unsafe content", () => {
    const { meta, html } = parseDesign(sample);
    expect(meta.businessType).toMatch(/Boteco/);
    expect(meta.fonts.map((f) => f.family)).toEqual(["Gloock", "Familjen Grotesk"]);
    const clean = sanitizeDesign(html);
    expect(clean).not.toMatch(/<script|alert\(/);
    expect(clean).toContain('href="{{WA:Quero pedir: Almoço}}"');
    expect(clean).toContain(".vai .info div+div"); // CSS combinators survive
    expect(checkDesign(clean, facts, { whatsapp: "5581999991002" })).toEqual([]);
    const text = visibleText(clean);
    expect(text).toContain("Mariazinha");
    expect(text).not.toContain(".vai");
  });

  it("accepts section numbers and the current year, rejects invented big numbers", () => {
    const base = sanitizeDesign(parseDesign(sample).html);
    const ok = base.replace("Mesa posta na Tamarineira", `01 Mesa posta na Tamarineira ${new Date().getFullYear()}`);
    expect(checkDesign(ok, facts, { whatsapp: "5581999991002" })).toEqual([]);
    const bad = base.replace("Mesa posta na Tamarineira", "Mais de 500 pratos por dia");
    expect(checkDesign(bad, facts, { whatsapp: "5581999991002" }).join()).toMatch(/500/);
    const h24 = base.replace("Mesa posta na Tamarineira", "Aberto 24h");
    expect(checkDesign(h24, facts, { whatsapp: "5581999991002" }).join()).toMatch(/24h/);
  });

  it("flags invented claims and numbers", () => {
    const bad = sanitizeDesign(parseDesign(sample).html.replace("Mesa posta na Tamarineira", "Há 25 anos o melhor da Tamarineira"));
    const p = checkDesign(bad, facts, { whatsapp: "5581999991002" });
    expect(p.join(" ")).toMatch(/afirmação não comprovada|números/);
  });

  it("fills placeholders with safe links and builds font URLs", () => {
    const html = fillPlaceholders(sanitizeDesign(parseDesign(sample).html), { whatsapp: "5581999991002", instagram: "mariazinhabar", mapsUrl: "https://www.google.com/maps/search/?api=1&query=x", mapEmbed: "https://www.openstreetmap.org/export/embed.html?bbox=1", name: "M" });
    expect(html).toContain("https://wa.me/5581999991002?text=Ol%C3%A1!%20Vi%20o%20site%20de%20voc%C3%AAs.%20Quero%20pedir%3A%20Almo%C3%A7o");
    expect(html).toContain('href="https://instagram.com/mariazinhabar"');
    expect(html).toContain("<iframe");
    expect(html).not.toMatch(/\{\{/);
    expect(googleFontsHref({ family: "Familjen Grotesk", weights: [600, 400] })).toBe("https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;600&display=swap");
    expect(googleFontsHref({ family: "Fraunces", weights: [400], italic: true })).toContain("ital,wght@0,400;1,400");
  });
});

describe("AI design: generation flow", () => {
  let orgId: string;
  let leadId: string;
  beforeAll(async () => {
    await resetDb();
    process.env.OPENROUTER_API_KEY = "or-test";
    process.env.LLM_PROVIDER = "";
    resetEnvCache();
    const [o] = await db.insert(organizations).values({ name: "IA", slug: "ia-design", settings: defaultOrgSettings() }).returning();
    orgId = o!.id;
    const [b] = await db.insert(businesses).values({ orgId, ...facts, normalizedName: "mariazinha", lat: -8.03, lng: -34.9 }).returning();
    const [l] = await db.insert(leads).values({ orgId, businessId: b!.id }).returning();
    leadId = l!.id;
  });
  afterAll(() => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.LLM_PROVIDER = "none";
    resetEnvCache();
  });

  it("uses the site model, retries once on a bad answer and stores the design", async () => {
    const { f, calls } = modelStub(["sem formato", sample]);
    await generateSiteForLead(orgId, leadId, { fetchImpl: f });
    const designCalls = calls.filter((c) => c.body.model === "anthropic/claude-opus-5.5");
    expect(designCalls).toHaveLength(2);
    expect(designCalls[0]!.body.stream).toBe(true);
    expect(designCalls[1]!.body.messages[1].content).toMatch(/não seguiu o formato/);
    const [w] = await db.select().from(websites).where(eq(websites.leadId, leadId));
    expect(w!.content.ai?.businessType).toMatch(/Boteco/);
    expect(w!.content.ai?.costMicros).toBe(400_000);
    expect(w!.content.ai?.html).not.toMatch(/<script/);
    expect((await getSiteGen(leadId))?.status).toBe("done");
    const usage = await db.select().from(usageRecords).where(eq(usageRecords.kind, "site_design"));
    expect(usage).toHaveLength(2);
  });

  it("falls back to the template when the AI keeps failing", async () => {
    const { f } = modelStub(["nada", "nada"]);
    await generateSiteForLead(orgId, leadId, { fetchImpl: f });
    const [w] = await db.select().from(websites).where(eq(websites.leadId, leadId));
    expect(w!.content.ai).toBeUndefined();
    expect(w!.content.pendingReview[0]).toMatch(/recusado na conferência.*modelo pronto/);
  });

  it("sends the current design and the operator's request when adjusting", async () => {
    const first = modelStub([sample]);
    await generateSiteForLead(orgId, leadId, { fetchImpl: first.f });
    const adj = modelStub([sample]);
    await generateSiteForLead(orgId, leadId, { fetchImpl: adj.f, instructions: "deixe mais escuro" });
    const msg = adj.calls.find((c) => c.body.model === "anthropic/claude-opus-5.5")!.body.messages[1].content as string;
    expect(msg).toContain("deixe mais escuro");
    expect(msg).toContain("<site_atual>");
  });
});
