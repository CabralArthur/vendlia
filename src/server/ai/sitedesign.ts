import sanitizeHtml from "sanitize-html";
import type { SiteAi } from "../db/schema";
import { segmentById } from "../discovery/segments";
import { formatBrPhone, isBrMobile } from "@/lib/phone";
import { llmSiteModel, llmText } from "./llm";
import { PAIRINGS, pairingById, pairingCatalogText } from "@/sites/font-pairings";
import { generateSiteImage, imagesAvailable } from "./images";
import { env } from "../env";
import type { BusinessFacts } from "./sitecopy";

/**
 * Whole-site generation: the strongest model art-directs and writes a one-page site for this
 * specific business (type, typography, palette, layout, copy). We then sanitize it (no scripts,
 * no outside links), check it for invented claims, and fall back to the template if anything fails.
 */

function systemPrompt(maxImages: number) {
  return `Você é diretor de arte sênior e desenvolvedor front-end de um estúdio de design premiado (Awwwards, "Site of the Day"). Você cria a landing page de UM pequeno negócio brasileiro real, como proposta para o dono. Ele vai abrir no celular e precisa pensar: "isso parece de agência cara, e parece MEU".

1. ENTENDA O NEGÓCIO
Descubra o que ele é de verdade pelo nome, categoria, endereço e bairro (ex.: "Mariazinha Bar e Comida Brasileira" = boteco de comida brasileira). Não force em categorias genéricas. Escreva em businessType.

2. DIREÇÃO DE ARTE (pense como designer, não como gerador de template)
- Escolha um conceito visual específico para este negócio e este lugar (ex.: "cardápio de boteco pernambucano impresso em papel de pão", "revista de moda dos anos 90", "manual técnico de oficina"). Escreva em concept.
- Composição editorial: grid assimétrico, escala tipográfica dramática (títulos enormes contra texto pequeno), muito espaço em branco, alinhamentos à esquerda, sobreposições intencionais de imagem e texto, quebras de grid controladas.
- Detalhes que mostram ofício: numeração e legendas pequenas em caixa alta com tracking, fios finos, rótulos, contadores de seção, marcadores tipográficos, um elemento gráfico assinatura repetido com moderação.
- PROIBIDO (visual de IA/template): gradiente roxo/azul, blobs, glassmorphism, ícones de clip-art, emojis, sombras exageradas, cards todos iguais em grade de 3, tudo centralizado, botões com gradiente, ilustração de mascote.

3. TIPOGRAFIA (escolha UM par desta lista, pelo id; não use outras fontes)
${pairingCatalogText()}
Use os nomes exatos das famílias no CSS, com fallback (ex.: font-family:"Clash Display",sans-serif). Não use itálico, exceto no par bodoni-hanken. Títulos: tamanhos com clamp() bem contrastados (hero de 64px a 160px no desktop), line-height 0.9–1.05, letter-spacing negativo. Texto: 16–18px, line-height 1.6, largura máxima ~65 caracteres.

4. CORES
Paleta de 3 a 5 cores coerente com o conceito (pode ser escura ou clara), contraste AA no texto. Use variáveis CSS em .vai.

5. FOTOS ${maxImages > 0 ? `(até ${maxImages}, geradas por IA a partir das suas descrições)
- Liste em meta.images: [{"slot":"hero","prompt":"…","aspect":"16:9"}, …]. Slots: letras/números/hífen. Aspect: 1:1, 4:5, 3:4, 4:3, 3:2, 16:9 ou 21:9.
- Use no HTML com src="{{IMG:slot}}" (ou no CSS: background-image:url({{IMG:slot}})). Sempre com alt descritivo e object-fit:cover.
- Escreva os prompts em inglês, como um diretor de fotografia: assunto, enquadramento, luz, lente, clima, paleta de cor coerente com o site. Estilo fotografia editorial real (35mm, luz natural, grão leve). Contexto brasileiro quando fizer sentido.
- Nada de texto, letreiros, logotipos, marcas ou nomes nas fotos. Pessoas só de costas, desfocadas ou em detalhe (mãos, gestos). Mostre o tipo de produto/ambiente, nunca algo que pareça ser "o" estabelecimento.
- A foto é protagonista em pelo menos uma seção: hero em tela cheia, imagem grande sangrando a borda, ou mosaico editorial.` : "(desativadas: não use imagens, só tipografia, cor, CSS e SVG)"}
FOTOS REAIS: se "fotos_reais" vier nos fatos, são fotos do próprio estabelecimento (Google Maps). Elas valem mais que qualquer foto de IA: use-as com destaque (hero, galeria) pelo marcador {{IMG:slot}} de cada uma (ex.: {{IMG:foto-1}}), sem pedir fotos de IA para os mesmos lugares. Não descreva o que aparece nelas além do óbvio. Se houver URLs em "fotos" (fotos enviadas pelo vendedor), use-as diretamente em src.

6. EFEITOS (profissionais e sutis; tudo deve funcionar sem eles)
O sistema oferece estes ganchos (sem você escrever JavaScript):
- data-reveal: o elemento recebe a classe "in" ao aparecer na tela, e .vai recebe "anim". Estilize: .vai.anim [data-reveal]{opacity:0;transform:translateY(32px)} .vai.anim [data-reveal].in{opacity:1;transform:none;transition:...}. Varie: fade, slide, clip-path de imagem (inset(100% 0 0 0) → inset(0)), escala de 1.08 → 1 em fotos. Use transition-delay em sequência.
- data-parallax="0.15": o elemento se move com a rolagem (valores de -0.3 a 0.3; positivo = mais lento). Ideal em fotos dentro de um contêiner com overflow:hidden (deixe a imagem ~20% maior que o contêiner) e em textos gigantes decorativos.
- .vai.scrolled: aplicada quando a página rolou; use para o cabeçalho fixo ganhar fundo/encolher.
- CSS puro: @keyframes na entrada do hero (título em linhas com mask/clip, foto com zoom lento), letreiro rolando (marquee) com o nome de categorias/itens, hovers com sublinhado animado, imagens com zoom no hover, seções sticky que se sobrepõem, scroll-driven animations dentro de @supports (animation-timeline: view()).
- Respeite @media (prefers-reduced-motion: reduce) desligando animações.

7. ESTRUTURA (adapte ordem e forma ao conceito)
Cabeçalho (o nome do negócio dentro de um elemento com o atributo data-brand, ex.: <a href="#inicio" data-brand>Nome</a>, e um botão de WhatsApp) → hero memorável com o NOME DO NEGÓCIO no único h1, o que é e onde fica, e o botão principal → sobre (curto) → o que oferece (itens fornecidos; cada um com link de WhatsApp já com o item) → fotos/galeria → como chegar (endereço, horário, WhatsApp, Instagram e o marcador {{MAP}}) → chamada final → rodapé. No celular, um botão fixo de WhatsApp no rodapé da tela.

8. TEXTO (português do Brasil)
Como o dono falaria com um vizinho: concreto, específico do negócio e do bairro, frases curtas.
PROIBIDO inventar: anos de mercado, fundação, prêmios, avaliações, estrelas, depoimentos, número de clientes, preços, promoções, garantias, nomes de pessoas, pratos/serviços fora dos fatos, horários fora dos fatos, "24h". Nenhum número que não esteja nos fatos (numeração de seção 01–09 pode).
Se os itens vierem marcados como sugestão, descreva-os de forma genérica.
Evite: "excelência", "qualidade", "experiência única", "descubra", "mais que um", "transforme", "eleve", "bateu a fome", "no capricho", "sem complicação", perguntas retóricas, exclamações, emojis.

9. REGRAS TÉCNICAS (obrigatórias)
- Responda com exatamente dois blocos, nada antes ou depois:
  <meta>{"businessType":"…","pairing":"id-do-par","palette":["#hex",…],"concept":"1 frase","images":[{"slot":"hero","prompt":"…","aspect":"16:9"}]}</meta>
  <site> … </site>
- Dentro de <site>: um único <style> no início e depois o HTML. Todo seletor começa com .vai (o conteúdo fica dentro de <div class="vai">).
- Mobile-first, de 360px a 1600px, sem rolagem horizontal (overflow-x:clip em .vai). Teste mentalmente o layout em 390px.
- Sem <script>, sem atributos on*, sem <iframe>, sem @import, sem url() externo, sem fontes além do par escolhido.
- Links SOMENTE com estes marcadores (o sistema troca pelos links reais): {{WA}}, {{WA:texto}} (ex.: {{WA:Quero pedir: Almoço}}), {{MAPS}}, {{INSTAGRAM}}, {{TEL}}, {{EMAIL}}, âncoras #secao. Nunca escreva URLs.
- {{MAP}} sozinho dentro de um elemento com altura definida. {{YEAR}} no rodapé.
- Sem WhatsApp nos fatos: não use {{WA}}; use {{TEL}} se houver telefone.
- HTML semântico, alt em imagens, foco visível, contraste AA.
- Até ~1000 linhas no total. Capriche no CSS.`;
}

