import { describe, expect, it } from "vitest";
import { normalizeBrPhone, isBrMobile, formatBrPhone } from "@/lib/phone";
import { normalizeName, slugify } from "@/lib/text";
import { scoreLead, outreachEligibility } from "@/server/scoring";
import { classifyByRules } from "@/server/ai/classify";
import { buildOverpassQuery, cityRegex, mapOsmElements, mapGooglePlaces, parseCsv, mapCsvRows, classifyWebsite } from "@/server/discovery/connectors";
import { buildRuleContent, copyIsGrounded } from "@/server/ai/sitecopy";
import { brPhoneVariants, effectiveDailyLimit, inBusinessHours, nextBusinessOpening, renderTemplate } from "@/server/whatsapp/limits";
import { extractText, resolveJid } from "@/server/whatsapp/evolution";
import { canTransition } from "@/server/handoff";

describe("phone", () => {
  it("normalizes BR formats", () => {
    expect(normalizeBrPhone("(81) 99999-8888")).toBe("5581999998888");
    expect(normalizeBrPhone("+55 81 3333-4444")).toBe("558133334444");
    expect(normalizeBrPhone("081 99999 8888")).toBe("5581999998888");
    expect(normalizeBrPhone("99999-8888", "81")).toBe("5581999998888");
    expect(normalizeBrPhone("0 21 81 99999-8888")).toBe("5581999998888");
    expect(normalizeBrPhone("123")).toBeNull();
    expect(normalizeBrPhone("81 89999-8888")).toBeNull();
  });
  it("detects mobiles", () => {
    expect(isBrMobile("5581999998888")).toBe(true);
    expect(isBrMobile("558133334444")).toBe(false);
    expect(formatBrPhone("5581999998888")).toBe("(81) 99999-8888");
  });
  it("handles 9th digit variants", () => {
    expect(brPhoneVariants("5581999998888")).toEqual(["5581999998888", "558199998888"]);
    expect(brPhoneVariants("558199998888")).toContain("5581999998888");
  });
});

describe("text", () => {
  it("normalizes names for dedup", () => {
    expect(normalizeName("Barbearia do Zé LTDA")).toBe("barbearia ze");
    expect(normalizeName("BARBEARIA  DO ZÉ")).toBe("barbearia ze");
    expect(slugify("Barbearia do Zé — Recife")).toBe("barbearia-do-ze-recife");
  });
});

describe("scoring", () => {
  const base = { websiteStatus: "none_in_source" as const, segment: "barbearia", active: true, phoneE164: "5581999998888", address: "Rua A, 1", city: "Recife", openingHours: "Mo-Sa 09:00-19:00", services: [] };
  it("is explainable and bounded", () => {
    const s = scoreLead(base);
    expect(s.score).toBeGreaterThan(50);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.factors.some((f) => f.kind === "missing" && f.label.includes("Serviços"))).toBe(true);
  });
  it("penalizes existing website and inactive", () => {
    expect(scoreLead({ ...base, websiteStatus: "has_website" }).score).toBeLessThan(30);
    expect(scoreLead({ ...base, active: false }).score).toBeLessThan(20);
  });
  it("separates eligibility from opportunity", () => {
    const e = { phoneE164: "5581999998888", permission: "public_business" as const, suppressed: false, alreadyContacted: false, stage: "preview_ready" as const, allowColdOutreach: true, hasPreview: true };
    expect(outreachEligibility(e).eligible).toBe(true);
    expect(outreachEligibility({ ...e, suppressed: true }).eligible).toBe(false);
    expect(outreachEligibility({ ...e, phoneE164: "558133334444" }).eligible).toBe(false);
    expect(outreachEligibility({ ...e, alreadyContacted: true }).eligible).toBe(false);
    expect(outreachEligibility({ ...e, allowColdOutreach: false }).eligible).toBe(false);
    expect(outreachEligibility({ ...e, allowColdOutreach: false, permission: "opt_in" }).eligible).toBe(true);
    expect(outreachEligibility({ ...e, hasPreview: false }).eligible).toBe(false);
    expect(outreachEligibility({ ...e, waExists: false }).eligible).toBe(false);
  });
});

