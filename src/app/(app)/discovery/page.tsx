import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, discoveryRuns } from "@/server/db";
import { Card, Field, PageHeader } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, UF_DDD, segmentById } from "@/server/discovery/segments";
import { DEFAULT_LIMIT } from "@/server/discovery/connectors";
import { env } from "@/server/env";
import { addManualBusiness, importCsv, startDiscovery, suggestSearchesAction } from "../_actions/leads";
import { getSuggestions } from "@/server/ai/prospect";
import { llmConfigured } from "@/server/ai/llm";
import { FilePicker } from "@/components/file-picker";
import { DiscoveryRuns, type RunView } from "@/components/discovery-runs";
import { redis } from "@/server/redis";
import { Search, Sparkles, Upload, UserPlus } from "lucide-react";

export const metadata = { title: "Prospecção" };

const UFS = Object.keys(UF_DDD).sort();

function SegmentSelect({ id }: { id?: string }) {
  return (
    <select id={id} className="field" name="segment" defaultValue="barbearia">
      {SEGMENTS.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}
function UfSelect({ defaultValue = "PE" }: { defaultValue?: string }) {
  return (
    <select className="field" name="state" defaultValue={defaultValue} aria-label="UF">
      {UFS.map((u) => <option key={u}>{u}</option>)}
    </select>
  );
}


export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const runs = await db.select().from(discoveryRuns).where(eq(discoveryRuns.orgId, s.orgId)).orderBy(desc(discoveryRuns.createdAt)).limit(10);
  const hasGoogle = !!env().GOOGLE_PLACES_API_KEY;
  const [sugg, aiOn] = [await getSuggestions(s.orgId), llmConfigured()];
  const lastP = (runs[0]?.params ?? null) as { city?: string; state?: string } | null;
  const [defCity, defUf] = sugg ? sugg.region.split("/") : [lastP?.city ?? "Recife", lastP?.state ?? "PE"];
  const hb = await redis().get("vendlia:worker:heartbeat").catch(() => null);
  const workerOk = !!hb && Date.now() - Number(hb) < 3 * 60_000;
  const runViews: RunView[] = runs.map((r) => {
    const p = r.params as { city: string; state: string; segment: string; neighborhood?: string };
    return {
      id: r.id,
      source: r.source,
      status: r.status,
      found: r.found,
      created: r.created,
      error: r.error,
      logs: r.logs,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      label: `${segmentById(p.segment).label} em ${p.neighborhood ? `${p.neighborhood}, ` : ""}${p.city}/${p.state}`,
      segment: p.segment,
    };
  });

  return (
    <>
      <PageHeader title="Prospecção" subtitle="Encontre negócios na sua região. As empresas encontradas vão para Leads com uma nota de oportunidade." />
      <Flash sp={sp} />

      {aiOn && (
        <Card
          className="mb-6"
          title={<span id="sugestoes" className="inline-flex scroll-mt-8 items-center gap-2"><Sparkles size={16} /> Onde buscar agora</span>}
          description="A IA sugere tipos de negócio e bairros com mais chance de venda, considerando a região e o que já deu resultado nas suas buscas."
        >
          <form action={suggestSearchesAction} className="grid gap-4 md:grid-cols-[1.2fr_88px_1.8fr_auto] md:items-end">
            <Field label="Cidade"><input className="field" name="city" defaultValue={defCity} required /></Field>
            <Field label="UF"><UfSelect defaultValue={defUf} /></Field>
            <Field label="Prioridade" optional><input className="field" name="focus" placeholder="Ex.: clientes que pagam mais; perto do centro" /></Field>
            <Submit className="btn btn-secondary" pendingText="Pensando… (até 30 s)"><Sparkles size={15} /> {sugg ? "Sugerir de novo" : "Sugerir buscas"}</Submit>
          </form>
          {sugg && (
            <ul className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {sugg.items.map((it, i) => (
                <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {segmentById(it.segment).label} <span className="muted font-normal">em</span> {it.neighborhood ? `${it.neighborhood}, ` : ""}{it.city}/{it.state}
                    </div>
                    <p className="muted mt-0.5 text-[0.8125rem]">{it.reason}</p>
                    {it.pitch && <p className="mt-1 text-[0.8125rem]"><span className="subtle">Abordagem:</span> {it.pitch}</p>}
                  </div>
                  <form action={startDiscovery}>
                    <input type="hidden" name="segment" value={it.segment} />
                    <input type="hidden" name="city" value={it.city} />
                    <input type="hidden" name="state" value={it.state} />
                    {it.neighborhood && <input type="hidden" name="neighborhood" value={it.neighborhood} />}
                    <input type="hidden" name="source" value={hasGoogle ? "google_places" : "osm"} />
                    <input type="hidden" name="limit" value={String(DEFAULT_LIMIT)} />
                    <Submit className="btn btn-primary btn-sm" pendingText="Iniciando…"><Search size={14} /> Buscar</Submit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card tour="discovery-search" title="Buscar empresas" description="Escolha o tipo de negócio e a cidade. A busca leva cerca de um minuto.">
        <form action={startDiscovery}>
          <div className="grid gap-4 md:grid-cols-[1.1fr_1.1fr_1fr_88px_auto] md:items-end">
            <Field label="Tipo de negócio"><SegmentSelect /></Field>
            <Field label="Cidade"><input className="field" name="city" defaultValue="Recife" required placeholder="Ex.: Recife" autoComplete="address-level2" /></Field>
            <Field label="Bairro" optional><input className="field" name="neighborhood" placeholder="Cidade inteira" /></Field>
            <Field label="UF"><UfSelect /></Field>
            <Submit className="btn btn-primary" pendingText="Iniciando…"><Search size={16} /> Buscar</Submit>
          </div>
          <details className="mt-4 group">
            <summary className="muted inline-flex cursor-pointer list-none items-center gap-1 text-[0.8125rem] font-medium hover:text-[var(--ink)]">
              <span className="transition-transform group-open:rotate-90">›</span> Mais opções
            </summary>
            <div className="mt-3 grid gap-4 md:grid-cols-[1.2fr_1fr_1.6fr]">
              <Field label="Fonte dos dados" hint={hasGoogle ? undefined : "Para usar o Google, configure a chave GOOGLE_PLACES_API_KEY."}>
                <select className="field" name="source" defaultValue={hasGoogle ? "google_places" : "osm"}>
                  <option value="osm">OpenStreetMap (gratuito)</option>
                  <option value="google_places" disabled={!hasGoogle}>Google Maps</option>
                </select>
              </Field>
              <Field label="Máximo de empresas" hint="Menos empresas, menos custo. No Google, cada 20 empresas é uma consulta.">
                <select className="field" name="limit" defaultValue={String(DEFAULT_LIMIT)}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="40">40</option>
                  <option value="60">60</option>
                </select>
              </Field>
              <p className="muted self-end pb-2 text-[0.8125rem]">O OpenStreetMap costuma ter nome e endereço, mas nem sempre telefone. O Google traz mais telefones, e os dados dele ficam guardados por no máximo 30 dias.</p>
            </div>
          </details>
        </form>
      </Card>

      <Card className="mt-6" title="Buscas recentes" description="O andamento aparece aqui em tempo real. Pode atualizar a página: nada se perde." flush>
        <DiscoveryRuns initial={runViews} initialWorkerOk={workerOk} />
      </Card>

      <h2 className="mt-10 mb-1 text-[0.9375rem] font-semibold">Outras formas de adicionar empresas</h2>
      <p className="muted mb-4 text-[0.8125rem]">Já tem uma lista? Importe ou cadastre uma a uma.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-2"><Upload size={16} /> Importar planilha</span>} description="Arquivo CSV com uma empresa por linha.">
          <form action={importCsv} className="space-y-4">
            <Field label="Arquivo" required hint="Colunas reconhecidas: nome, telefone ou whatsapp, cidade, uf, bairro, endereco, site, instagram, cnpj, email.">
              <FilePicker name="file" accept=".csv,text/csv" required />
            </Field>
            <Field label="De onde vieram esses dados?" required hint="Fica registrado em cada empresa, para controle e LGPD.">
              <input className="field" name="origin" placeholder="Ex.: minha lista de contatos" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1.3fr_1.2fr_96px]">
              <Field label="Tipo de negócio"><SegmentSelect /></Field>
              <Field label="Cidade" optional><input className="field" name="city" placeholder="Se faltar na planilha" /></Field>
              <Field label="UF"><UfSelect /></Field>
            </div>
            <div className="flex justify-end"><Submit className="btn btn-secondary" pendingText="Importando…">Importar empresas</Submit></div>
          </form>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><UserPlus size={16} /> Cadastrar uma empresa</span>} description="Para quem você já conhece ou achou por conta própria.">
          <form action={addManualBusiness} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da empresa" required><input className="field" name="name" required /></Field>
              <Field label="Tipo de negócio"><SegmentSelect /></Field>
              <Field label="WhatsApp"><input className="field" name="phone" type="tel" inputMode="tel" placeholder="(81) 99999-9999" /></Field>
              <Field label="Instagram" optional><input className="field" name="instagram" placeholder="@perfil" /></Field>
            </div>
            <Field label="Endereço" optional><input className="field" name="address" placeholder="Rua, número e bairro" /></Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_96px_1fr]">
              <Field label="Cidade"><input className="field" name="city" defaultValue="Recife" /></Field>
              <Field label="UF"><UfSelect /></Field>
              <Field label="Site atual" optional><input className="field" name="website" placeholder="Se já tiver" /></Field>
            </div>
            <div className="flex justify-end"><Submit className="btn btn-secondary" pendingText="Salvando…">Cadastrar empresa</Submit></div>
          </form>
        </Card>
      </div>
    </>
  );
}
