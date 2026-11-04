import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, businessSources, contactPoints, leadEvents, websites, conversations, messages, suppressionList, LEAD_STAGES, TEMPLATES } from "@/server/db";
import { Badge, Card, Check, Field, Notice, PageHeader, StageBadge, STAGE_LABEL, CONVERSATION_LABEL, PERMISSION_LABEL, SITE_STATUS_LABEL } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS, segmentById } from "@/server/discovery/segments";
import { outreachEligibility } from "@/server/scoring";
import { getOrgSettings } from "@/server/org";
import { previewUrl } from "@/server/whatsapp/service";
import { formatBrPhone } from "@/lib/phone";
import { addNote, discardLead, generatePreview, sendOutreach, setContactPermission, setLeadStageAction, updateBusiness } from "../../_actions/leads";
import { followUpNow } from "../../_actions/sites";
import { nextStep } from "@/lib/labels";
import { getSiteGen } from "@/server/sites/progress";
import { llmConfigured } from "@/server/ai/llm";
import { SiteGenStatus } from "@/components/site-gen-status";
import { ExternalLink, Send, PenLine, RefreshCw, Trash2, Star } from "lucide-react";

const TEMPLATE_LABEL: Record<string, string> = { barber: "Barbearia / Salão", aesthetics: "Estética / Clínica", food: "Restaurante / Café", auto: "Oficina", services: "Serviços" };

