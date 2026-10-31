import Link from "next/link";
import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, LEAD_STAGES, type LeadStage } from "@/server/db";
import { Card, Empty, PageHeader, ScorePill, StageBadge, STAGE_LABEL, Badge } from "@/components/ui";
import { SelectAll } from "@/components/select-all";
import { nextStep } from "@/lib/labels";
import { Search, Radar, Sparkles, Send, X } from "lucide-react";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, segmentById } from "@/server/discovery/segments";
import { formatBrPhone, isBrMobile } from "@/lib/phone";
import { bulkAction } from "../_actions/leads";

export const metadata = { title: "Leads" };

const WEB_LABEL: Record<string, [string, "green" | "amber" | "red" | "neutral" | "blue"]> = {
  confirmed_absent: ["Não tem", "green"],
  none_in_source: ["Não encontrado", "neutral"],
  social_only: ["Só redes sociais", "blue"],
  has_website: ["Já tem", "red"],
  unknown: ["A verificar", "neutral"],
};

type SP = { q?: string; stage?: string; segment?: string; city?: string; min?: string; web?: string; page?: string; ok?: string; err?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const per = 50;
  const where: SQL[] = [eq(leads.orgId, s.orgId)];
  if (sp.stage && (LEAD_STAGES as readonly string[]).includes(sp.stage)) where.push(eq(leads.stage, sp.stage as LeadStage));
  if (sp.segment) where.push(eq(businesses.segment, sp.segment));
  if (sp.city) where.push(ilike(businesses.city, `%${sp.city}%`));
  if (sp.min) where.push(gte(leads.score, Number(sp.min)));
  if (sp.web === "nosite") where.push(sql`${businesses.websiteStatus} in ('none_in_source','social_only','confirmed_absent')`);
  if (sp.q) where.push(or(ilike(businesses.name, `%${sp.q}%`), ilike(businesses.phoneE164, `%${sp.q.replace(/\D/g, "") || "~"}%`), ilike(businesses.neighborhood, `%${sp.q}%`))!);

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ lead: leads, b: businesses, siteId: sql<string | null>`(select id from websites w where w.lead_id = ${leads.id} order by created_at desc limit 1)` })
      .from(leads)
      .innerJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(...where))
      .orderBy(desc(leads.score), desc(leads.updatedAt))
      .limit(per)
      .offset((page - 1) * per),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(and(...where)) as unknown as Promise<[{ n: number }]>,
  ]);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ok: undefined, err: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${p}`;
  };
  const back = qs({});
  const filtered = !!(sp.q || sp.stage || sp.segment || sp.city || sp.web || sp.min);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${n.toLocaleString("pt-BR")} ${n === 1 ? "empresa" : "empresas"}, das mais promissoras para as menos`}
        actions={<Link href="/discovery" className="btn btn-primary"><Radar size={16} /> Prospectar</Link>}
      />
      <Flash sp={sp} />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto_auto]" role="search">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search size={16} className="subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
          <input className="field pl-9" name="q" placeholder="Nome, telefone ou bairro" defaultValue={sp.q} aria-label="Buscar" />
        </div>
        <select className="field" name="stage" defaultValue={sp.stage ?? ""} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {LEAD_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
        </select>
        <select className="field" name="segment" defaultValue={sp.segment ?? ""} aria-label="Tipo de negócio">
          <option value="">Todos os tipos</option>
          {SEGMENTS.map((sg) => <option key={sg.id} value={sg.id}>{sg.label}</option>)}
        </select>
        <select className="field" name="web" defaultValue={sp.web ?? ""} aria-label="Site">
          <option value="">Com ou sem site</option>
          <option value="nosite">Só sem site próprio</option>
        </select>
        <button className="btn btn-secondary">Filtrar</button>
        {filtered ? <Link href="/leads" className="btn btn-quiet"><X size={15} /> Limpar</Link> : <span className="hidden lg:block" />}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <Empty title="Nenhum lead com esses filtros" action={<Link href="/leads" className="btn btn-secondary">Limpar filtros</Link>}>
            Tente outra etapa ou tipo de negócio.
          </Empty>
        ) : (
          <Empty title="Nenhum lead ainda" icon={<Radar size={18} />} action={<Link href="/discovery" className="btn btn-primary">Buscar empresas</Link>}>
            Busque por cidade e tipo de negócio, importe uma planilha ou cadastre uma empresa.
          </Empty>
        )
      ) : (
        <form action={bulkAction}>
          <input type="hidden" name="back" value={back} />
          <Card flush className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <span className="muted mr-1 text-[0.8125rem]">Com os selecionados:</span>
              <Submit name="op" value="preview" className="btn btn-secondary btn-sm" pendingText="Gerando…"><Sparkles size={14} /> Gerar sites</Submit>
              <Submit name="op" value="outreach" className="btn btn-primary btn-sm" confirm="Enviar o primeiro contato no WhatsApp para os selecionados que podem receber?">
                <Send size={14} /> Enviar 1º contato
              </Submit>
              <Submit name="op" value="discard" className="btn btn-quiet btn-sm ml-auto" confirm="Marcar os selecionados como perdidos?">Descartar</Submit>
            </div>
            <div className="scroll-thin overflow-x-auto">
              <table className="table min-w-[880px]">
                <thead>
                  <tr>
                    <th className="w-10"><SelectAll /></th>
                    <th>Empresa</th>
                    <th>WhatsApp</th>
                    <th>Site atual</th>
                    <th>Nota</th>
                    <th>Etapa</th>
                    <th>Próxima ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ lead, b, siteId }) => {
                    const w = WEB_LABEL[b.websiteStatus]!;
                    return (
                      <tr key={lead.id}>
                        <td><input type="checkbox" name="ids" value={lead.id} aria-label={`Selecionar ${b.name}`} /></td>
                        <td className="max-w-[280px]">
                          <Link href={`/leads/${lead.id}`} className="block truncate font-semibold hover:underline">{b.name}</Link>
                          <div className="muted truncate text-[0.8125rem]">{segmentById(b.segment).label}{b.neighborhood || b.city ? `, ${[b.neighborhood, b.city].filter(Boolean).join(", ")}` : ""}</div>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          {b.phoneE164 ? (isBrMobile(b.phoneE164) ? formatBrPhone(b.phoneE164) : <span className="muted">{formatBrPhone(b.phoneE164)} (fixo)</span>) : <span className="subtle">Sem telefone</span>}
                        </td>
                        <td><Badge tone={w[1]}>{w[0]}</Badge></td>
                        <td><ScorePill score={lead.score} /></td>
                        <td><StageBadge stage={lead.stage} /></td>
                        <td className="muted max-w-[240px] truncate text-[0.8125rem]">{nextStep({ stage: lead.stage, websiteStatus: b.websiteStatus, hasPhone: !!b.phoneE164, hasSite: !!siteId, active: b.active })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </form>
      )}
      {n > per && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
          <span className="muted">Página {page} de {Math.ceil(n / per)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(page - 1) })}>Anterior</Link>}
            {page * per < n && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(page + 1) })}>Próxima</Link>}
          </div>
        </nav>
      )}
    </>
  );
}
