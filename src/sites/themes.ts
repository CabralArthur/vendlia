import type { TemplateId } from "@/server/db/schema";

export type Theme = {
  label: string;
  bg: string;
  fg: string;
  muted: string;
  surface: string;
  heroBg: string;
  heroFg: string;
  accent: string;
  accentInk: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
  headingTransform?: "uppercase" | "none";
  heroLayout: "split" | "center" | "banner";
};

const serif = `"Playfair Display", "DM Serif Display", Georgia, "Times New Roman", serif`;
const sans = `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
const grotesk = `"Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;

export const THEMES: Record<TemplateId, Theme> = {
  barber: { label: "Barbearia / Salão", bg: "#121212", fg: "#f3eee6", muted: "#b9b1a5", surface: "#1c1b19", heroBg: "#0b0b0b", heroFg: "#f3eee6", accent: "#c9a25e", accentInk: "#121212", headingFont: serif, bodyFont: sans, radius: "4px", heroLayout: "split" },
  aesthetics: { label: "Estética / Clínica", bg: "#fbf7f4", fg: "#3b2d2b", muted: "#7d6a66", surface: "#ffffff", heroBg: "#f4e9e3", heroFg: "#3b2d2b", accent: "#b9776f", accentInk: "#ffffff", headingFont: serif, bodyFont: sans, radius: "22px", heroLayout: "center" },
  food: { label: "Restaurante / Café", bg: "#fff8ee", fg: "#2b1c12", muted: "#7a6150", surface: "#ffffff", heroBg: "#2b1c12", heroFg: "#fff8ee", accent: "#e2572c", accentInk: "#ffffff", headingFont: grotesk, bodyFont: sans, radius: "14px", headingTransform: "none", heroLayout: "banner" },
  auto: { label: "Oficina", bg: "#f5f6f8", fg: "#0f172a", muted: "#5b6577", surface: "#ffffff", heroBg: "#0f172a", heroFg: "#f8fafc", accent: "#f59e0b", accentInk: "#0f172a", headingFont: grotesk, bodyFont: sans, radius: "6px", headingTransform: "uppercase", heroLayout: "split" },
  services: { label: "Serviços", bg: "#ffffff", fg: "#0f1b2d", muted: "#5a6676", surface: "#f4f7fb", heroBg: "#eef4ff", heroFg: "#0f1b2d", accent: "#2563eb", accentInk: "#ffffff", headingFont: sans, bodyFont: sans, radius: "12px", heroLayout: "center" },
};