describe("intent rules (pt-BR)", () => {
  const cases: [string, string][] = [
    ["SAIR", "stop_request"],
    ["por favor não me mande mais mensagem", "stop_request"],
    ["Gostei da demonstração. Quanto fica?", "price_request"],
    ["Não tenho interesse, obrigado", "not_interested"],
    ["já tenho site", "not_interested"],
    ["quero fechar, manda o pix", "purchase_intent"],
    ["faz um desconto?", "negotiation"],
    ["achei caro", "objection"],
    ["ficou top!", "initial_interest"],
    ["posso falar com uma pessoa?", "human_requested"],
    ["dá pra mudar a cor?", "demo_request"],
  ];
  for (const [text, intent] of cases) it(`${text} → ${intent}`, () => expect(classifyByRules(text).intent).toBe(intent));
  it("requires handoff for buying signals", () => {
    expect(classifyByRules("quanto custa?").handoffRequired).toBe(true);
    expect(classifyByRules("SAIR").handoffRequired).toBe(false);
  });
});

describe("connectors", () => {
  const p = { city: "Recife", state: "PE", segment: "barbearia" as const };
  it("builds an Overpass query scoped to the city", () => {
    const q = buildOverpassQuery(p);
    expect(q).toContain('area["ISO3166-2"="BR-PE"]');
    expect(q).toContain('"name"~"^r[eéèê][cç][iíì]f[eéèê]$",i');
    expect(q).toContain('nwr["shop"="hairdresser"]');
  });
  it("matches city names without accents or case", () => {
    const re = new RegExp(cityRegex("sao paulo"), "i");
    expect(re.test("São Paulo")).toBe(true);
    expect(re.test("SÃO PAULO")).toBe(true);
    expect(re.test("São Paulo de Olivença")).toBe(false);
    expect(new RegExp(cityRegex("Jaboatao dos Guararapes"), "i").test("Jaboatão dos Guararapes")).toBe(true);
  });
  it("maps OSM elements", () => {
    const c = mapOsmElements(
      [
        { type: "node", id: 1, lat: -8.05, lon: -34.9, tags: { name: "Barbearia Exemplo", shop: "hairdresser", phone: "+55 81 99999-8888", "addr:street": "Rua da Aurora", "addr:housenumber": "100", "addr:suburb": "Boa Vista", "contact:instagram": "https://instagram.com/barbearia.exemplo" } },
        { type: "way", id: 2, center: { lat: -8, lon: -34 }, tags: { shop: "hairdresser" } },
      ],
      p,
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ externalId: "node/1", name: "Barbearia Exemplo", neighborhood: "Boa Vista", instagram: "barbearia.exemplo", state: "PE" });
  });
  it("maps Google places with 30-day expiry", () => {
    const c = mapGooglePlaces([{ id: "abc", displayName: { text: "Barber X" }, nationalPhoneNumber: "(81) 98888-7777", businessStatus: "CLOSED_PERMANENTLY" }], p);
    expect(c[0]!.active).toBe(false);
    expect(c[0]!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });
  it("parses CSV with ; and quotes", () => {
    const rows = parseCsv('Nome;Telefone;Cidade;UF\n"Oficina ""Boa""";81 98888-1111;Recife;pe\n');
    expect(rows[0]).toEqual({ nome: 'Oficina "Boa"', telefone: "81 98888-1111", cidade: "Recife", uf: "pe" });
    const c = mapCsvRows(rows, { segment: "oficina" });
    expect(c[0]).toMatchObject({ name: 'Oficina "Boa"', state: "PE", segment: "oficina" });
  });
  it("classifies websites", () => {
    expect(classifyWebsite(undefined)).toBe("none_in_source");
    expect(classifyWebsite("https://instagram.com/x")).toBe("social_only");
    expect(classifyWebsite("https://linktr.ee/x")).toBe("social_only");
    expect(classifyWebsite("https://barbeariax.com.br")).toBe("has_website");
  });
});

