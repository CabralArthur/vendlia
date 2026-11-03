/**
 * Curated type pairings for AI-designed sites. The model picks one by id instead of choosing
 * fonts freely (free choice tends to land on the same few "AI default" families).
 * Most come from Fontshare (Indian Type Foundry, ITF Free Font License: free for commercial web use).
 */
export type FontRef = { family: string; source: "fontshare" | "google"; slug?: string; weights: number[]; italic?: boolean };
export type Pairing = { id: string; display: FontRef; body: FontRef; mood: string; bestFor: string; usage: string };

const fs = (family: string, slug: string, weights: number[]): FontRef => ({ family, slug, weights, source: "fontshare" });
const g = (family: string, weights: number[], italic = false): FontRef => ({ family, weights, italic, source: "google" });

export const PAIRINGS: Pairing[] = [
  { id: "zodiak-satoshi", display: fs("Zodiak", "zodiak", [400, 700]), body: fs("Satoshi", "satoshi", [400, 500, 700]), mood: "serifada contemporânea, sofisticada e calorosa", bestFor: "restaurante contemporâneo, café de especialidade, estética premium, arquitetura", usage: "Zodiak 400 em tamanhos grandes com tracking -0.03em; Satoshi para todo o resto." },
  { id: "gambetta-general", display: fs("Gambetta", "gambetta", [400, 600]), body: fs("General Sans", "general-sans", [400, 500, 600]), mood: "editorial, artesanal, acolhedora", bestFor: "padaria, confeitaria, bistrô, empório, floricultura", usage: "Gambetta 400 nos títulos, line-height 1; General Sans 400/500 no texto." },
  { id: "boska-switzer", display: fs("Boska", "boska", [400, 700]), body: fs("Switzer", "switzer", [400, 500, 600]), mood: "alto contraste, moda, luxo", bestFor: "salão de beleza, estética, moda, joalheria, noivas", usage: "Boska 400 muito grande e fino; Switzer 400 com bastante espaço entre linhas." },
  { id: "erode-satoshi", display: fs("Erode", "erode", [500, 700]), body: fs("Satoshi", "satoshi", [400, 500, 700]), mood: "serifada robusta, popular e honesta", bestFor: "comida caseira, boteco, restaurante popular, mercado, açougue", usage: "Erode 700 nos títulos curtos; Satoshi 500 nos botões." },
  { id: "sentient-general", display: fs("Sentient", "sentient", [400, 500]), body: fs("General Sans", "general-sans", [400, 500, 600]), mood: "calma, confiável, clínica sem ser fria", bestFor: "clínica, odontologia, psicologia, fisioterapia, nutrição, pilates", usage: "Sentient 400 nos títulos; General Sans 400 no texto, cores suaves." },
  { id: "bespoke-switzer", display: fs("Bespoke Serif", "bespoke-serif", [400, 600]), body: fs("Switzer", "switzer", [400, 500]), mood: "boutique, delicada, refinada", bestFor: "boutique, ateliê, decoração, papelaria, presentes", usage: "Bespoke Serif 400 com bastante respiro; Switzer 400." },
  { id: "clash-satoshi", display: fs("Clash Display", "clash-display", [500, 600, 700]), body: fs("Satoshi", "satoshi", [400, 500, 700]), mood: "moderna, ousada, com atitude", bestFor: "barbearia moderna, academia, crossfit, estúdio de tatuagem, eventos", usage: "Clash Display 600 enorme, tracking -0.04em; Satoshi no texto." },
  { id: "cabinet-switzer", display: fs("Cabinet Grotesk", "cabinet-grotesk", [700, 800]), body: fs("Switzer", "switzer", [400, 500, 600]), mood: "grotesca expressiva, direta, prática", bestFor: "prestador de serviços, assistência técnica, escola, coworking, lavanderia", usage: "Cabinet Grotesk 800 nos títulos; Switzer 400/500." },
  { id: "tanker-satoshi", display: fs("Tanker", "tanker", [400]), body: fs("Satoshi", "satoshi", [400, 500, 700]), mood: "pôster, impacto, rua", bestFor: "barbearia old school, hamburgueria, pizzaria, streetwear, food truck", usage: "Tanker sempre em caixa alta e grande; Satoshi 500 no texto." },
  { id: "panchang-general", display: fs("Panchang", "panchang", [600, 800]), body: fs("General Sans", "general-sans", [400, 500, 600]), mood: "larga, técnica, industrial", bestFor: "oficina mecânica, auto center, funilaria, logística, construção", usage: "Panchang 800 em caixa alta, tamanhos médios (é larga); General Sans no texto." },
  { id: "chillax-general", display: fs("Chillax", "chillax", [500, 600]), body: fs("General Sans", "general-sans", [400, 500]), mood: "simpática, arredondada, leve", bestFor: "pet shop, veterinária, infantil, sorveteria, açaí, doces", usage: "Chillax 600 nos títulos; General Sans 400; cantos arredondados." },
  { id: "supreme-satoshi", display: fs("Supreme", "supreme", [500, 700]), body: fs("Satoshi", "satoshi", [400, 500]), mood: "limpa, séria, corporativa sem ser chata", bestFor: "contabilidade, advocacia, imobiliária, consultoria, seguros", usage: "Supreme 700 nos títulos; Satoshi 400 no texto; grid rigoroso." },
  { id: "bodoni-hanken", display: g("Bodoni Moda", [400, 600], true), body: g("Hanken Grotesk", [400, 500, 600]), mood: "clássica de revista, luxo tradicional", bestFor: "restaurante sofisticado, vinhos, hotel, joalheria clássica", usage: "Bodoni Moda 400, pode usar itálico em palavras de destaque; Hanken Grotesk no texto." },
  { id: "bigshoulders-hanken", display: g("Big Shoulders Display", [700, 800]), body: g("Hanken Grotesk", [400, 500, 600]), mood: "condensada industrial, placa de rua", bestFor: "cervejaria, oficina, materiais de construção, academia raiz", usage: "Big Shoulders 800 em caixa alta, muito grande; Hanken Grotesk no texto." },
  { id: "general-only", display: fs("General Sans", "general-sans", [500, 600]), body: fs("General Sans", "general-sans", [400, 500]), mood: "neutra e precisa (estilo suíço)", bestFor: "qualquer negócio que pede visual minimalista", usage: "Uma família só: hierarquia por tamanho e peso, tracking -0.03em nos títulos." },
];

