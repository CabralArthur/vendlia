import type { TemplateId } from "@/server/db/schema";

export type Theme = {
  label: string;
  display: string;
  body: string;
  /** Page colors. */
  bg: string;
  fg: string;
  muted: string;
  surface: string;
  line: string;
  /** Hero colors (can differ from the page, e.g. a dark hero on a light page). */
  heroBg: string;
  heroFg: string;
  accent: string;
  radius: string;
  layout: "split" | "center";
  displayWeight: number;
  uppercaseHeadings: boolean;
  /** Verb used on each service row ("Pedir", "Agendar"…), opens WhatsApp with the item. */
  itemCta: string;
  defaults: { servicesTitle: string; servicesIntro: string; highlightsTitle: string; ctaTitle: string; ctaText: string; aboutTitle: string };
};

export const THEMES: Record<TemplateId, Theme> = {
  barber: {
    label: "Barbearia / Salão",
    display: `"Anton", "Impact", "Arial Narrow", sans-serif`,
    body: `"Barlow", system-ui, sans-serif`,
    bg: "#111110",
    fg: "#eee8dd",
    muted: "#a39d93",
    surface: "#191917",
    line: "rgba(238,232,221,.13)",
    heroBg: "#111110",
    heroFg: "#eee8dd",
    accent: "#c9a25e",
    radius: "2px",
    layout: "split",
    displayWeight: 400,
    uppercaseHeadings: true,
    itemCta: "Agendar",
    defaults: {
      servicesTitle: "Serviços",
      servicesIntro: "Escolha o serviço e marque seu horário pelo WhatsApp.",
      highlightsTitle: "A casa",
      ctaTitle: "Marque seu horário",
      ctaText: "Mande uma mensagem e escolha o melhor dia.",
      aboutTitle: "A casa",
    },
  },
  aesthetics: {
    label: "Estética / Clínica",
    display: `"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif`,
    body: `"Jost Variable", "Jost", system-ui, sans-serif`,
    bg: "#f7f2ec",
    fg: "#33272a",
    muted: "#7f6f6a",
    surface: "#efe6dd",
    line: "rgba(51,39,42,.13)",
    heroBg: "#f7f2ec",
    heroFg: "#33272a",
    accent: "#a8665d",
    radius: "999px",
    layout: "center",
    displayWeight: 500,
    uppercaseHeadings: false,
    itemCta: "Agendar",
    defaults: {
      servicesTitle: "Tratamentos",
      servicesIntro: "Tire suas dúvidas e agende pelo WhatsApp.",
      highlightsTitle: "Como atendemos",
      ctaTitle: "Agende sua avaliação",
      ctaText: "Converse com a gente pelo WhatsApp e escolha seu horário.",
      aboutTitle: "Sobre",
    },
  },
  food: {
    label: "Restaurante / Café",
    display: `"Fraunces Variable", "Fraunces", Georgia, serif`,
    body: `"Work Sans Variable", "Work Sans", system-ui, sans-serif`,
    bg: "#f5eee2",
    fg: "#1f1a15",
    muted: "#6f6255",
    surface: "#ece2d1",
    line: "rgba(31,26,21,.14)",
    heroBg: "#f5eee2",
    heroFg: "#1f1a15",
    accent: "#b8401c",
    radius: "6px",
    layout: "split",
    displayWeight: 600,
    uppercaseHeadings: false,
    itemCta: "Pedir",
    defaults: {
      servicesTitle: "Cardápio",
      servicesIntro: "Peça pelo WhatsApp.",
      highlightsTitle: "Da casa",
      ctaTitle: "Faça seu pedido",
      ctaText: "Mande uma mensagem pelo WhatsApp.",
      aboutTitle: "A casa",
    },
  },
  auto: {
    label: "Oficina",
    display: `"Archivo Variable", "Archivo", "Arial Black", sans-serif`,
    body: `"Archivo Variable", "Archivo", system-ui, sans-serif`,
    bg: "#f2f3f5",
    fg: "#0d1421",
    muted: "#596273",
    surface: "#ffffff",
    line: "rgba(13,20,33,.12)",
    heroBg: "#0d1421",
    heroFg: "#f2f4f8",
    accent: "#f2c230",
    radius: "4px",
    layout: "split",
    displayWeight: 800,
    uppercaseHeadings: true,
    itemCta: "Orçar",
    defaults: {
      servicesTitle: "Serviços",
      servicesIntro: "Conte o que está acontecendo com o carro e peça seu orçamento pelo WhatsApp.",
      highlightsTitle: "Como trabalhamos",
      ctaTitle: "Peça seu orçamento",
      ctaText: "Mande o modelo do carro e o que está acontecendo.",
      aboutTitle: "A oficina",
    },
  },
  services: {
    label: "Serviços",
    display: `"Manrope Variable", "Manrope", system-ui, sans-serif`,
    body: `"Manrope Variable", "Manrope", system-ui, sans-serif`,
    bg: "#fbfbfa",
    fg: "#121417",
    muted: "#5d636d",
    surface: "#f0f1ee",
    line: "rgba(18,20,23,.11)",
    heroBg: "#fbfbfa",
    heroFg: "#121417",
    accent: "#3b4fd8",
    radius: "14px",
    layout: "split",
    displayWeight: 700,
    uppercaseHeadings: false,
    itemCta: "Pedir orçamento",
    defaults: {
      servicesTitle: "Serviços",
      servicesIntro: "Diga o que você precisa e receba um orçamento pelo WhatsApp.",
      highlightsTitle: "Como atendemos",
      ctaTitle: "Fale com a gente",
      ctaText: "Mande uma mensagem contando o que você precisa.",
      aboutTitle: "Sobre",
    },
  },
};
