import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, discoveryRuns } from "@/server/db";
import { Badge, Card, Field, PageHeader, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, UF_DDD, segmentById } from "@/server/discovery/segments";
import { env } from "@/server/env";
import { addManualBusiness, importCsv, startDiscovery } from "../_actions/leads";
import { FilePicker } from "@/components/file-picker";
import { Search, Upload, UserPlus } from "lucide-react";

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

const RUN_STATUS: Record<string, [string, "neutral" | "blue" | "green" | "red"]> = {
  queued: ["Na fila", "neutral"],
  running: ["Buscando", "blue"],
  done: ["Concluída", "green"],
  failed: ["Falhou", "red"],
};

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const runs = await db.select().from(discoveryRuns).where(eq(discoveryRuns.orgId, s.orgId)).orderBy(desc(discoveryRuns.createdAt)).limit(10);
  const hasGoogle = !!env().GOOGLE_PLACES_API_KEY;
  const stuck = runs.some((r) => r.status === "queued" && Date.now() - r.createdAt.getTime() > 3 * 60_000);

  return (
    <>
      <PageHeader title="Prospecção" subtitle="Encontre negócios na sua região. As empresas encontradas vão para Leads com uma nota de oportunidade." />
      <Flash sp={sp} />

      <Card tour="discovery-search" title="Buscar empresas" description="Escolha o tipo de negócio e a cidade. A busca leva cerca de um minuto.">
        <form action={startDiscovery}>
          <div className="grid gap-4 md:grid-cols-[1.2fr_1.4fr_96px_auto] md:items-end">
            <Field label="Tipo de negócio"><SegmentSelect /></Field>
            <Field label="Cidade"><input className="field" name="city" defaultValue="Recife" required placeholder="Ex.: Recife" autoComplete="address-level2" /></Field>
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
              <Field label="Máximo de empresas"><input className="field" name="limit" type="number" defaultValue={300} min={10} max={1000} /></Field>
              <p className="muted self-end pb-2 text-[0.8125rem]">O OpenStreetMap costuma ter nome e endereço, mas nem sempre telefone. O Google traz mais telefones, e os dados dele ficam guardados por no máximo 30 dias.</p>
            </div>
          </details>
        </form>
      </Card>

      <Card className="mt-6" title="Buscas recentes" flush>
        {runs.length === 0 ? (
          <p className="muted px-5 py-6 text-sm">Nenhuma busca ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {runs.map((r) => {
              const p = r.params as { city: string; state: string; segment: string };
              const [label, tone] = RUN_STATUS[r.status] ?? ["—", "neutral"];
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {segmentById(p.segment).label} em {p.city}/{p.state}
                    </div>
                    <div className="muted text-[0.8125rem]">
                      {r.source === "google_places" ? "Google Maps" : "OpenStreetMap"}, {timeAgo(r.createdAt)}
                      {r.status === "done" && <> — {r.created} {r.created === 1 ? "nova empresa" : "novas empresas"} de {r.found} encontradas</>}
                    </div>
                    {r.error && <div className="mt-1 text-[0.8125rem] text-[var(--danger)]">{r.error}</div>}
                    {r.status === "done" && r.found === 0 && <div className="mt-1 text-[0.8125rem] text-[var(--warn)]">Nada encontrado. Confira o nome da cidade e a UF, ou tente outro tipo de negócio.</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone}>{label}</Badge>
                    {r.status === "done" && r.created > 0 && <Link href={`/leads?segment=${p.segment}`} className="btn btn-secondary btn-sm">Ver leads</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {stuck && (
          <p className="border-t border-[var(--line)] px-5 py-3 text-[0.8125rem] text-[var(--warn)]">
            Há buscas paradas na fila há mais de 3 minutos. Confira se o serviço está no ar e se as variáveis DATABASE_URL e REDIS_URL estão configuradas.
          </p>
        )}
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
