import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, organizations, businesses, leads, websites, usageRecords } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { resetEnvCache } from "@/server/env";
import sharp from "sharp";
import { checkDesign, fillPlaceholders, parseDesign, sanitizeDesign, visibleText } from "@/server/ai/sitedesign";
import { fontHrefs } from "@/sites/font-pairings";
import { sanitizeLogo, generateLogos } from "@/server/ai/logo";
import { suggestSearches, getSuggestions } from "@/server/ai/prospect";
import { siteAssets } from "@/server/db";
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

let png: string;
function modelStub(texts: string[], opts: { imagesFail?: boolean } = {}) {
  const calls: { body: any; url: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ body, url });
    if (url.endsWith("/api/v1/images")) {
      if (opts.imagesFail) return new Response('{"error":{"message":"busy"}}', { status: 503 });
      return new Response(JSON.stringify({ data: [{ b64_json: png, media_type: "image/png" }], usage: { cost: 0.039 } }));
    }
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
    expect(meta.pairing).toBe("erode-satoshi");
    expect(meta.fonts.map((f) => f.family)).toEqual(["Erode", "Satoshi"]);
    expect(meta.images.map((i) => i.slot)).toEqual(["hero", "mesa", "ambiente"]);
    const clean = sanitizeDesign(html);
    expect(clean).not.toMatch(/<script|alert\(/);
    expect(clean).toContain('href="{{WA:Quero pedir: Almoço}}"');
    expect(clean).toContain(".vai .facts div+div"); // CSS combinators survive
    expect(clean).toContain('src="{{IMG:hero}}"');
    expect(clean).toContain('data-parallax="0.25"');
    expect(clean).toContain("data-brand");
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
    expect(fontHrefs([{ family: "Erode", source: "fontshare", slug: "erode", weights: [700, 500] }, { family: "Satoshi", source: "fontshare", slug: "satoshi", weights: [400] }])).toEqual(["https://api.fontshare.com/v2/css?f[]=erode@500,700&f[]=satoshi@400&display=swap"]);
    expect(fontHrefs([{ family: "Bodoni Moda", source: "google", weights: [400], italic: true }])[0]).toContain("family=Bodoni+Moda:ital,wght@0,400;1,400");
    const withImg = fillPlaceholders('<img src="{{IMG:hero}}"><img src="{{IMG:nada}}">', { name: "M", images: { hero: "/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e" } });
    expect(withImg).toContain('src="/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e"');
    expect(withImg).toContain("data:image/svg+xml");
  });
});

describe("AI design: generation flow", () => {
  let orgId: string;
  let leadId: string;
  beforeAll(async () => {
    png = (await sharp({ create: { width: 64, height: 40, channels: 3, background: "#b8401c" } }).png().toBuffer()).toString("base64");
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
    expect(w!.content.ai?.pairing).toBe("erode-satoshi");
    expect(Object.keys(w!.content.ai?.images ?? {})).toEqual(expect.arrayContaining(["hero", "mesa", "ambiente"]));
    expect(w!.content.ai?.costMicros).toBe(400_000 + 3 * 39_000);
    const assets = await db.select().from(siteAssets);
    expect(assets).toHaveLength(3);
    expect(assets[0]!.mime).toBe("image/webp");
    expect(calls.filter((c) => c.url.endsWith("/api/v1/images"))[0]!.body.prompt).toMatch(/no text/);
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
    // Same slots → the photos of the previous version are reused (no new image calls).
    expect(adj.calls.filter((c) => c.url.endsWith("/api/v1/images"))).toHaveLength(0);
  });

  it("keeps the design when photos fail (tinted placeholders)", async () => {
    const { f } = modelStub([sample], { imagesFail: true });
    await generateSiteForLead(orgId, leadId, { fetchImpl: f });
    const [w] = await db.select().from(websites).where(eq(websites.leadId, leadId));
    expect(w!.content.ai).toBeDefined();
    expect(w!.content.ai!.images).toEqual({});
  });

  it("generates and sanitizes logo proposals", async () => {
    const svg = (t: string) => `<svg viewBox="0 0 400 100" width="400" onload="x()"><script>x()</script><text x="0" y="70" font-family="Erode" fill="currentColor">${t}</text><image href="https://x/y.png"/></svg>`;
    const text = `<logo label="Tipográfico">${svg("Mariazinha")}</logo><logo label="Selo">${svg("M")}</logo><logo label="Ruim"><div>nada</div></logo>`;
    const f = (async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }], usage: { cost: 0.05 } })}\n\ndata: [DONE]\n\n`)) as unknown as typeof fetch;
    const [w] = await db.select().from(websites).where(eq(websites.leadId, leadId));
    const r = await generateLogos(orgId, w!.content, w!.template, w!.accent, f);
    expect(r.logo?.options).toHaveLength(2);
    expect(r.logo!.options[0]!.svg).not.toMatch(/script|onload|<image|width=/);
    expect(r.logo!.options[0]!.svg).toMatch(/^<svg viewBox/);
    expect(sanitizeLogo("<div>x</div>")).toBeNull();
  });

  it("suggests searches using the org history and keeps only valid segments", async () => {
    const payload = { suggestions: [
      { segment: "barbearia", city: "Recife", state: "pe", neighborhood: "Casa Amarela", reason: "Muitas barbearias de rua no centro do bairro.", pitch: "Agenda pelo WhatsApp" },
      { segment: "foguetes", city: "Recife", state: "PE", reason: "segmento inválido deve sair" },
    ] };
    let sent = "";
    const f = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)).messages[1].content;
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) } }] })}\n\ndata: [DONE]\n\n`);
    }) as unknown as typeof fetch;
    const r = await suggestSearches(orgId, { city: "Recife", state: "PE" }, f);
    expect(r.data?.items).toEqual([expect.objectContaining({ segment: "barbearia", state: "PE", neighborhood: "Casa Amarela" })]);
    expect(sent).toContain("funil_por_segmento");
    expect((await getSuggestions(orgId))?.region).toBe("Recife/PE");
  });
});
