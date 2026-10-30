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
  heroTitle: z.string().min(3).max(80),
  heroSubtitle: z.string().min(10).max(180),
  about: z.string().min(30).max(600),
  tagline: z.string().min(2).max(60),
  seoDescription: z.string().min(30).max(160),
});

const BANNED = /(anos de (experi|mercado|tradi)|desde \d|melhor (da|de|do)|n[ºo°]\s*1|lider|premiad|certificad|garant|avalia|estrelas|depoiment|clientes satisfeitos|r\$|\d+\s*%|promo[cç])/i;

/** Rejects copy that makes claims not grounded in the provided facts. */
export function copyIsGrounded(copy: z.infer<typeof copySchema>, facts: BusinessFacts) {
  const all = Object.values(copy).join(" ");
  if (BANNED.test(all)) return false;
  const factText = JSON.stringify(facts);
  const numbers = all.match(/\d{2,}/g) ?? [];
  return numbers.every((n) => factText.includes(n));
}

export async function generateSiteContent(orgId: string, b: BusinessFacts, fetchImpl?: typeof fetch): Promise<SiteContent> {
  const base = buildRuleContent(b);
  const llm = await llmJson(
    orgId,
    "site_copy",
    {
      system:
        "Você é redator de sites para pequenos negócios brasileiros. Escreva em português do Brasil, tom profissional e acolhedor. " +
        "Use EXCLUSIVAMENTE os fatos fornecidos. É proibido inventar tempo de mercado, prêmios, certificações, avaliações, depoimentos, preços, promoções, garantias, horários ou serviços. " +
        'Responda SOMENTE com JSON: {"heroTitle","heroSubtitle","about","tagline","seoDescription"}.',
      user: `<fatos>\n${JSON.stringify({ ...b, lat: undefined, lng: undefined })}\n</fatos>`,
      schema: copySchema,
      maxTokens: 700,
    },
    fetchImpl,
  );
  if (!llm || !copyIsGrounded(llm.data, b)) return base;
  return {
    ...base,
    heroTitle: llm.data.heroTitle,
    heroSubtitle: llm.data.heroSubtitle,
    about: llm.data.about,
    tagline: llm.data.tagline,
    seo: { ...base.seo, description: llm.data.seoDescription },
    generatedBy: "llm",
  };
}
