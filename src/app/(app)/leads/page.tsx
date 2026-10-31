import Link from "next/link";
import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, websites, LEAD_STAGES, type LeadStage } from "@/server/db";
import { Card, Empty, PageHeader, ScorePill, StageBadge, STAGE_LABEL, Badge } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, segmentById } from "@/server/discovery/segments";
import { formatBrPhone, isBrMobile } from "@/lib/phone";
import { bulkAction } from "../_actions/leads";

export const metadata = { title: "Leads" };

const WEB_LABEL: Record<string, [string, "green" | "amber" | "red" | "neutral" | "blue"]> = {
  confirmed_absent: ["Sem site ✓", "green"],
  none_in_source: ["Sem site?", "amber"],
  social_only: ["Só redes", "blue"],
  has_website: ["Tem site", "red"],
  unknown: ["?", "neutral"],
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
  void websites;
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ok: undefined, err: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${p}`;
  };
  const back = qs({});

  return (
    <>
      <PageHeader title="Leads" subtitle={`${n.toLocaleString("pt-BR")} empresas · ordenadas por oportunidade`} actions={<Link href="/discovery" className="btn btn-dark">Prospectar</Link>} />
      <Flash sp={sp} />
      <form className="panel mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" method="get">
        <input className="field" name="q" placeholder="Buscar nome, telefone, bairro…" defaultValue={sp.q} />
        <select className="field" name="stage" defaultValue={sp.stage ?? ""}>
          <option value="">Todas as etapas</option>
          {LEAD_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
        </select>
        <select className="field" name="segment" defaultValue={sp.segment ?? ""}>
          <option value="">Todos os segmentos</option>
          {SEGMENTS.map((sg) => <option key={sg.id} value={sg.id}>{sg.label}</option>)}
        </select>
        <input className="field" name="city" placeholder="Cidade" defaultValue={sp.city} />
        <select className="field" name="web" defaultValue={sp.web ?? ""}>
          <option value="">Presença digital</option>
          <option value="nosite">Sem site próprio</option>
        </select>
        <button className="btn btn-ghost">Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <Empty title="Nenhum lead encontrado" action={<Link href="/discovery" className="btn btn-primary">Encontrar empresas</Link>}>
          Rode uma prospecção por cidade e segmento, importe um CSV ou cadastre manualmente.
        </Empty>
      ) : (
        <form action={bulkAction}>
          <input type="hidden" name="back" value={back} />
          <div className="mb-3 flex flex-wrap items-center gap-2" data-tour="bulk">
            <span className="muted text-xs">Com selecionados:</span>
            <button name="op" value="preview" className="btn btn-ghost">Gerar demonstrações</button>
            <Submit name="op" value="outreach" className="btn btn-primary" confirm="Enfileirar o primeiro contato no WhatsApp para os leads elegíveis selecionados?">
              Enviar 1º contato
            </Submit>
            <Submit name="op" value="discard" className="btn btn-danger" confirm="Marcar os selecionados como perdidos?">Descartar</Submit>
          </div>
          <Card className="overflow-hidden [&>div]:p-0">
            <div className="overflow-x-auto scroll-thin">
              <table className="table min-w-[860px]">
                <thead>
                  <tr>
                    <th className="w-8"><span className="sr-only">Selecionar</span></th>
                    <th>Empresa</th>
                    <th>Segmento</th>
                    <th>Contato</th>
                    <th>Site</th>
                    <th>Score</th>
                    <th>Etapa</th>
                    <th>Próxima ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ lead, b, siteId }) => {
                    const w = WEB_LABEL[b.websiteStatus]!;
                    return (
                      <tr key={lead.id}>
                        <td><input type="checkbox" name="ids" value={lead.id} aria-label={`Selecionar ${b.name}`} className="h-4 w-4 accent-[#39D79B]" /></td>
                        <td>
                          <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">{b.name}</Link>
                          <div className="muted text-xs">{[b.neighborhood, b.city].filter(Boolean).join(", ") || "—"}</div>
                        </td>
                        <td className="text-xs">{segmentById(b.segment).label}</td>
                        <td className="text-xs tabular-nums">
                          {b.phoneE164 ? formatBrPhone(b.phoneE164) : <span className="muted">sem telefone</span>}
                          {b.phoneE164 && !isBrMobile(b.phoneE164) && <span className="muted"> (fixo)</span>}
                        </td>
                        <td><Badge tone={w[1]}>{w[0]}</Badge>{siteId && <span className="ml-1"><Badge tone="dark">demo</Badge></span>}</td>
                        <td><ScorePill score={lead.score} /></td>
                        <td><StageBadge stage={lead.stage} /></td>
                        <td className="muted max-w-[220px] truncate text-xs">{lead.nextAction}</td>
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
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="muted">Página {page} de {Math.ceil(n / per)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn btn-ghost" href={qs({ page: String(page - 1) })}>Anterior</Link>}
            {page * per < n && <Link className="btn btn-ghost" href={qs({ page: String(page + 1) })}>Próxima</Link>}
          </div>
        </div>
      )}
    </>
  );
}