/** A real photo of the business (Google Places), already available at `path`. */
export type RealPhoto = { slot: string; path: string; author?: string };

export type DesignImage = { slot: string; prompt: string; aspect: string };
export type DesignMeta = { businessType: string; pairing: string; fonts: SiteAi["fonts"]; palette?: string[]; concept?: string; images: DesignImage[] };

function factsPayload(b: BusinessFacts, extra: { whatsapp?: string; servicesAreSuggestions: boolean; services: string[]; photos: string[]; realPhotos: RealPhoto[] }) {
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
    fotos_reais: extra.realPhotos.map((p) => ({ slot: p.slot })),
    tem_mapa: !!(b.address || (b.lat && b.lng)),
  };
}


export function parseDesign(text: string): { meta: DesignMeta; html: string } {
  const m = text.match(/<meta>([\s\S]*?)<\/meta>/i);
  const s = text.match(/<site>([\s\S]*)<\/site>/i);
  if (!m || !s) throw new Error("Resposta sem os blocos <meta> e <site>");
  const raw = JSON.parse(m[1]!.trim()) as { businessType?: string; pairing?: string; palette?: unknown[]; concept?: string; images?: Partial<DesignImage>[] };
  const pairing = pairingById(String(raw.pairing ?? "")) ?? PAIRINGS[0]!;
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .filter((i) => i && typeof i.slot === "string" && /^[\w-]{1,30}$/.test(i.slot) && typeof i.prompt === "string" && i.prompt.length > 10)
    .slice(0, 6)
    .map((i) => ({ slot: i.slot!, prompt: i.prompt!.slice(0, 1200), aspect: String(i.aspect ?? "4:3") }));
  return {
    meta: {
      businessType: String(raw.businessType ?? "").slice(0, 80),
      pairing: pairing.id,
      fonts: [pairing.display, pairing.body],
      palette: (raw.palette ?? []).slice(0, 6).map(String),
      concept: String(raw.concept ?? "").slice(0, 300),
      images,
    },
    html: s[1]!.trim(),
  };
}

