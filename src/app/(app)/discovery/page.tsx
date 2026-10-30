import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, discoveryRuns } from "@/server/db";
import { Badge, Card, Field, Notice, PageHeader, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, UF_DDD, segmentById } from "@/server/discovery/segments";
import { env } from "@/server/env";
import { addManualBusiness, importCsv, startDiscovery } from "../_actions/leads";

export const metadata = { title: "Prospecção" };

const UFS = Object.keys(UF_DDD).sort();

function SegmentSelect({ name = "segment" }: { name?: string }) {
  return (
    <select className="field" name={name} defaultValue="barbearia">
      {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label}{s.priority ? " ★" : ""}</option>)}
    </select>
  );
}
function UfSelect() {
  return <select className="field" name="state" defaultValue="PE">{UFS.map((u) => <option key={u}>{u}</option>)}</select>;
}

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const runs = await db.select().from(discoveryRuns).where(eq(discoveryRuns.orgId, s.orgId)).orderBy(desc(discoveryRuns.createdAt)).limit(15);
  const hasGoogle = !!env().GOOGLE_PLACES_API_KEY;
  return (
    <>
      <PageHeader title="Prospecção" subtitle="Encontre negócios com oportunidade digital em fontes autorizadas." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Buscar por cidade e segmento">
          <form action={startDiscovery} className="grid gap-3 sm:grid-cols-2">
            <Field label="Fonte">
              <select className="field" name="source" defaultValue={hasGoogle ? "google_places" : "osm"}>
                <option value="osm">OpenStreetMap (gratuito, ODbL)</option>
                <option value="google_places" disabled={!hasGoogle}>Google Places API{hasGoogle ? "" : " — configure a chave"}</option>
              </select>
            </Field>
            <Field label="Segmento"><SegmentSelect /></Field>
            <Field label="Cidade"><input className="field" name="city" defaultValue="Recife" required /></Field>
            <Field label="UF"><UfSelect /></Field>
            <Field label="Limite de resultados" hint="Google: até 60 por busca"><input className="field" name="limit" type="number" defaultValue={300} min={10} max={1000} /></Field>
            <div className="flex items-end"><Submit className="btn btn-dark w-full" pendingText="Iniciando…">Iniciar busca</Submit></div>
          </form>
          <div className="mt-4"><Notice tone="info">
            O OpenStreetMap tem boa cobertura de nome e endereço, mas telefone nem sempre. O Google Places traz mais telefones; pelos termos do Google, os dados (exceto o ID) só podem ficar armazenados por 30 dias — leads não trabalhados são removidos automaticamente.
          </Notice></div>
        </Card>

        <Card title="Últimas buscas">
          {runs.length === 0 ? <p className="muted text-sm">Nenhuma busca ainda.</p> : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {runs.map((r) => {
                const p = r.params as { city: string; state: string; segment: string };
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{segmentById(p.segment).label} · {p.city}/{p.state}</div>
                      <div className="muted truncate text-xs">{r.source} · {timeAgo(r.createdAt)}{r.error ? ` · ${r.error}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <Badge tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                      {r.status === "done" && <div className="muted mt-0.5 text-xs">{r.created} novas / {r.found}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Importar CSV">
          <form action={importCsv} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Arquivo" hint="Colunas aceitas: nome, telefone/whatsapp, cidade, uf, bairro, endereco, site, instagram, cnpj, email, segmento. Separador , ou ;"><input className="field" type="file" name="file" accept=".csv,text/csv" required /></Field></div>
            <div className="sm:col-span-2"><Field label="Origem dos dados" hint="Obrigatório para rastreabilidade (LGPD)."><input className="field" name="origin" placeholder="Ex.: lista própria de clientes, fornecedor X licenciado" required /></Field></div>
            <Field label="Segmento padrão"><SegmentSelect /></Field>
            <Field label="Cidade padrão"><input className="field" name="city" placeholder="Recife" /></Field>
            <Field label="UF padrão"><UfSelect /></Field>
            <div className="flex items-end"><Submit className="btn btn-ghost w-full" pendingText="Importando…">Importar</Submit></div>
          </form>
        </Card>

        <Card title="Cadastrar manualmente">
          <form action={addManualBusiness} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome"><input className="field" name="name" required /></Field>
            <Field label="Segmento"><SegmentSelect /></Field>
            <Field label="WhatsApp"><input className="field" name="phone" placeholder="(81) 99999-9999" /></Field>
            <Field label="Instagram"><input className="field" name="instagram" placeholder="@perfil" /></Field>
            <Field label="Cidade"><input className="field" name="city" defaultValue="Recife" /></Field>
            <Field label="UF"><UfSelect /></Field>
            <div className="sm:col-span-2"><Field label="Endereço"><input className="field" name="address" /></Field></div>
            <Field label="Site atual (se tiver)"><input className="field" name="website" /></Field>
            <div className="flex items-end"><Submit className="btn btn-ghost w-full">Cadastrar</Submit></div>
          </form>
        </Card>
      </div>
    </>
  );
}