describe("site content", () => {
  const facts = { name: "Barbearia Exemplo", segment: "barbearia", city: "Recife", neighborhood: "Boa Vista", phoneE164: "5581999998888", services: [] as string[] };
  it("never invents facts and flags pending review", () => {
    const c = buildRuleContent(facts);
    expect(c.pendingReview.join(" ")).toMatch(/Serviços sugeridos/);
    expect(c.pendingReview).toContain("Horário de funcionamento");
    expect(c.faq.find((f) => f.question.includes("horário"))).toBeUndefined();
    expect(JSON.stringify(c)).not.toMatch(/depoimento|estrelas|R\$/i);
    expect(c.contact.whatsapp).toBe("5581999998888");
  });
  it("rejects ungrounded LLM copy", () => {
    const ok = { heroTitle: "Seu corte na Barbearia Exemplo", heroSubtitle: "Atendimento em Boa Vista, Recife.", about: "A Barbearia Exemplo atende em Boa Vista, no Recife, com agendamento pelo WhatsApp.", tagline: "Barbearia", seoDescription: "Barbearia Exemplo em Boa Vista, Recife. Agende pelo WhatsApp." };
    expect(copyIsGrounded(ok, facts)).toBe(true);
    expect(copyIsGrounded({ ...ok, about: ok.about + " Há 15 anos de experiência." }, facts)).toBe(false);
    expect(copyIsGrounded({ ...ok, about: ok.about + " A melhor da cidade, nota 4.9 em avaliações." }, facts)).toBe(false);
    expect(copyIsGrounded({ ...ok, heroSubtitle: "Corte por R$ 30" }, facts)).toBe(false);
  });
});

describe("pacing", () => {
  it("respects business hours in America/Recife", () => {
    expect(inBusinessHours(new Date("2026-11-02T13:00:00Z"), 9, 18)).toBe(true); // Mon 10:00 local
    expect(inBusinessHours(new Date("2026-11-02T22:00:00Z"), 9, 18)).toBe(false); // Mon 19:00 local
    expect(inBusinessHours(new Date("2026-11-01T13:00:00Z"), 9, 18)).toBe(false); // Sunday
    const next = nextBusinessOpening(new Date("2026-10-31T22:30:00Z"), 9, 18); // Sat 19:30 → Mon 09:00
    expect(next.toISOString()).toBe("2026-11-02T12:00:00.000Z");
  });
  it("ramps up new numbers", () => {
    const now = new Date();
    expect(effectiveDailyLimit(40, now, now)).toBe(10);
    expect(effectiveDailyLimit(40, new Date(now.getTime() - 3 * 86400_000), now)).toBe(25);
    expect(effectiveDailyLimit(40, new Date(now.getTime() - 30 * 86400_000), now)).toBe(40);
  });
  it("renders templates", () => {
    expect(renderTemplate("Olá {{empresa}} {{x}}", { empresa: "A" })).toBe("Olá A ");
  });
});

describe("misc", () => {
  it("extracts WhatsApp text and resolves LID jids", () => {
    expect(extractText({ conversation: "oi" })).toBe("oi");
    expect(extractText({ extendedTextMessage: { text: "link" } })).toBe("link");
    expect(extractText({ audioMessage: {} })).toBe("[áudio]");
    expect(resolveJid({ remoteJid: "123@lid", remoteJidAlt: "5581999998888@s.whatsapp.net", fromMe: false, id: "x" })).toBe("5581999998888@s.whatsapp.net");
  });
  it("guards handoff transitions", () => {
    expect(canTransition("AI_ACTIVE", "HUMAN_REQUESTED")).toBe(true);
    expect(canTransition("HUMAN_ACTIVE", "HUMAN_REQUESTED")).toBe(false);
  });
});