export const SVG_TAGS = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "text", "textPath", "tspan", "clipPath", "mask", "pattern", "use", "symbol", "title", "desc", "filter", "feTurbulence", "feColorMatrix", "feGaussianBlur", "feBlend", "feComposite", "feOffset", "feMerge", "feMergeNode", "feDisplacementMap"];
export const SVG_ATTRS = ["viewBox", "viewbox", "xmlns", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "patternUnits", "patternTransform", "clip-path", "clipPathUnits", "mask", "preserveAspectRatio", "text-anchor", "dominant-baseline", "font-size", "font-family", "font-weight", "letter-spacing", "textLength", "lengthAdjust", "startOffset", "href", "xlink:href", "filter", "baseFrequency", "numOctaves", "type", "values", "stdDeviation", "in", "in2", "result", "mode", "operator", "seed", "scale", "dx", "dy", "focusable"];

/** Strips anything that could run code or leak visitors elsewhere. Placeholders are kept for later substitution. */
export function sanitizeDesign(html: string) {
  // CSS: drop imports and external url(); keep data: URIs (inline SVG patterns).
  const cleanCss = (css: string) =>
    css
      .replace(/@import[^;]+;?/gi, "")
      .replace(/url\(\s*(?!['"]?\s*(?:data:|#|\{\{IMG:[\w-]+\}\}))[^)]*\)/gi, "none")
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
      img: ["src", "alt", "width", "height", "loading", "decoding", "fetchpriority", "class", "style", "data-*"],
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
    exclusiveFilter: (frame) => frame.tag === "img" && !/^(https:\/\/|\{\{IMG:[\w-]+\}\}$)/.test(frame.attribs.src ?? ""),
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
export function fillPlaceholders(html: string, c: { whatsapp?: string; phone?: string; email?: string; instagram?: string; mapsUrl?: string; mapEmbed?: string; name: string; images?: Record<string, string>; fallbackColor?: string }) {
  // Missing photo → soft tinted block, so the layout keeps its shape.
  const tint = /^#[0-9a-f]{6}$/i.test(c.fallbackColor ?? "") ? c.fallbackColor! : "#d9d4cc";
  const blank = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10"><rect width="16" height="10" fill="${tint}"/></svg>`)}`;
  const wa = (text: string) => (c.whatsapp ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(text)}` : c.phone ? `tel:+${c.phone}` : "#");
  const esc = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return html
    .replace(/\{\{WA:([^}]*)\}\}/g, (_, t: string) => esc(wa(`Olá! Vi o site de vocês. ${t.replace(/&amp;/g, "&").trim()}`)))
    .replace(/\{\{WA\}\}/g, esc(wa("Olá! Vi o site de vocês e gostaria de mais informações.")))
    .replace(/\{\{MAPS\}\}/g, c.mapsUrl ? esc(c.mapsUrl) : "#")
    .replace(/\{\{INSTAGRAM\}\}/g, c.instagram ? `https://instagram.com/${encodeURIComponent(c.instagram)}` : "#")
    .replace(/\{\{TEL\}\}/g, c.phone ? `tel:+${c.phone}` : "#")
    .replace(/\{\{EMAIL\}\}/g, c.email ? `mailto:${esc(c.email)}` : "#")
    .replace(/\{\{IMG:([\w-]+)\}\}/g, (_, slot: string) => {
      const u = c.images?.[slot];
      return u && (/^\/api\/assets\/[0-9a-f-]{36}$/.test(u) || /^\/api\/places\/photo\?n=[\w%.-]+&w=\d+$/.test(u)) ? esc(u) : blank;
    })
    .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{MAP\}\}/g, c.mapEmbed ? `<iframe src="${esc(c.mapEmbed)}" title="Mapa: ${esc(c.name)}" loading="lazy" style="border:0;width:100%;height:100%;min-height:300px;display:block"></iframe>` : "")
    .replace(/\{\{[A-Z]+(:[^}]*)?\}\}/g, "#");
}


/**
 * Asks the site model for a complete design. One retry with the validation problems as feedback.
 * Returns { error } when no LLM is configured, the call fails or the result can't be made safe — callers fall back to the template.
 */
const PHOTO_STYLE = " Editorial documentary photograph, natural light, real textures, shot on 35mm, subtle film grain, no text, no letters, no logos, no signage, no watermark.";

/** Generates the photos the design asked for (reusing photos of the previous version by slot). */
async function makeImages(
  orgId: string,
  html: string,
  meta: DesignMeta,
  max: number,
  previous: Record<string, string> | undefined,
  fetchImpl?: typeof fetch,
  log?: (m: string) => void,
) {
  const used = new Set([...html.matchAll(/\{\{IMG:([\w-]+)\}\}/g)].map((m) => m[1]!));
  const map: Record<string, string> = {};
  for (const slot of used) if (previous?.[slot]) map[slot] = previous[slot]!;
  const todo = meta.images.filter((i) => used.has(i.slot) && !map[i.slot]).slice(0, max);
  let costMicros = 0;
  if (!todo.length) return { map, costMicros };
  log?.(`Criando ${todo.length} ${todo.length === 1 ? "foto" : "fotos"} para o site…`);
  let lastErr = "";
  await Promise.all(
    todo.map(async (i) => {
      const r = await generateSiteImage(orgId, i.prompt + PHOTO_STYLE, i.aspect, fetchImpl, (m) => (lastErr = m));
      if (r) {
        map[i.slot] = r.url;
        costMicros += r.costMicros;
      }
    }),
  );
  if (lastErr) log?.(`Algumas fotos não foram geradas: ${lastErr}`);
  return { map, costMicros };
}

export async function designSite(
  orgId: string,
  b: BusinessFacts,
  opts: { services: string[]; servicesAreSuggestions: boolean; photos?: string[]; realPhotos?: RealPhoto[]; previous?: SiteAi; instructions?: string; log?: (m: string) => void },
  // returns { ai } on success or { error } with a human-readable reason
  fetchImpl?: typeof fetch,
): Promise<{ ai?: SiteAi; error?: string }> {
  const whatsapp = b.phoneE164 && isBrMobile(b.phoneE164) ? b.phoneE164 : undefined;
  const real = opts.realPhotos ?? [];
  const facts = factsPayload(b, { whatsapp, services: opts.services, servicesAreSuggestions: opts.servicesAreSuggestions, photos: opts.photos ?? [], realPhotos: real });
  const model = llmSiteModel();
  // Real photos replace AI ones: with 3+ real photos the design needs at most one AI image.
  const maxImages = imagesAvailable() ? Math.max(0, Math.min(env().SITE_IMAGES - (opts.photos?.length ?? 0) - real.length, real.length >= 3 ? 1 : 6)) : 0;
  const system = systemPrompt(maxImages);
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
    const r = await llmText(orgId, "site_design", { system, user, model, maxTokens: 24_000, timeoutMs: 600_000, json: false, stream: true, onError: (m) => (llmError = m) }, fetchImpl);
    if (!r) return { error: llmError || "a IA não respondeu" };
    totalCost += r.costMicros;
    try {
      const { meta, html } = parseDesign(r.text);
      const clean = sanitizeDesign(html);
      const problems = checkDesign(clean, b, { whatsapp });
      lastProblem = problems.join("; ");
      if (problems.length === 0) {
        const seed = { ...opts.previous?.images, ...Object.fromEntries(real.map((p) => [p.slot, p.path])) };
        const images = await makeImages(orgId, clean, meta, maxImages, seed, fetchImpl, opts.log);
        const usedReal = real.filter((p) => images.map[p.slot] === p.path);
        return {
          ai: {
            html: clean,
            fonts: meta.fonts,
            pairing: meta.pairing,
            images: images.map,
            businessType: meta.businessType,
            concept: meta.concept,
            palette: meta.palette,
            model: r.model,
            costMicros: totalCost + images.costMicros,
            generatedAt: new Date().toISOString(),
            instructions: opts.instructions,
            photoCredits: [...new Set(usedReal.map((p) => p.author).filter((a): a is string => !!a))],
          },
        };
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
