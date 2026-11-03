import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db, discoveryRuns, leads, businesses } from "../db";
import { redis } from "../redis";
import { SEGMENTS, UF_DDD, type SegmentId } from "../discovery/segments";
import { extractJson, llmSiteModel, llmText } from "./llm";

export type SearchSuggestion = { segment: SegmentId; city: string; state: string; neighborhood?: string; reason: string; pitch?: string };
export type Suggestions = { createdAt: string; region: string; items: SearchSuggestion[] };

const key = (orgId: string) => `vendlia:suggest:${orgId}`;

const schema = z.object({
  suggestions: z
    .array(
      z.object({
        segment: z.string(),
        city: z.string().min(2).max(60),
        state: z.string().length(2),
        neighborhood: z.string().max(60).nullish(),
        reason: z.string().min(10).max(400),
        pitch: z.string().max(240).nullish(),
      }),
    )
    .min(1)
    .max(10),
});

const SYSTEM = `Você é estrategista comercial de uma agência que vende sites para pequenos negócios locais no Brasil. O vendedor encontra empresas sem site, gera uma prévia e oferece pelo WhatsApp.

Sugira as 6 melhores buscas para ele fazer agora, na região informada. Cada busca = um tipo de negócio (somente dos ids permitidos) + cidade + bairro opcional.

Critérios (pondere todos):
- Negócios que dependem de ser achados no Google/WhatsApp e costumam não ter site (agenda, pedido, orçamento).
- Ticket e margem do cliente: quem fatura mais paga por site com mais facilidade.
- Densidade comercial do bairro: bairros com muitas lojas de rua, centros de bairro e corredores comerciais rendem mais empresas por busca. Prefira bairros específicos e reais daquela cidade, que você conhece.
- Histórico do vendedor (abaixo): repita o que deu resposta, evite repetir buscas já feitas no mesmo lugar e segmentos com muitas empresas já encontradas e nenhuma resposta.
- Variedade: não sugira 6 vezes o mesmo segmento ou o mesmo bairro.

Para cada sugestão, "reason" explica em 1 ou 2 frases por que vale a pena (sem inventar números ou estatísticas) e "pitch" dá um gancho curto para a abordagem no WhatsApp.
Responda SOMENTE com JSON: {"suggestions":[{"segment":"id","city":"…","state":"UF","neighborhood":"… ou null","reason":"…","pitch":"…"}]}`;

async function history(orgId: string) {
  const runs = await db.select({ params: discoveryRuns.params, found: discoveryRuns.found, created: discoveryRuns.created, status: discoveryRuns.status }).from(discoveryRuns).where(eq(discoveryRuns.orgId, orgId)).orderBy(desc(discoveryRuns.createdAt)).limit(30);
  const funnel = await db
    .select({ segment: businesses.segment, stage: leads.stage, n: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(eq(leads.orgId, orgId))
    .groupBy(businesses.segment, leads.stage);
  const bySeg: Record<string, Record<string, number>> = {};
  for (const r of funnel) (bySeg[r.segment] ??= {})[r.stage] = r.n;
  return {
    buscas_recentes: runs.map((r) => {
      const p = r.params as { city?: string; state?: string; segment?: string; neighborhood?: string };
      return { segmento: p.segment, cidade: p.city, uf: p.state, bairro: p.neighborhood ?? null, encontradas: r.found, novas: r.created, status: r.status };
    }),
    funil_por_segmento: bySeg,
  };
}

export async function suggestSearches(orgId: string, input: { city: string; state: string; focus?: string }, fetchImpl?: typeof fetch): Promise<{ data?: Suggestions; error?: string }> {
  const uf = input.state.toUpperCase();
  const allowed = SEGMENTS.map((s) => `${s.id} (${s.label})`).join(", ");
  let err = "";
  const r = await llmText(
    orgId,
    "prospect_suggest",
    {
      system: SYSTEM,
      user: JSON.stringify({ regiao: { cidade: input.city, uf }, prioridade_do_vendedor: input.focus || null, ids_permitidos: allowed, historico: await history(orgId) }),
      model: llmSiteModel(),
      maxTokens: 2500,
      timeoutMs: 120_000,
      stream: true,
      onError: (m) => (err = m),
    },
    fetchImpl,
  );
  if (!r) return { error: err || "a IA não respondeu" };
  let parsed;
  try {
    parsed = schema.safeParse(extractJson(r.text));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "resposta inválida" };
  }
  if (!parsed.success) return { error: "a IA respondeu fora do formato" };
  const ids = new Set(SEGMENTS.map((s) => s.id));
  const items = parsed.data.suggestions
    .filter((s) => ids.has(s.segment as SegmentId) && UF_DDD[s.state.toUpperCase()] !== undefined)
    .map((s) => ({ segment: s.segment as SegmentId, city: s.city.trim(), state: s.state.toUpperCase(), neighborhood: s.neighborhood?.trim() || undefined, reason: s.reason.trim(), pitch: s.pitch?.trim() || undefined }))
    .slice(0, 8);
  if (!items.length) return { error: "a IA não trouxe sugestões válidas" };
  const data: Suggestions = { createdAt: new Date().toISOString(), region: `${input.city}/${uf}`, items };
  await redis().set(key(orgId), JSON.stringify(data), "EX", 60 * 60 * 24 * 14).catch(() => {});
  return { data };
}

export async function getSuggestions(orgId: string): Promise<Suggestions | null> {
  const raw = await redis().get(key(orgId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Suggestions;
  } catch {
    return null;
  }
}
