import sanitizeHtml from "sanitize-html";
import type { SiteAi } from "../db/schema";
import { segmentById } from "../discovery/segments";
import { formatBrPhone, isBrMobile } from "@/lib/phone";
import { llmSiteModel, llmText } from "./llm";
import type { BusinessFacts } from "./sitecopy";

/**
 * Whole-site generation: the strongest model art-directs and writes a one-page site for this
 * specific business (type, typography, palette, layout, copy). We then sanitize it (no scripts,
 * no outside links), check it for invented claims, and fall back to the template if anything fails.
 */

const SYSTEM = `Você é diretor de arte e desenvolvedor front-end de um estúdio premiado (nível Awwwards / Dribbble "popular"). Você cria a landing page de UM pequeno negócio brasileiro real, para ser mostrada ao dono como proposta. O dono precisa abrir no celular e pensar: "isso parece caro, parece meu".

COMO PENSAR
1. Descubra o que o negócio é de verdade a partir do nome, categoria, endereço e bairro (ex.: "Mariazinha Bar e Comida Brasileira" = boteco/restaurante de comida brasileira; não force em categorias genéricas). Escreva isso em businessType.
2. Defina uma direção de arte própria para esse negócio e esse lugar: referências visuais, clima, contraste. Fuja do visual de template e do visual "feito por IA" (gradiente roxo, blobs, glassmorphism genérico, ícones de clip-art, emojis, cards todos iguais, tudo centralizado).
3. Tipografia é o centro do design. Escolha 1 ou 2 famílias do Google Fonts que combinem com o negócio, com hierarquia forte (display grande e expressivo + texto muito legível). Use nomes exatos do Google Fonts. Exemplos de boas escolhas (não se limite a elas): Fraunces, Instrument Serif, DM Serif Display, Playfair Display, Cormorant Garamond, Libre Caslon Text, Newsreader, Bricolage Grotesque, Space Grotesk, Syne, Unbounded, Archivo, Anton, Bebas Neue, Big Shoulders Display, Oswald, Familjen Grotesk, Schibsted Grotesk, Inter Tight, Manrope, DM Sans, Work Sans, Figtree, Outfit, Plus Jakarta Sans, Sora, Epilogue, Young Serif, Gloock, Rubik, Barlow, Jost.
4. Paleta com 3 a 5 cores com contraste AA no texto. Use variáveis CSS.

ESTRUTURA (adapte nomes, ordem e forma ao negócio)
- Cabeçalho com o nome do negócio e um botão de WhatsApp.
- Hero memorável com o NOME DO NEGÓCIO bem visível, o que ele é e onde fica, e o botão principal de WhatsApp.
- Seção sobre (curta).
- O que o negócio oferece (use os itens fornecidos; cada item com link de WhatsApp já com o item no texto).
- Galeria somente se houver fotos fornecidas.
- Como chegar / contato: endereço, horário, WhatsApp, Instagram, e o marcador {{MAP}} onde o mapa deve aparecer.
- Chamada final e rodapé.
- No celular, um botão fixo de WhatsApp na parte de baixo da tela.

TEXTO (português do Brasil)
- Escreva como o dono falaria com um vizinho: simples, concreto, específico do negócio e do bairro. Frases curtas.
- PROIBIDO inventar: anos de mercado, fundação, prêmios, avaliações, estrelas, depoimentos, número de clientes, preços, promoções, garantias, nomes de pessoas/equipe, pratos ou serviços que não estejam nos fatos, horários que não estejam nos fatos. Nenhum número que não esteja nos fatos.
- Se os itens oferecidos vierem marcados como sugestão, descreva-os de forma genérica.
- Proibido: "excelência", "qualidade", "experiência única", "descubra", "mais que um", "transforme", "eleve", "bateu a fome", "no capricho", "sem complicação", perguntas retóricas, exclamações, emojis.

REGRAS TÉCNICAS (obrigatórias)
- Responda com exatamente dois blocos, nada antes ou depois:
  <meta>{"businessType":"...","fonts":[{"family":"Nome Exato","weights":[400,600],"italic":false}],"palette":["#hex",...],"concept":"1 frase sobre a direção de arte"}</meta>
  <site> ... </site>
- Dentro de <site>: um único <style> no início e depois o HTML. Todo seletor CSS começa com .vai (o conteúdo é colocado dentro de <div class="vai">). Use font-family com os nomes escolhidos.
- Mobile-first, responsivo de 360px a 1600px, sem rolagem horizontal (overflow-x:clip no .vai). Use clamp() para tamanhos.
- Sem JavaScript, sem <script>, sem atributos on*, sem <iframe>, sem <img> externas (só as URLs de fotos fornecidas), sem @import e sem url() externo. Ilustrações e ornamentos: só CSS ou SVG inline abstrato/tipográfico (padrões, formas, linhas, selos, texturas com gradiente). Nada de desenho de mascote ou objeto em clip-art.
- Animações: sutis e elegantes em CSS (entrada do hero com @keyframes, hovers). Para revelar ao rolar, coloque data-reveal no elemento; o sistema adiciona a classe "in" quando ele aparece e a classe "anim" no .vai. Então estilize: .vai.anim [data-reveal]{opacity:0;transform:...} e .vai.anim [data-reveal].in{opacity:1;transform:none}. Respeite prefers-reduced-motion.
- Links: use SOMENTE estes marcadores, que o sistema troca pelos links reais:
  {{WA}} = WhatsApp com mensagem padrão; {{WA:texto}} = WhatsApp com o texto (ex.: {{WA:Quero pedir: Almoço}});
  {{MAPS}} = abrir no Google Maps; {{INSTAGRAM}} = perfil do Instagram; {{TEL}} = ligar; {{EMAIL}} = e-mail; âncoras #secao.
  Ex.: <a href="{{WA:Quero agendar: Barba}}">. Nunca escreva URLs.
- {{MAP}} sozinho dentro de um elemento com altura definida (o sistema coloca um iframe com width/height 100%).
- {{YEAR}} = ano atual no rodapé.
- Se não houver WhatsApp nos fatos, não use {{WA}}; use {{TEL}} se houver telefone.
- HTML semântico (header, main, section, footer), um único h1 com o nome do negócio, alt nas imagens, contraste acessível.
- Tamanho: até ~900 linhas no total. Capriche no CSS: espaçamento generoso, grid editorial, detalhes de tipografia (letter-spacing, line-height, text-wrap: balance), estados de hover.`;