export const pairingById = (id: string) => PAIRINGS.find((p) => p.id === id);

/** Stylesheet URLs for a set of fonts (one per Google family, one combined Fontshare URL). */
export function fontHrefs(fonts: { family: string; weights?: number[]; italic?: boolean; source?: string; slug?: string }[]) {
  const seen = new Set<string>();
  const google: string[] = [];
  const share: string[] = [];
  for (const f of fonts) {
    if (seen.has(f.family)) continue;
    seen.add(f.family);
    const w = [...new Set(f.weights?.length ? f.weights : [400, 700])].sort((a, b) => a - b);
    if (f.source === "fontshare" && f.slug && /^[a-z0-9-]+$/.test(f.slug)) share.push(`f[]=${f.slug}@${w.join(",")}`);
    else if (/^[A-Za-z0-9 ]{2,40}$/.test(f.family)) {
      const axes = f.italic ? `ital,wght@${[...w.map((x) => `0,${x}`), ...w.map((x) => `1,${x}`)].join(";")}` : `wght@${w.join(";")}`;
      google.push(`https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, "+")}:${axes}&display=swap`);
    }
  }
  return [...(share.length ? [`https://api.fontshare.com/v2/css?${share.join("&")}&display=swap`] : []), ...google];
}

export function pairingCatalogText() {
  return PAIRINGS.map((p) => `- ${p.id}: "${p.display.family}" (títulos) + "${p.body.family}" (texto). Clima: ${p.mood}. Combina com: ${p.bestFor}. Uso: ${p.usage}`).join("\n");
}