export default async function LeadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const [row] = await db.select({ lead: leads, b: businesses }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(and(eq(leads.id, id), eq(leads.orgId, s.orgId)));
  if (!row) notFound();
  const { lead, b } = row;

  const [sources, contacts, events, [site], convs, settings] = await Promise.all([
    db.select().from(businessSources).where(eq(businessSources.businessId, b.id)),
    db.select().from(contactPoints).where(eq(contactPoints.businessId, b.id)),
    db.select().from(leadEvents).where(eq(leadEvents.leadId, lead.id)).orderBy(desc(leadEvents.createdAt)).limit(60),
    db.select().from(websites).where(eq(websites.leadId, lead.id)).orderBy(desc(websites.createdAt)).limit(1),
    db.select().from(conversations).where(eq(conversations.leadId, lead.id)),
    getOrgSettings(s.orgId),
  ]);
  const wa = contacts.find((c) => c.channel === "whatsapp");
  const suppressed = b.phoneE164 ? (await db.select({ id: suppressionList.id }).from(suppressionList).where(and(eq(suppressionList.orgId, s.orgId), eq(suppressionList.value, b.phoneE164)))).length > 0 : false;
  const [prior] = convs.length
    ? await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(inArray(messages.conversationId, convs.map((c) => c.id)), inArray(messages.kind, ["outreach", "followup"]), sql`${messages.status} not in ('failed','canceled')`))
    : [{ n: 0 }];
  const elig = outreachEligibility({
    phoneE164: b.phoneE164,
    permission: wa?.permission ?? "unknown",
    waExists: wa?.waExists,
    suppressed,
    alreadyContacted: (prior?.n ?? 0) > 0,
    stage: lead.stage,
    allowColdOutreach: settings.allowColdOutreach,
    hasPreview: !!site,
  });

  const place = [b.neighborhood, b.city && b.state ? `${b.city}/${b.state}` : b.city].filter(Boolean).join(", ");
  const SOURCE: Record<string, string> = { osm: "OpenStreetMap", google_places: "Google Maps", csv: "planilha", manual: "cadastro manual", brasilapi: "Receita Federal" };
  const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Recife", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const positives = lead.scoreFactors.filter((f) => f.kind !== "missing");
  const missing = lead.scoreFactors.filter((f) => f.kind === "missing");
  const siteStatus = site ? SITE_STATUS_LABEL[site.status] ?? [site.status, "neutral"] : null;
  const [gen, ai] = [await getSiteGen(lead.id), llmConfigured()];

  return (
    <>
      <PageHeader
        back={<Link href="/leads" className="muted hover:text-[var(--ink)]">Leads</Link>}
        title={b.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StageBadge stage={lead.stage} />
            <span>{segmentById(b.segment).label}{place ? ` em ${place}` : ""}</span>
            {b.rating && b.ratingCount ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink)]">
                <Star size={13} className="fill-[#f5b301] text-[#f5b301]" aria-hidden />
                {b.rating.toFixed(1).replace(".", ",")} <span className="muted font-normal">({b.ratingCount.toLocaleString("pt-BR")} avaliações no Google)</span>
              </span>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {!["lost", "do_not_contact"].includes(lead.stage) && (
            <form action={discardLead}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Submit className="btn btn-quiet" confirm="Descartar este lead? Ele sai da lista e não volta em novas buscas."><Trash2 size={15} /> Descartar</Submit>
            </form>
          )}
          <form action={setLeadStageAction} className="flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="stage" className="field w-48" defaultValue={lead.stage} aria-label="Etapa do lead">
              {LEAD_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
            </select>
            <Submit className="btn btn-secondary">Alterar etapa</Submit>
          </form>
          </div>
        }
      />
      <Flash sp={sp} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {b.photos.length > 0 && (
            <div className={`grid gap-2 overflow-hidden rounded-[var(--radius-lg)] ${b.photos.length >= 5 ? "grid-cols-4" : b.photos.length >= 3 ? "grid-cols-3" : "grid-cols-1"}`}>
              {b.photos.slice(0, b.photos.length >= 5 ? 5 : b.photos.length >= 3 ? 3 : 1).map((ph, i) => (
                <figure key={ph.name} className={`relative m-0 overflow-hidden bg-[var(--surface-2)] ${b.photos.length < 3 ? "aspect-[21/9]" : i === 0 ? "col-span-2 row-span-2" : "aspect-[4/3]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/places/photo?n=${encodeURIComponent(ph.name)}&w=${i === 0 ? 900 : 480}`} alt={`Foto de ${b.name}`} loading="lazy" className="h-full w-full object-cover" />
                  {ph.author && <figcaption className="absolute right-1.5 bottom-1 max-w-[90%] truncate rounded bg-black/45 px-1.5 text-[0.625rem] text-white/90">{ph.author} · Google</figcaption>}
                </figure>
              ))}
            </div>
          )}
          <Card
            tour="lead-demo"
            title="Site de demonstração"
            description={site ? `Versão ${site.version}, aberto ${site.views} ${site.views === 1 ? "vez" : "vezes"} pelo cliente` : "Gerado só com os dados confirmados desta empresa."}
            action={siteStatus && <Badge tone={siteStatus[1]}>{siteStatus[0]}</Badge>}
          >
            <SiteGenStatus leadId={lead.id} initial={gen} />
            {site ? (
              <>
                {site.content.ai && (
                  <p className="muted mb-3 text-[0.8125rem]">Criado pela IA como <b className="text-[var(--ink)]">{site.content.ai.businessType}</b>{site.content.ai.concept ? `: ${site.content.ai.concept}` : "."}</p>
                )}
                <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]">
                  <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-2" aria-hidden>
                    <span className="h-2 w-2 rounded-full bg-[var(--line-strong)]" /><span className="h-2 w-2 rounded-full bg-[var(--line-strong)]" /><span className="h-2 w-2 rounded-full bg-[var(--line-strong)]" />
                  </div>
                  <iframe src={`/s/${site.slug}?k=${site.previewToken}&embed=1`} className="h-[340px] w-full bg-white" title={`Prévia do site de ${b.name}`} loading="lazy" />
                </div>
                {site.content.pendingReview.length > 0 && (
                  <div className="mt-4">
                    <Notice tone="warn" title="Confirmar com o cliente antes de publicar">
                      {site.content.pendingReview.join("; ")}.
                    </Notice>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href={`/studio/${site.id}`} className="btn btn-primary"><PenLine size={15} /> Editar e publicar</Link>
                  <a href={previewUrl(site)} target="_blank" rel="noreferrer" className="btn btn-secondary"><ExternalLink size={15} /> Ver como o cliente</a>
                  <form action={generatePreview} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select name="template" className="field field-sm w-52" defaultValue={site.content.ai || ai ? "ai" : site.template} aria-label="Como gerar">
                      {ai && <option value="ai">Criar com IA</option>}
                      {TEMPLATES.map((t) => <option key={t} value={t}>Modelo pronto: {TEMPLATE_LABEL[t]}</option>)}
                    </select>
                    <Submit className="btn btn-quiet btn-sm" pendingText="Enviando…" confirm="Gerar o site de novo? As versões anteriores ficam salvas no histórico."><RefreshCw size={14} /> Gerar de novo</Submit>
                  </form>
                </div>
              </>
            ) : (
              <form action={generatePreview} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <Field label="Como gerar" className="w-64">
                  <select name="template" className="field" defaultValue={ai ? "ai" : ""}>
                    {ai ? <option value="ai">Criar com IA (design sob medida)</option> : <option value="">Modelo pelo tipo de negócio</option>}
                    {TEMPLATES.map((t) => <option key={t} value={t}>Modelo pronto: {TEMPLATE_LABEL[t]}</option>)}
                  </select>
                </Field>
                <Submit className="btn btn-primary" pendingText="Enviando…">Gerar site</Submit>
              </form>
            )}
          </Card>

          <Card title="Contato" description="Primeiro contato pelo WhatsApp com o link do site.">
            {wa ? (
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] bg-[var(--surface-2)] px-4 py-3">
                <div>
                  <div className="font-semibold tabular-nums">{formatBrPhone(wa.value)}</div>
                  <div className="muted text-[0.8125rem]">
                    {wa.waExists === true ? "Tem WhatsApp" : wa.waExists === false ? "Sem WhatsApp neste número" : "WhatsApp ainda não verificado"}
                    {" · "}
                    {PERMISSION_LABEL[wa.permission] ?? wa.permission}
                  </div>
                </div>
                <form action={setContactPermission} className="flex items-center gap-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="contactId" value={wa.id} />
                  <select name="permission" className="field field-sm w-52" defaultValue={wa.permission === "unknown" ? "public_business" : wa.permission} aria-label="Permissão de contato">
                    <option value="public_business">Telefone comercial público</option>
                    <option value="opt_in">Autorizou contato</option>
                    <option value="opted_out">Não contatar</option>
                  </select>
                  <Submit className="btn btn-secondary btn-sm">Salvar</Submit>
                </form>
              </div>
            ) : (
              <p className="muted mb-4 text-sm">Sem WhatsApp cadastrado. Adicione em “Dados da empresa”, logo abaixo.</p>
            )}
            {elig.eligible ? (
              <form action={sendOutreach} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <Submit className="btn btn-primary" pendingText="Enviando…"><Send size={15} /> Enviar primeiro contato</Submit>
                <span className="muted text-[0.8125rem]">Sai em horário comercial, respeitando o limite diário do número.</span>
              </form>
            ) : (
              <div>
                <div className="text-sm font-medium">Primeiro contato indisponível:</div>
                <ul className="muted mt-1 list-disc space-y-0.5 pl-5 text-[0.8125rem]">
                  {elig.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            {(lead.stage === "contacted" || convs.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                {convs.map((c) => (
                  <Link key={c.id} href={`/inbox?c=${c.id}`} className="btn btn-secondary">Abrir conversa ({CONVERSATION_LABEL[c.state]?.toLowerCase()})</Link>
                ))}
                {lead.stage === "contacted" && (
                  <form action={followUpNow}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <Submit className="btn btn-quiet">Enviar lembrete agora</Submit>
                  </form>
                )}
              </div>
            )}
          </Card>

          <Card
            title="Dados da empresa"
            description="O site usa estes dados. Corrija o que estiver errado antes de gerar."
            action={<a className="btn btn-quiet btn-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`${b.name} ${b.city ?? ""}`)}`}><ExternalLink size={14} /> Pesquisar no Google</a>}
          >
            <form action={updateBusiness} className="space-y-5">
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" required><input className="field" name="name" defaultValue={b.name} required /></Field>
                <Field label="Tipo de negócio">
                  <select className="field" name="segment" defaultValue={b.segment}>{SEGMENTS.map((sg) => <option key={sg.id} value={sg.id}>{sg.label}</option>)}</select>
                </Field>
                <Field label="WhatsApp ou telefone"><input className="field" name="phone" type="tel" inputMode="tel" defaultValue={b.phoneE164 ? formatBrPhone(b.phoneE164) : b.phone ?? ""} /></Field>
                <Field label="Instagram" optional><input className="field" name="instagram" defaultValue={b.instagram ?? ""} placeholder="@perfil" /></Field>
                <Field label="Já tem site?">
                  <select className="field" name="websiteStatus" defaultValue={b.websiteStatus}>
                    <option value="confirmed_absent">Não tem (confirmado)</option>
                    <option value="none_in_source">Provavelmente não (não verificado)</option>
                    <option value="social_only">Só Instagram ou redes sociais</option>
                    <option value="has_website">Já tem site</option>
                    <option value="unknown">Não sei</option>
                  </select>
                </Field>
                <Field label="Endereço do site atual" optional><input className="field" name="website" defaultValue={b.website ?? ""} placeholder="www.…" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[2fr_1.2fr_1.2fr_80px]">
                <Field label="Endereço"><input className="field" name="address" defaultValue={b.address ?? ""} /></Field>
                <Field label="Bairro"><input className="field" name="neighborhood" defaultValue={b.neighborhood ?? ""} /></Field>
                <Field label="Cidade"><input className="field" name="city" defaultValue={b.city ?? ""} /></Field>
                <Field label="UF"><input className="field uppercase" name="state" maxLength={2} defaultValue={b.state ?? ""} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Horário de funcionamento" className="sm:col-span-1"><input className="field" name="openingHours" defaultValue={b.openingHours ?? ""} placeholder="Seg a sáb, 9h às 19h" /></Field>
                <Field label="CNPJ" optional><input className="field" name="cnpj" inputMode="numeric" defaultValue={b.cnpj ?? ""} /></Field>
                <Field label="E-mail" optional><input className="field" name="email" type="email" defaultValue={b.email ?? ""} /></Field>
              </div>
              <Field label="Serviços confirmados" hint="Um por linha. Só o que o cliente confirmou; o resto aparece no site como pendente de revisão.">
                <textarea className="field" name="services" rows={3} defaultValue={b.services.join("\n")} />
              </Field>
              <Field label="Apresentação do negócio" optional>
                <textarea className="field" name="description" rows={2} defaultValue={b.description ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <Check name="active" label="Empresa em funcionamento" defaultChecked={b.active} />
                <Submit className="btn btn-primary" pendingText="Salvando…">Salvar dados</Submit>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Nota de oportunidade">
            <div className="flex items-baseline gap-2">
              <span className="text-[2.25rem] font-bold leading-none tracking-[-0.03em] tabular-nums">{lead.score}</span>
              <span className="muted text-sm">de 100</span>
            </div>
            <p className="mt-2 text-sm"><span className="font-semibold">Próximo passo:</span> {nextStep({ stage: lead.stage, websiteStatus: b.websiteStatus, hasPhone: !!b.phoneE164, hasSite: !!site, active: b.active })}</p>
            <ul className="mt-4 space-y-1.5 text-[0.8125rem]">
              {positives.map((f) => (
                <li key={f.label} className="flex items-start justify-between gap-3">
                  <span>{f.label}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${f.points < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>{f.points > 0 ? "+" : ""}{f.points}</span>
                </li>
              ))}
            </ul>
            {missing.length > 0 && (
              <p className="muted mt-3 border-t border-[var(--line)] pt-3 text-[0.8125rem]">Falta: {missing.map((m) => m.label.toLowerCase()).join(", ")}.</p>
            )}
            <p className="subtle mt-3 text-[0.75rem]">Origem: {[...new Set(sources.map((src) => SOURCE[src.source] ?? src.source))].join(", ") || "—"}</p>
          </Card>

          <Card title="Histórico">
            <form action={addNote} className="mb-5 flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input className="field field-sm" name="note" placeholder="Escrever uma anotação" aria-label="Anotação" />
              <Submit className="btn btn-secondary btn-sm">Salvar</Submit>
            </form>
            <ol className="space-y-4">
              {events.map((e) => (
                <li key={e.id} className="relative pl-5 text-[0.8125rem] before:absolute before:top-[7px] before:left-0 before:h-2 before:w-2 before:rounded-full before:bg-[var(--line-strong)] after:absolute after:top-[19px] after:bottom-[-14px] after:left-[3.5px] after:w-px after:bg-[var(--line)] last:after:hidden">
                  <div className={e.type === "note" ? "rounded-[var(--radius-sm)] bg-[var(--warn-bg)] px-2.5 py-1.5" : ""}>{e.message}</div>
                  <div className="subtle mt-0.5 text-[0.75rem]">{fmt(e.createdAt)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