export type DesignMeta = { businessType: string; fonts: { family: string; weights?: number[]; italic?: boolean }[]; palette?: string[]; concept?: string };

function factsPayload(b: BusinessFacts, extra: { whatsapp?: string; servicesAreSuggestions: boolean; services: string[]; photos: string[] }) {
  const seg = segmentById(b.segment);
  return {
    nome: b.name,
    categoria_da_fonte: b.category ?? null,
    segmento_da_busca: seg.label,
    endereco: b.address ?? null,
    bairro: b.neighborhood ?? null,
    cidade: b.city ?? null,
    uf: b.state ?? null,
    horario: b.openingHours ?? null,
    whatsapp: extra.whatsapp ? formatBrPhone(extra.whatsapp) : null,
    telefone: !extra.whatsapp && b.phoneE164 ? formatBrPhone(b.phoneE164) : null,
    instagram: b.instagram ? `@${b.instagram}` : null,
    email: b.email ?? null,
    descricao: b.description ?? null,
    oferece: extra.services,
    oferece_e_sugestao: extra.servicesAreSuggestions,
    fotos: extra.photos,
    tem_mapa: !!(b.address || (b.lat && b.lng)),
  };
}

const FONT_NAME = /^[A-Za-z0-9 ]{2,40}$/;

export function parseDesign(text: string): { meta: DesignMeta; html: string } {
  const m = text.match(/<meta>([\s\S]*?)<\/meta>/i);
  const s = text.match(/<site>([\s\S]*)<\/site>/i);
  if (!m || !s) throw new Error("Resposta sem os blocos <meta> e <site>");
  const raw = JSON.parse(m[1]!.trim()) as Partial<DesignMeta>;
  const fonts = (raw.fonts ?? [])
    .filter((f) => f && typeof f.family === "string" && FONT_NAME.test(f.family.trim()))
    .slice(0, 3)
    .map((f) => ({
      family: f.family.trim(),
      weights: (Array.isArray(f.weights) ? f.weights : [400, 700]).map(Number).filter((w) => w >= 100 && w <= 900 && w % 100 === 0).slice(0, 6),
      italic: !!f.italic,
    }));
  return {
    meta: { businessType: String(raw.businessType ?? "").slice(0, 80), fonts, palette: (raw.palette ?? []).slice(0, 6).map(String), concept: String(raw.concept ?? "").slice(0, 300) },
    html: s[1]!.trim(),
  };
}

const SVG_TAGS = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "text", "textPath", "tspan", "clipPath", "mask", "pattern", "use", "symbol", "title", "desc", "filter", "feTurbulence", "feColorMatrix", "feGaussianBlur", "feBlend", "feComposite", "feOffset", "feMerge", "feMergeNode", "feDisplacementMap"];
const SVG_ATTRS = ["viewBox", "viewbox", "xmlns", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "patternUnits", "patternTransform", "clip-path", "clipPathUnits", "mask", "preserveAspectRatio", "text-anchor", "dominant-baseline", "font-size", "font-family", "font-weight", "letter-spacing", "textLength", "lengthAdjust", "startOffset", "href", "xlink:href", "filter", "baseFrequency", "numOctaves", "type", "values", "stdDeviation", "in", "in2", "result", "mode", "operator", "seed", "scale", "dx", "dy", "focusable"];

