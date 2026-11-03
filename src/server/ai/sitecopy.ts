import { z } from "zod";
import type { SiteContent } from "../db/schema";
import { segmentById } from "../discovery/segments";
import { formatBrPhone, isBrMobile } from "@/lib/phone";
import { llmJson } from "./llm";

export type BusinessFacts = {
  name: string;
  segment: string;
  category?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  instagram?: string | null;
  openingHours?: string | null;
  description?: string | null;
  services: string[];
  lat?: number | null;
  lng?: number | null;
};

const HERO: Record<string, (b: BusinessFacts, place: string) => [string, string, string]> = {
  barber: (b, p) => [`Seu estilo começa na ${b.name}`, `Agende seu horário${p ? ` em ${p}` : ""} direto pelo WhatsApp, sem complicação.`, "Agendar pelo WhatsApp"],
  aesthetics: (b, p) => [`Cuidado e bem-estar na ${b.name}`, `Conheça nossos serviços${p ? ` em ${p}` : ""} e agende sua avaliação pelo WhatsApp.`, "Agendar avaliação"],
  food: (b, p) => [`${b.name}`, `Sabor${p ? ` em ${p}` : ""} para o seu dia. Fale com a gente e faça seu pedido.`, "Fazer pedido"],
  auto: (b, p) => [`${b.name}: seu carro em boas mãos`, `Peça seu orçamento${p ? ` em ${p}` : ""} pelo WhatsApp e agende o atendimento.`, "Pedir orçamento"],
  services: (b, p) => [`${b.name}`, `Atendimento${p ? ` em ${p}` : ""} com agilidade. Fale com a gente pelo WhatsApp.`, "Falar no WhatsApp"],
};

/** Deterministic content built ONLY from verified facts. Unverified items are listed in pendingReview. */
export function buildRuleContent(b: BusinessFacts): SiteContent {
  const seg = segmentById(b.segment);
  const place = [b.neighborhood, b.city].filter(Boolean).join(", ");
  const [heroTitle, heroSubtitle, ctaLabel] = (HERO[seg.template] ?? HERO.services!)(b, place);
  const pendingReview: string[] = [];

  let services = b.services.map((s) => ({ name: s, description: "" }));
  if (services.length === 0) {
    services = seg.defaultServices.map((s) => ({ name: s, description: "" }));
    pendingReview.push(`Serviços sugeridos para ${seg.label.toLowerCase()} — confirmar com o cliente`);
  }

  const whatsapp = b.phoneE164 && isBrMobile(b.phoneE164) ? b.phoneE164 : undefined;
  const highlights: SiteContent["highlights"] = [];
  if (whatsapp) highlights.push({ title: "Atendimento pelo WhatsApp", description: "Tire dúvidas e agende com um toque." });
  if (place) highlights.push({ title: "Fácil de encontrar", description: `Estamos em ${place}.` });
  if (b.openingHours) highlights.push({ title: "Horário de funcionamento", description: b.openingHours });
  if (b.instagram) highlights.push({ title: "Acompanhe no Instagram", description: `@${b.instagram}` });

  const faq: SiteContent["faq"] = [];
  if (b.address) faq.push({ question: "Onde fica?", answer: [b.address, place].filter(Boolean).join(" — ") });
  if (b.openingHours) faq.push({ question: "Qual o horário de atendimento?", answer: b.openingHours });
  if (whatsapp) faq.push({ question: "Como entro em contato?", answer: `Pelo WhatsApp ${formatBrPhone(whatsapp)}.` });

  if (!b.openingHours) pendingReview.push("Horário de funcionamento");
  if (!b.address) pendingReview.push("Endereço");
  if (!b.description) pendingReview.push("Texto de apresentação — confirmar com o cliente");

  const about =
    b.description ??
    `A ${b.name} atende${place ? ` em ${place}` : ""} na área de ${(b.category ?? seg.label).toLowerCase()}. Entre em contato para saber mais sobre os serviços.`;

  return {
    businessName: b.name,
    tagline: seg.label,
    heroTitle,
    heroSubtitle,
    about,
    services,
    highlights,
    faq,
    ctaLabel,
    contact: {
      whatsapp,
      phone: b.phoneE164 ?? undefined,
      email: b.email ?? undefined,
      address: b.address ?? undefined,
      city: b.city ?? undefined,
      state: b.state ?? undefined,
      instagram: b.instagram ?? undefined,
      openingHours: b.openingHours ?? undefined,
      lat: b.lat ?? undefined,
      lng: b.lng ?? undefined,
    },
    seo: {
      title: `${b.name}${b.city ? ` | ${seg.label} em ${b.city}` : ""}`,
      description: `${b.name}: ${seg.label.toLowerCase()}${place ? ` em ${place}` : ""}. Fale pelo WhatsApp.`.slice(0, 160),
    },
    pendingReview,
    generatedBy: "rules",
  };
}

