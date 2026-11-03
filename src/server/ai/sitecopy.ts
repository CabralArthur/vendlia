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

type Copy0 = { noun: string; sub: (p: string) => string; about: (n: string, p: string) => string; cta: string; desc?: Record<string, string> };
const em = (p: string) => (p ? ` em ${p}` : "");
/** Plain, specific copy per segment. Never claims anything we don't know (years, quality, awards). */
const RULE_COPY: Record<string, Copy0> = {
  barbearia: {
    noun: "Barbearia", cta: "Marcar horário",
    sub: (p) => `Corte, barba e acabamento${em(p)}. Escolha o dia e marque pelo WhatsApp.`,
    about: (n, p) => `${n} é uma barbearia${em(p)}. Mande uma mensagem pelo WhatsApp, escolha o serviço e o horário que fica melhor para você.`,
    desc: { "Corte de cabelo": "Corte na máquina, na tesoura ou dos dois jeitos.", Barba: "Barba feita e alinhada.", "Corte + barba": "Os dois no mesmo horário." },
  },
  salao: {
    noun: "Salão de beleza", cta: "Agendar horário",
    sub: (p) => `Cabelo e beleza${em(p)}. Agende seu horário pelo WhatsApp.`,
    about: (n, p) => `${n} é um salão de beleza${em(p)}. Tire suas dúvidas e agende pelo WhatsApp.`,
  },
  estetica: {
    noun: "Estética", cta: "Agendar avaliação",
    sub: (p) => `Tratamentos de estética${em(p)}. Tire suas dúvidas e agende pelo WhatsApp.`,
    about: (n, p) => `${n}: estética${em(p)}. Converse com a gente pelo WhatsApp para entender cada tratamento e marcar sua avaliação.`,
  },
  clinica: {
    noun: "Clínica", cta: "Agendar consulta",
    sub: (p) => `Atendimento${em(p)}. Agende sua consulta pelo WhatsApp.`,
    about: (n, p) => `${n}${em(p)}. Fale com a gente pelo WhatsApp para saber horários e agendar.`,
  },
  restaurante: {
    noun: "Restaurante", cta: "Fazer pedido",
    sub: (p) => `Restaurante${em(p)}. Veja o cardápio e faça seu pedido pelo WhatsApp.`,
    about: (n, p) => `${n} fica${em(p)}. Venha comer com a gente ou mande seu pedido pelo WhatsApp.`,
    desc: { Almoço: "Pratos para o almoço do dia a dia.", Delivery: "Peça pelo WhatsApp e receba onde estiver." },
  },
  cafeteria: {
    noun: "Cafeteria", cta: "Fazer pedido",
    sub: (p) => `Café e lanches${em(p)}. Peça pelo WhatsApp.`,
    about: (n, p) => `${n}${em(p)}. Passe para um café ou mande seu pedido pelo WhatsApp.`,
  },
  oficina: {
    noun: "Oficina mecânica", cta: "Pedir orçamento",
    sub: (p) => `Manutenção e reparo do seu carro${em(p)}. Peça seu orçamento pelo WhatsApp.`,
    about: (n, p) => `${n} é uma oficina mecânica${em(p)}. Mande o modelo do carro e o que está acontecendo pelo WhatsApp para receber um orçamento.`,
  },
  petshop: {
    noun: "Pet shop", cta: "Agendar",
    sub: (p) => `Cuidado para o seu pet${em(p)}. Agende pelo WhatsApp.`,
    about: (n, p) => `${n}${em(p)}. Fale com a gente pelo WhatsApp para agendar e tirar dúvidas.`,
  },
  servicos: {
    noun: "Serviços", cta: "Pedir orçamento",
    sub: (p) => `Atendimento${em(p)}. Conte o que você precisa e receba um orçamento pelo WhatsApp.`,
    about: (n, p) => `${n}${em(p)}. Mande uma mensagem pelo WhatsApp explicando o que você precisa.`,
  },
};

/** Deterministic content built ONLY from verified facts. Unverified items are listed in pendingReview. */
export function buildRuleContent(b: BusinessFacts): SiteContent {
  const seg = segmentById(b.segment);
  const place = [b.neighborhood, b.city].filter(Boolean).join(", ");
  const rc = RULE_COPY[seg.id] ?? RULE_COPY.servicos!;
  const where = b.neighborhood ?? b.city ?? "";
  const heroTitle = where ? `${rc.noun} em ${where}` : rc.noun;
  const heroSubtitle = rc.sub(place);
  const ctaLabel = rc.cta;
  const pendingReview: string[] = [];

  let services = b.services.map((s) => ({ name: s, description: "" }));
  if (services.length === 0) {
    services = seg.defaultServices.map((s) => ({ name: s, description: rc.desc?.[s] ?? "" }));
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

  const about = b.description ?? rc.about(b.name, place);

  return {
    businessName: b.name,
    tagline: rc.noun,
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
        "- Escreva como o dono do negócio falaria com um vizinho: simples, concreto, sem frase de efeito. Nada que soe como texto de IA ou de agência.",
        "- Proibido: 'excelência', 'qualidade', 'experiência única', 'descubra', 'mais que um', 'do seu jeito', 'sem complicação', 'bateu a fome', 'no capricho', 'transforme', 'eleve', perguntas retóricas, exclamações, emojis, trios de adjetivos.",
        "- tagline: só a categoria, 1 a 3 palavras (ex.: 'Restaurante', 'Barbearia'). heroTitle: até 7 palavras, vira o título da seção Sobre, sem repetir o nome do negócio. heroSubtitle: 1 frase dizendo o que é, onde fica e como pedir. about: 2 frases no máximo.",
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