/** Strips anything that could run code or leak visitors elsewhere. Placeholders are kept for later substitution. */
export function sanitizeDesign(html: string) {
  // CSS: drop imports and external url(); keep data: URIs (inline SVG patterns).
  const cleanCss = (css: string) =>
    css
      .replace(/@import[^;]+;?/gi, "")
      .replace(/url\(\s*(?!['"]?\s*(?:data:|#))[^)]*\)/gi, "none")
      .replace(/expression\s*\(|javascript:|behavior\s*:/gi, "");
  const out = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "style", "img", "header", "footer", "main", "section", "nav", "article", "aside", "figure", "figcaption", "picture", "span", "div", "small", "strong", "em", "b", "i", "u", "s", "mark", "time", "address", "button", "details", "summary", "br", "hr",
      ...SVG_TAGS,
    ],
    allowVulnerableTags: true, // <style> is needed; its contents are cleaned below
    allowedAttributes: {
      "*": ["class", "id", "style", "role", "title", "data-*", "aria-*", "lang", "dir", "tabindex", ...SVG_ATTRS],
      a: ["href", "target", "rel", "class", "id", "style", "aria-*", "data-*", "title"],
      img: ["src", "alt", "width", "height", "loading", "decoding", "class", "style", "data-*"],
    },
    allowedSchemes: ["https", "tel", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
    nonTextTags: ["script", "textarea", "option", "noscript", "iframe", "object", "embed"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const okHref = /^(\{\{[A-Z]+(:[^}]*)?\}\}|#[\w-]*)$/.test(href) ? href : "#";
        return { tagName, attribs: { ...attribs, href: okHref } };
      },
      use: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: (attribs.href ?? attribs["xlink:href"] ?? "").startsWith("#") ? (attribs.href ?? attribs["xlink:href"])! : "#" } }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !/^https:\/\//.test(frame.attribs.src ?? ""),
    textFilter: undefined,
  });
  // Clean style elements and inline style attributes.
  return out
    .replace(/<style>([\s\S]*?)<\/style>/gi, (_, css: string) => `<style>${cleanCss(css)}</style>`)
    .replace(/style="([^"]*)"/g, (_, css: string) => `style="${cleanCss(css)}"`);
}

const BANNED = /(anos de (experi|mercado|tradi|hist)|desde (19|20)\d\d|fundad[oa] em|melhor (da|de|do)|n[ºo°]\s*1\b|l[ií]der|premiad|certificad|avalia[çc][ãa]o (dos|de) clientes|estrelas|depoiment|clientes satisfeitos|milhares de|centenas de|r\$|\d+\s*%|promo[cç]|desconto|gr[aá]tis)/i;

/** Visible text only (no CSS / markup), used for grounding checks. */
export function visibleText(html: string) {
  return sanitizeHtml(html.replace(/<style>[\s\S]*?<\/style>/gi, " ").replace(/</g, " <"), { allowedTags: [], allowedAttributes: {} })
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkDesign(html: string, b: BusinessFacts, opts: { whatsapp?: string }) {
  const problems: string[] = [];
  const text = visibleText(html);
  if (html.length < 4000) problems.push("site curto demais");
  if (html.length > 160_000) problems.push("site grande demais");
  if (!/<style>/i.test(html)) problems.push("sem CSS");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!norm(text).includes(norm(b.name).slice(0, 12).trim())) problems.push("o nome do negócio não aparece");
  const banned = text.match(BANNED) ?? (!/24/.test(b.openingHours ?? "") ? text.match(/\b24\s?(h|horas)\b/i) : null);
  if (banned) problems.push(`afirmação não comprovada: "${banned[0]}"`);
  const facts = JSON.stringify(b).replace(/\D+/g, " ");
  const year = String(new Date().getFullYear());
  // Small numbers are section numbers, days and hours ("01", "Seg–Sáb 9h"); anything else must come from the facts.
  const numbers = (text.match(/\d{2,}/g) ?? []).filter((n) => !(n.length <= 2 && Number(n) <= 31) && n !== year && !facts.split(" ").some((f) => f.includes(n)));
  if (numbers.length) problems.push(`números que não estão nos fatos: ${[...new Set(numbers)].slice(0, 5).join(", ")}`);
  if (opts.whatsapp && !/\{\{WA(:[^}]*)?\}\}/.test(html)) problems.push("sem link de WhatsApp");
  return problems;
}

