import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, organizations, usageRecords } from "@/server/db";
import { defaultOrgSettings } from "@/server/org";
import { resetEnvCache } from "@/server/env";
import { generateSiteContent } from "@/server/ai/sitecopy";
import { llmProvider, llmModel } from "@/server/ai/llm";
import { resetDb } from "./helpers";

const facts = { name: "Barbearia do Zé", segment: "barbearia", city: "Recife", neighborhood: "Boa Vista", phoneE164: "5581999998888", services: ["Corte", "Barba"] };

const good = {
  tagline: "Barbearia em Boa Vista",
  heroTitle: "Corte na régua na Barbearia do Zé",
  heroSubtitle: "Atendimento em Boa Vista, Recife. Marque pelo WhatsApp em poucos segundos.",
  ctaLabel: "Marcar horário",
  about: "A Barbearia do Zé fica em Boa Vista, no Recife, e atende quem quer sair com o visual em dia sem complicação.",
  servicesTitle: "Serviços da casa",
  servicesIntro: "Escolha o serviço e chame no WhatsApp.",
  services: [{ name: "Corte", description: "Corte masculino com acabamento." }, { name: "Barba", description: "Barba feita com toalha quente." }, { name: "Inventado", description: "não deve entrar" }],
  highlightsTitle: "Do seu jeito",
  highlights: [{ title: "Agenda pelo WhatsApp", description: "Marque sem precisar ligar." }, { title: "Em Boa Vista", description: "Fácil de chegar no centro do Recife." }],
  ctaTitle: "Bora marcar?",
  ctaText: "Chama no WhatsApp e escolhe o horário.",
  seoDescription: "Barbearia do Zé em Boa Vista, Recife. Corte e barba com agendamento pelo WhatsApp.",
};

function openRouterStub(payload: unknown) {
  const calls: { url: string; body: any; headers: Headers }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(payload) + "\n```" } }], usage: { prompt_tokens: 900, completion_tokens: 400, cost: 0.0003 } }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

let orgId: string;
beforeAll(async () => {
  await resetDb();
  process.env.OPENROUTER_API_KEY = "or-test";
  process.env.LLM_PROVIDER = "";
  resetEnvCache();
  const [o] = await db.insert(organizations).values({ name: "IA", slug: "ia", settings: defaultOrgSettings() }).returning();
  orgId = o!.id;
});
afterAll(() => {
  delete process.env.OPENROUTER_API_KEY;
  process.env.LLM_PROVIDER = "none";
  resetEnvCache();
});

describe("AI site copy via OpenRouter", () => {
  it("auto-detects OpenRouter from the key", () => {
    expect(llmProvider()).toBe("openrouter");
    expect(llmModel()).toBe("anthropic/claude-haiku-5.5");
  });

  it("fills every section, keeps only real services and records the real cost", async () => {
    const { f, calls } = openRouterStub(good);
    const c = await generateSiteContent(orgId, facts, f);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer or-test");
    expect(calls[0]!.body.model).toBe("anthropic/claude-haiku-5.5");
    expect(c.generatedBy).toBe("llm");
    expect(c.heroTitle).toBe(good.heroTitle);
    expect(c.sections?.servicesTitle).toBe("Serviços da casa");
    expect(c.services.map((s) => s.name)).toEqual(["Corte", "Barba"]);
    expect(c.services[0]!.description).toBe("Corte masculino com acabamento.");
    expect(c.pendingReview.join(" ")).toMatch(/Textos escritos pela IA/);
    const [u] = await db.select().from(usageRecords);
    expect(u!.costMicros).toBe(300);
  });

  it("falls back to safe rule-based copy when the AI invents facts", async () => {
    const { f } = openRouterStub({ ...good, about: good.about + " São 15 anos de experiência." });
    const c = await generateSiteContent(orgId, facts, f);
    expect(c.generatedBy).toBe("rules");
    expect(JSON.stringify(c)).not.toMatch(/15 anos/);
  });
});
