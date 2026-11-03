import sanitizeHtml from "sanitize-html";
import type { SiteContent, SiteLogo } from "../db/schema";
import { llmSiteModel, llmText } from "./llm";
import { SVG_ATTRS, SVG_TAGS } from "./sitedesign";
import { PAIRINGS, pairingById } from "@/sites/font-pairings";
import type { TemplateId } from "../db/schema";

const SYSTEM = `Você é designer de identidade visual sênior (escritório de branding premiado). Crie 3 propostas de logotipo para um pequeno negócio brasileiro, em SVG vetorial puro.

Propostas (diferentes entre si):
1. Logotipo tipográfico refinado (wordmark): o nome com ajuste fino de espaçamento, peso e algum detalhe próprio (ligadura, corte, sublinhado, ponto de cor).
2. Símbolo + nome em lockup horizontal: um símbolo simples e memorável (monograma, forma geométrica ligada ao negócio) à esquerda do nome.
3. Selo/emblema ou uma proposta mais ousada, ainda legível em tamanho pequeno.

Regras:
- Cada logo em <logo label="nome curto da proposta"> <svg …>…</svg> </logo>. Responda só com os 3 blocos.
- viewBox horizontal (ex.: 0 0 520 120), sem width/height fixos. Legível com 32px de altura.
- Texto com <text> usando SOMENTE estas fontes (nomes exatos): {FONTS}. Pode usar font-weight e letter-spacing.
- Cores: use fill="currentColor" para a cor principal (o site define a cor) e no máximo uma cor de destaque {ACCENT}.
- Sem imagens, sem gradientes, sem filtros, sem sombras, sem scripts, sem estilos externos. Formas simples (path, circle, rect, line).
- Não invente slogans, anos ou "desde". Pode usar só o nome do negócio (ou parte dele) e, se quiser, a categoria em letras pequenas.`;

/** Keeps only drawing elements; drops anything that could run code or load resources. */
export function sanitizeLogo(svg: string) {
  const clean = sanitizeHtml(svg, {
    allowedTags: SVG_TAGS.filter((t) => !/^fe|filter|use|image/i.test(t)),
    allowedAttributes: { "*": [...SVG_ATTRS.filter((a) => !/href|filter/i.test(a)), "class", "style", "font-style"] },
    parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
    nonTextTags: ["script", "style", "foreignObject"],
  })
    .replace(/style="[^"]*url\([^"]*"/gi, "")
    .trim();
  if (!/^<svg[\s>]/.test(clean) || !/viewBox=/.test(clean)) return null;
  if (clean.length > 30_000) return null;
  return clean.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1").replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1");
}

export function logoFontsFor(content: SiteContent, template: TemplateId): SiteLogo["fonts"] {
  if (content.ai?.fonts?.length) return content.ai.fonts;
  // Templates use self-hosted fonts; give the logo a designer pairing that matches the template mood.
  const byTemplate: Record<string, string> = { barber: "clash-satoshi", aesthetics: "boska-switzer", food: "erode-satoshi", auto: "panchang-general", services: "cabinet-switzer" };
  const p = pairingById(byTemplate[template] ?? "") ?? PAIRINGS[0]!;
  return [p.display, p.body];
}

export async function generateLogos(
  orgId: string,
  content: SiteContent,
  template: TemplateId,
  accent: string,
  fetchImpl?: typeof fetch,
): Promise<{ logo?: SiteLogo; error?: string }> {
  const fonts = logoFontsFor(content, template);
  const families = [...new Set(fonts.map((f) => `"${f.family}"`))].join(", ");
  const color = content.ai?.palette?.[2] ?? accent;
  let err = "";
  const r = await llmText(
    orgId,
    "logo",
    {
      system: SYSTEM.replace("{FONTS}", families).replace("{ACCENT}", /^#[0-9a-f]{6}$/i.test(color) ? color : "#c4421a"),
      user: JSON.stringify({ nome: content.businessName, categoria: content.ai?.businessType ?? content.tagline, conceito_do_site: content.ai?.concept ?? null, cidade: content.contact.city ?? null }),
      model: llmSiteModel(),
      maxTokens: 8000,
      timeoutMs: 300_000,
      json: false,
      stream: true,
      onError: (m) => (err = m),
    },
    fetchImpl,
  );
  if (!r) return { error: err || "a IA não respondeu" };
  const options = [...r.text.matchAll(/<logo(?:\s+label="([^"]*)")?\s*>([\s\S]*?)<\/logo>/gi)]
    .map((m) => ({ label: (m[1] ?? "Proposta").slice(0, 60), svg: sanitizeLogo(m[2]!.trim()) }))
    .filter((o): o is { label: string; svg: string } => !!o.svg)
    .slice(0, 3);
  if (!options.length) return { error: "a IA não devolveu logos válidos" };
  return { logo: { options, selected: null, use: false, fonts, model: r.model, costMicros: r.costMicros } };
}
