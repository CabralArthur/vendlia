import type { TemplateId } from "@/server/db/schema";

export type Theme = {
  label: string;
  display: string;
  body: string;
  bg: string;
  fg: string;
  muted: string;
  surface: string;
  line: string;
  heroBg: string;
  heroFg: string;
  accent: string;
  radius: string;
  /** Layout choices that make each niche look different, not just recolored. */
  hero: "split" | "center" | "poster" | "blueprint" | "mesh";
  servicesStyle: "menu" | "cards" | "bento" | "numbered";
  marquee: boolean;
  steps: boolean;
  uppercaseHeadings: boolean;
  defaults: { servicesTitle: string; servicesIntro: string; highlightsTitle: string; ctaTitle: string; ctaText: string; aboutTitle: string };
};

export const THEMES: Record<TemplateId, Theme> = {
  barber: {
    label: "Barbearia / Salão",
    display: `"Anton", "Impact", "Arial Narrow", sans-serif`,
    body: `"Barlow", system-ui, sans-serif`,
    bg: "#0e0e0f",
    fg: "#f2ede4",
    muted: "#a59f95",
    surface: "#18181a",
    line: "rgba(242,237,228,.12)",
    heroBg: "#0e0e0f",
    heroFg: "#f2ede4",
    accent: "#c9a25e",
    radius: "2px",
    hero: "split",
    servicesStyle: "menu",
    marquee: true,
    steps: false,
    uppercaseHeadings: true,
    defaults: {
      servicesTitle: "Serviços",
      servicesIntro: "Escolha o serviço e marque seu horário pelo WhatsApp.",
      highlightsTitle: "Por que vir aqui",
      ctaTitle: "Bora marcar seu horário?",
      ctaText: "Chama no WhatsApp e escolhe o melhor dia pra você.",
      aboutTitle: "A casa",
    },
  },
  aesthetics: {
    label: "Estética / Clínica",
    display: `"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif`,
    body: `"Jost Variable", "Jost", system-ui, sans-serif`,
    bg: "#f8f2ec",
    fg: "#3a2b28",
    muted: "#85716b",
    surface: "#fffaf6",
    line: "rgba(58,43,40,.12)",
    heroBg: "#f3e7de",
    heroFg: "#3a2b28",
    accent: "#b9776f",
    radius: "28px",
    hero: "center",
    servicesStyle: "cards",
    marquee: false,
    steps: false,
    uppercaseHeadings: false,
    defaults: {
      servicesTitle: "Tratamentos",
      servicesIntro: "Cuidados pensados para você. Tire suas dúvidas e agende pelo WhatsApp.",
      highlightsTitle: "Como cuidamos de você",
      ctaTitle: "Reserve um momento para você",
      ctaText: "Agende sua avaliação pelo WhatsApp.",
      aboutTitle: "Sobre nós",
    },
  },
  food: {
    label: "Restaurante / Café",
    display: `"Fraunces Variable", "Fraunces", Georgia, serif`,
    body: `"Work Sans Variable", "Work Sans", system-ui, sans-serif`,
    bg: "#fff6e8",
    fg: "#2a1a10",
    muted: "#7b6252",
    surface: "#ffffff",
    line: "rgba(42,26,16,.12)",
    heroBg: "#fff6e8",
    heroFg: "#2a1a10",
    accent: "#e2512b",
    radius: "20px",
    hero: "poster",
    servicesStyle: "menu",
    marquee: true,
    steps: false,
    uppercaseHeadings: false,
    defaults: {
      servicesTitle: "No cardápio",
      servicesIntro: "Faça seu pedido pelo WhatsApp.",
      highlightsTitle: "Do nosso jeito",
      ctaTitle: "Bateu a fome?",
      ctaText: "Chama no WhatsApp e faz seu pedido.",
      aboutTitle: "Nossa história",
    },
  },
  auto: {
    label: "Oficina",
    display: `"Archivo Variable", "Archivo", "Arial Black", sans-serif`,
    body: `"Archivo Variable", "Archivo", system-ui, sans-serif`,
    bg: "#f3f4f6",
    fg: "#0b1220",
    muted: "#5a6475",
    surface: "#ffffff",
    line: "rgba(11,18,32,.12)",
    heroBg: "#0b1220",
    heroFg: "#f4f6fa",
    accent: "#f5c518",
    radius: "4px",
    hero: "blueprint",
    servicesStyle: "numbered",
    marquee: false,
    steps: true,
    uppercaseHeadings: true,
    defaults: {
      servicesTitle: "O que fazemos",
      servicesIntro: "Conte o que está acontecendo com o carro e peça seu orçamento pelo WhatsApp.",
      highlightsTitle: "Como trabalhamos",
      ctaTitle: "Precisa de um orçamento?",
      ctaText: "Mande uma mensagem com o modelo do carro e o que está acontecendo.",
      aboutTitle: "A oficina",
    },
  },
  services: {
    label: "Serviços",
    display: `"Manrope Variable", "Manrope", system-ui, sans-serif`,
    body: `"Manrope Variable", "Manrope", system-ui, sans-serif`,
    bg: "#ffffff",
    fg: "#0f172a",
    muted: "#5b6577",
    surface: "#f5f7fb",
    line: "rgba(15,23,42,.10)",
    heroBg: "#f7f8ff",
    heroFg: "#0f172a",
    accent: "#4f46e5",
    radius: "18px",
    hero: "mesh",
    servicesStyle: "bento",
    marquee: false,
    steps: true,
    uppercaseHeadings: false,
    defaults: {
      servicesTitle: "Serviços",
      servicesIntro: "Diga o que você precisa e receba um orçamento pelo WhatsApp.",
      highlightsTitle: "Por que chamar a gente",
      ctaTitle: "Vamos conversar?",
      ctaText: "Mande uma mensagem contando o que você precisa.",
      aboutTitle: "Quem somos",
    },
  },
};