/** Replaces link placeholders with real, safe URLs. Unknown or unavailable placeholders become "#". */
export function fillPlaceholders(html: string, c: { whatsapp?: string; phone?: string; email?: string; instagram?: string; mapsUrl?: string; mapEmbed?: string; name: string }) {
  const wa = (text: string) => (c.whatsapp ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(text)}` : c.phone ? `tel:+${c.phone}` : "#");
  const esc = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return html
    .replace(/\{\{WA:([^}]*)\}\}/g, (_, t: string) => esc(wa(`Olá! Vi o site de vocês. ${t.replace(/&amp;/g, "&").trim()}`)))
    .replace(/\{\{WA\}\}/g, esc(wa("Olá! Vi o site de vocês e gostaria de mais informações.")))
    .replace(/\{\{MAPS\}\}/g, c.mapsUrl ? esc(c.mapsUrl) : "#")
    .replace(/\{\{INSTAGRAM\}\}/g, c.instagram ? `https://instagram.com/${encodeURIComponent(c.instagram)}` : "#")
    .replace(/\{\{TEL\}\}/g, c.phone ? `tel:+${c.phone}` : "#")
    .replace(/\{\{EMAIL\}\}/g, c.email ? `mailto:${esc(c.email)}` : "#")
    .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{MAP\}\}/g, c.mapEmbed ? `<iframe src="${esc(c.mapEmbed)}" title="Mapa: ${esc(c.name)}" loading="lazy" style="border:0;width:100%;height:100%;min-height:300px;display:block"></iframe>` : "")
    .replace(/\{\{[A-Z]+(:[^}]*)?\}\}/g, "#");
}

export function googleFontsHref(f: { family: string; weights?: number[]; italic?: boolean }) {
  const w = [...new Set(f.weights?.length ? f.weights : [400, 700])].sort((a, b) => a - b);
  const fam = f.family.replace(/ /g, "+");
  const axes = f.italic ? `ital,wght@${[...w.map((x) => `0,${x}`), ...w.map((x) => `1,${x}`)].join(";")}` : `wght@${w.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${fam}:${axes}&display=swap`;
}

/**
 * Asks the site model for a complete design. One retry with the validation problems as feedback.
 * Returns { error } when no LLM is configured, the call fails or the result can't be made safe — callers fall back to the template.
 */
export async function designSite(
  orgId: string,
  b: BusinessFacts,
  opts: { services: string[]; servicesAreSuggestions: boolean; photos?: string[]; previous?: SiteAi; instructions?: string; log?: (m: string) => void },
  // returns { ai } on success or { error } with a human-readable reason
  fetchImpl?: typeof fetch,
): Promise<{ ai?: SiteAi; error?: string }> {
  const whatsapp = b.phoneE164 && isBrMobile(b.phoneE164) ? b.phoneE164 : undefined;
  const facts = factsPayload(b, { whatsapp, services: opts.services, servicesAreSuggestions: opts.servicesAreSuggestions, photos: opts.photos ?? [] });
  const model = llmSiteModel();
  let user = `<fatos>\n${JSON.stringify(facts, null, 1)}\n</fatos>`;
  if (opts.previous && opts.instructions) {
    user += `\n\nEste é o site atual. Mantenha o que funciona e aplique SOMENTE este pedido de ajuste do vendedor: "${opts.instructions.slice(0, 1200)}"\n<site_atual>\n${opts.previous.html}\n</site_atual>`;
  } else {
    user += `\n\nCrie o site agora. Pense na direção de arte antes de escrever.`;
  }
  let totalCost = 0;
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let llmError = "";
    const r = await llmText(orgId, "site_design", { system: SYSTEM, user, model, maxTokens: 24_000, timeoutMs: 600_000, json: false, stream: true, onError: (m) => (llmError = m) }, fetchImpl);
    if (!r) return { error: llmError || "a IA não respondeu" };
    totalCost += r.costMicros;
    try {
      const { meta, html } = parseDesign(r.text);
      const clean = sanitizeDesign(html);
      const problems = checkDesign(clean, b, { whatsapp });
      lastProblem = problems.join("; ");
      if (problems.length === 0) {
        return { ai: { html: clean, fonts: meta.fonts, businessType: meta.businessType, concept: meta.concept, palette: meta.palette, model: r.model, costMicros: totalCost, generatedAt: new Date().toISOString(), instructions: opts.instructions } };
      }
      opts.log?.(`Ajustando o site gerado: ${problems.join("; ")}`);
      user += `\n\nSua resposta anterior foi recusada por: ${problems.join("; ")}. Gere o site completo de novo corrigindo isso, no mesmo formato.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastProblem = `resposta fora do formato (${msg})`;
      opts.log?.(`Resposta inválida da IA: ${msg}`);
      user += `\n\nSua resposta anterior não seguiu o formato (${msg}). Responda exatamente com <meta>{...}</meta> e <site>...</site>.`;
    }
  }
  return { error: `o site gerado foi recusado na conferência: ${lastProblem}` };
}
