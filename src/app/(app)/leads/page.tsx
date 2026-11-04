import Link from "next/link";
import { and, desc, eq, gte, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, LEAD_STAGES, type LeadStage } from "@/server/db";
import { Card, Empty, PageHeader, ScorePill, StageBadge, STAGE_LABEL, Badge } from "@/components/ui";
import { SelectAll } from "@/components/select-all";
import { nextStep } from "@/lib/labels";
import { Search, Radar, Sparkles, Send, X, Trash2, RotateCcw, Star, MapPin, LayoutGrid, Rows3, MessageCircle, AtSign, ArrowUpRight } from "lucide-react";
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

type SP = { q?: string; stage?: string; segment?: string; city?: string; min?: string; web?: string; wa?: string; rated?: string; sort?: string; view?: string; page?: string; ok?: string; err?: string };

const SORTS: Record<string, string> = { score: "Oportunidade", reviews: "Mais avaliações", rating: "Melhor nota", recent: "Mais recentes" };

function photoUrl(name: string, w = 640) {
  return `/api/places/photo?n=${encodeURIComponent(name)}&w=${w}`;
}

function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (!rating || !count) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold tabular-nums">
      <Star size={13} className="fill-[#f5b301] text-[#f5b301]" aria-hidden />
      {rating.toFixed(1).replace(".", ",")}
      <span className="muted font-normal">({count.toLocaleString("pt-BR")})</span>
    </span>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const per = 50;
  const where: SQL[] = [eq(leads.orgId, s.orgId)];
  if (sp.stage === "discarded") where.push(inArray(leads.stage, ["lost", "do_not_contact"]));
  else if (sp.stage && (LEAD_STAGES as readonly string[]).includes(sp.stage)) where.push(eq(leads.stage, sp.stage as LeadStage));
  // Discarded leads (lost / do-not-contact) stay out of the working list unless asked for.
  else where.push(notInArray(leads.stage, ["lost", "do_not_contact"]));
  if (sp.segment) where.push(eq(businesses.segment, sp.segment));
  if (sp.city) where.push(ilike(businesses.city, `%${sp.city}%`));
  if (sp.min) where.push(gte(leads.score, Number(sp.min)));
  if (sp.web === "nosite") where.push(sql`${businesses.websiteStatus} in ('none_in_source','social_only','confirmed_absent')`);
  if (sp.wa) where.push(sql`length(${businesses.phoneE164}) = 13 and substring(${businesses.phoneE164}, 5, 1) = '9' and not exists (select 1 from contact_points cp where cp.business_id = ${businesses.id} and cp.channel = 'whatsapp' and cp.wa_exists = false)`);
  if (sp.rated) where.push(sql`${businesses.rating} >= 4.5 and ${businesses.ratingCount} >= 30`);
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : "score";
  const order =
    sort === "reviews" ? [sql`${businesses.ratingCount} desc nulls last`, desc(leads.score)]
    : sort === "rating" ? [sql`${businesses.rating} desc nulls last`, sql`${businesses.ratingCount} desc nulls last`]
    : sort === "recent" ? [desc(leads.createdAt)]
    : [desc(leads.score), desc(leads.updatedAt)];
  const view = sp.view === "table" ? "table" : "cards";
  if (sp.q) where.push(or(ilike(businesses.name, `%${sp.q}%`), ilike(businesses.phoneE164, `%${sp.q.replace(/\D/g, "") || "~"}%`), ilike(businesses.neighborhood, `%${sp.q}%`))!);

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        lead: leads,
        b: businesses,
        siteId: sql<string | null>`(select id from websites w where w.lead_id = ${leads.id} order by created_at desc limit 1)`,
        waExists: sql<boolean | null>`(select wa_exists from contact_points cp where cp.business_id = ${businesses.id} and cp.channel = 'whatsapp' limit 1)`,
      })
      .from(leads)
      .innerJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(...where))
      .orderBy(...order)
      .limit(per)
      .offset((page - 1) * per),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(and(...where)) as unknown as Promise<[{ n: number }]>,
  ]);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ok: undefined, err: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${p}`;
  };
  const back = qs({});
  const filtered = !!(sp.q || sp.stage || sp.segment || sp.city || sp.web || sp.min || sp.wa || sp.rated);
  const chip = (on: boolean, patch: Partial<SP>, label: string) => (
    <Link
      href={qs({ ...patch, page: undefined })}
      className={`inline-flex items-center rounded-full px-3 py-1 text-[0.8125rem] font-medium ring-1 ring-inset transition-colors ${on ? "bg-[var(--ink)] text-[var(--surface)] ring-[var(--ink)]" : "bg-[var(--surface)] text-[var(--ink)] ring-[var(--line)] hover:ring-[var(--line-strong)]"}`}
      aria-pressed={on}
    >
      {label}
    </Link>
  );

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
          <option value="">Em andamento</option>
          {LEAD_STAGES.filter((st) => st !== "lost" && st !== "do_not_contact").map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
          <option value="discarded">Descartados</option>
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
        {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        {sp.wa && <input type="hidden" name="wa" value={sp.wa} />}
        {sp.rated && <input type="hidden" name="rated" value={sp.rated} />}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(sp.web === "nosite", { web: sp.web === "nosite" ? undefined : "nosite" }, "Sem site")}
        {chip(!!sp.wa, { wa: sp.wa ? undefined : "1" }, "Com WhatsApp")}
        {chip(!!sp.rated, { rated: sp.rated ? undefined : "1" }, "Bem avaliadas (4,5+)")}
        <div className="ml-auto flex items-center gap-2">
          <span className="muted text-[0.8125rem]">Ordenar:</span>
          <nav className="flex flex-wrap gap-1" aria-label="Ordenar">
            {Object.entries(SORTS).map(([k, label]) => (
              <Link key={k} href={qs({ sort: k === "score" ? undefined : k, page: undefined })} className={`rounded-md px-2 py-1 text-[0.8125rem] ${sort === k ? "bg-[var(--surface-2)] font-semibold text-[var(--ink)]" : "muted hover:text-[var(--ink)]"}`}>{label}</Link>
            ))}
          </nav>
          <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden />
          <Link href={qs({ view: undefined })} aria-label="Ver em cards" aria-pressed={view === "cards"} className={`rounded-md p-1.5 ${view === "cards" ? "bg-[var(--surface-2)] text-[var(--ink)]" : "muted"}`}><LayoutGrid size={16} /></Link>
          <Link href={qs({ view: "table" })} aria-label="Ver em tabela" aria-pressed={view === "table"} className={`rounded-md p-1.5 ${view === "table" ? "bg-[var(--surface-2)] text-[var(--ink)]" : "muted"}`}><Rows3 size={16} /></Link>
        </div>
      </div>

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
              {view === "cards" && (
                <label className="mr-2 inline-flex items-center gap-2 text-[0.8125rem] font-medium"><SelectAll /> Selecionar todos</label>
              )}
              <span className="muted mr-1 text-[0.8125rem]">Com os selecionados:</span>
              {sp.stage === "discarded" ? (
                <Submit name="op" value="restore" className="btn btn-secondary btn-sm" pendingText="Restaurando…"><RotateCcw size={14} /> Voltar para a lista</Submit>
              ) : (
                <>
                  <Submit name="op" value="preview" className="btn btn-secondary btn-sm" pendingText="Gerando…"><Sparkles size={14} /> Gerar sites</Submit>
                  <Submit name="op" value="outreach" className="btn btn-primary btn-sm" confirm="Enviar o primeiro contato no WhatsApp para os selecionados que podem receber?">
                    <Send size={14} /> Enviar 1º contato
                  </Submit>
                  <Submit name="op" value="discard" className="btn btn-quiet btn-sm ml-auto" pendingText="Descartando…" confirm="Descartar os selecionados? Eles saem da lista e não voltam em novas buscas.">
                    <Trash2 size={14} /> Descartar
                  </Submit>
                </>
              )}
            </div>
            {view === "cards" ? (
              <ul className="grid gap-4 bg-[var(--surface-2)] p-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map(({ lead, b, siteId, waExists }) => {
                  const w = WEB_LABEL[b.websiteStatus]!;
                  const photo = b.photos?.[0];
                  const mobile = !!b.phoneE164 && isBrMobile(b.phoneE164);
                  const place = [b.neighborhood, b.city].filter(Boolean).join(", ");
                  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.address ?? place].filter(Boolean).join(" "))}`;
                  return (
                    <li key={lead.id} className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,.25)] has-[:checked]:ring-2 has-[:checked]:ring-[var(--ink)]">
                      <div className="relative aspect-[16/9] overflow-hidden bg-[var(--surface-2)]">
                        {photo ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrl(photo.name)} alt={`Foto de ${b.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                            {photo.author && <span className="absolute right-2 bottom-1.5 max-w-[70%] truncate rounded bg-black/45 px-1.5 py-0.5 text-[0.625rem] text-white/90">Foto: {photo.author} · Google</span>}
                          </>
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,var(--surface-2),var(--line))]">
                            <span className="text-4xl font-semibold text-[var(--muted)] opacity-60">{b.name.slice(0, 1).toUpperCase()}</span>
                          </div>
                        )}
                        <label className="absolute top-2 left-2 grid h-8 w-8 cursor-pointer place-items-center rounded-md bg-white/95 shadow-sm">
                          <input type="checkbox" name="ids" value={lead.id} aria-label={`Selecionar ${b.name}`} />
                        </label>
                        <span className="absolute top-2 right-2 rounded-md bg-white/95 px-2 py-1 shadow-sm"><ScorePill score={lead.score} /></span>
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/leads/${lead.id}`} className="line-clamp-2 font-semibold leading-snug hover:underline">{b.name}</Link>
                          <Stars rating={b.rating} count={b.ratingCount} />
                        </div>
                        <div className="text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">{b.category ?? segmentById(b.segment).label}</div>
                        {(b.address || place) && (
                          <div className="muted flex gap-1.5 text-[0.8125rem] leading-snug"><MapPin size={14} className="mt-0.5 shrink-0" aria-hidden /><span className="line-clamp-2">{b.address ?? place}</span></div>
                        )}
                        <div className="text-[0.8125rem] tabular-nums">
                          {b.phoneE164 ? (mobile ? formatBrPhone(b.phoneE164) : <span className="muted">{formatBrPhone(b.phoneE164)} (fixo)</span>) : <span className="subtle">Sem telefone</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone={w[1]}>{b.websiteStatus === "has_website" ? "Já tem site" : b.websiteStatus === "social_only" ? "Só redes sociais" : "Sem site"}</Badge>
                          {mobile && waExists !== false && <Badge tone={waExists ? "green" : "neutral"}><MessageCircle size={11} className="mr-1 inline" />{waExists ? "WhatsApp verificado" : "WhatsApp provável"}</Badge>}
                          {b.instagram && <Badge tone="neutral"><AtSign size={11} className="mr-0.5 inline" />{b.instagram}</Badge>}
                          {lead.stage !== "discovered" && lead.stage !== "qualified" && <StageBadge stage={lead.stage} />}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5 text-[0.8125rem]">
                        <span className="muted truncate">{nextStep({ stage: lead.stage, websiteStatus: b.websiteStatus, hasPhone: !!b.phoneE164, hasSite: !!siteId, active: b.active })}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          <a href={maps} target="_blank" rel="noreferrer" className="muted inline-flex items-center gap-0.5 hover:text-[var(--ink)]">Maps <ArrowUpRight size={13} /></a>
                          <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">Abrir</Link>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
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
            )}
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