const copySchema = z.object({
  tagline: z.string().min(2).max(60),
  heroTitle: z.string().min(3).max(90),
  heroSubtitle: z.string().min(10).max(200),
  ctaLabel: z.string().min(3).max(32),
  about: z.string().min(30).max(700),
  servicesTitle: z.string().min(3).max(60),
  servicesIntro: z.string().min(10).max(200),
  services: z.array(z.object({ name: z.string().min(2).max(60), description: z.string().max(160) })).max(8),
  highlightsTitle: z.string().min(3).max(60),
  highlights: z.array(z.object({ title: z.string().min(3).max(50), description: z.string().min(5).max(140) })).min(2).max(4),
  ctaTitle: z.string().min(3).max(80),
  ctaText: z.string().min(5).max(180),
  seoDescription: z.string().min(30).max(160),
});
type Copy = z.infer<typeof copySchema>;

const BANNED = /(anos de (experi|mercado|tradi)|desde (19|20)\d\d|melhor (da|de|do)|n[ºo°]\s*1\b|l[ií]der|premiad|certificad|garanti|avalia[çc]|estrelas|depoiment|clientes satisfeitos|milhares de|centenas de|r\$|\d+\s*%|promo[cç]|desconto|gr[aá]tis)/i;

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

/** Rejects copy that makes claims not grounded in the provided facts (awards, years, ratings, prices, numbers). */
export function copyIsGrounded(copy: object, facts: BusinessFacts) {
  const all = strings(copy).join(" ");
  if (BANNED.test(all)) return false;
  const factText = JSON.stringify(facts);
  const numbers = all.match(/\d{2,}/g) ?? [];
  return numbers.every((n) => factText.includes(n));
}

const VOICE: Record<string, string> = {
  barber: "Barbearia: tom confiante, masculino sem clichês, direto e com atitude. Fale de estilo, acabamento e cuidado.",
  aesthetics: "Estética/clínica: tom acolhedor, elegante e calmo. Fale de cuidado, bem-estar e autoestima, sem promessas de resultado.",
  food: "Restaurante/café: tom caloroso e apetitoso, com vontade de comer. Fale de sabor, preparo e do jeito de pedir.",
  auto: "Oficina/serviço automotivo: tom objetivo, confiável e técnico na medida. Fale de diagnóstico, transparência e agilidade para pedir orçamento.",
  services: "Prestador de serviços: tom profissional, claro e próximo. Fale de praticidade e de como é fácil pedir um orçamento.",
};

export async function generateSiteContent(orgId: string, b: BusinessFacts, fetchImpl?: typeof fetch): Promise<SiteContent> {
  const base = buildRuleContent(b);
  const seg = segmentById(b.segment);
  const serviceNames = base.services.map((x) => x.name).slice(0, 8);
  const llm = await llmJson(
    orgId,
    "site_copy",
    {
      system: [
        "Você é redator sênior de landing pages para pequenos negócios brasileiros. Escreva em português do Brasil, com frases curtas, específicas e que dão vontade de chamar no WhatsApp.",
        VOICE[seg.template] ?? VOICE.services,
        "Regras inegociáveis:",
        "- Use SOMENTE os fatos fornecidos. Não invente tempo de mercado, prêmios, certificações, avaliações, depoimentos, números, preços, promoções, descontos, garantias, horários, equipe, marcas ou serviços.",
        "- Em services, devolva exatamente os serviços da lista, na mesma ordem, cada um com uma descrição curta do que é o serviço (genérica, sem preço nem duração).",
        "- Destaques falam de como é ser atendido (ex.: agendar pelo WhatsApp, localização), nunca de conquistas.",
        "- Nada de clichês como 'excelência', 'qualidade incomparável', 'o melhor da região'. Nada de emojis.",
        'Responda SOMENTE com JSON válido: {"tagline","heroTitle","heroSubtitle","ctaLabel","about","servicesTitle","servicesIntro","services":[{"name","description"}],"highlightsTitle","highlights":[{"title","description"}],"ctaTitle","ctaText","seoDescription"}',
      ].join("\n"),
      user: `<fatos>\n${JSON.stringify({ nome: b.name, segmento: seg.label, categoria: b.category, bairro: b.neighborhood, cidade: b.city, uf: b.state, endereco: b.address, horario: b.openingHours, instagram: b.instagram, descricao: b.description, servicos: serviceNames, whatsapp: b.phoneE164 ? "sim" : "não" })}\n</fatos>`,
      schema: copySchema,
      maxTokens: 1400,
    },
    fetchImpl,
  );
  if (!llm || !copyIsGrounded(llm.data, b)) return base;
  const c: Copy = llm.data;
  // Keep the service list authoritative: only names we gave, in our order.
  const byName = new Map(c.services.map((x) => [x.name.trim().toLowerCase(), x.description.trim()]));
  const services = base.services.map((x) => ({ name: x.name, description: byName.get(x.name.toLowerCase()) ?? x.description }));
  return {
    ...base,
    tagline: c.tagline,
    heroTitle: c.heroTitle,
    heroSubtitle: c.heroSubtitle,
    ctaLabel: c.ctaLabel,
    about: c.about,
    services,
    highlights: c.highlights,
    sections: { servicesTitle: c.servicesTitle, servicesIntro: c.servicesIntro, highlightsTitle: c.highlightsTitle, ctaTitle: c.ctaTitle, ctaText: c.ctaText },
    seo: { ...base.seo, description: c.seoDescription },
    pendingReview: [...base.pendingReview, "Textos escritos pela IA: revise com o cliente"],
    generatedBy: "llm",
  };
}
