import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, businessSources, contactPoints, leadEvents, websites, conversations, messages, suppressionList, LEAD_STAGES, TEMPLATES } from "@/server/db";
import { Badge, Card, Field, Notice, PageHeader, ScorePill, StageBadge, STAGE_LABEL, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { SEGMENTS } from "@/server/discovery/segments";
import { outreachEligibility } from "@/server/scoring";
import { getOrgSettings } from "@/server/org";
import { previewUrl } from "@/server/whatsapp/service";
import { formatBrPhone } from "@/lib/phone";
import { addNote, generatePreview, sendOutreach, setContactPermission, setLeadStageAction, updateBusiness } from "../../_actions/leads";
import { followUpNow } from "../../_actions/sites";
import { ExternalLink, MessageCircle, Sparkles, Send } from "lucide-react";

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

  return (
    <>
      <PageHeader
        title={b.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StageBadge stage={lead.stage} /> <ScorePill score={lead.score} />
            <span>{[b.neighborhood, b.city, b.state].filter(Boolean).join(" · ")}</span>
          </span>
        }
        actions={
          <form action={setLeadStageAction} className="flex gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="stage" className="field !w-auto" defaultValue={lead.stage} aria-label="Etapa">
              {LEAD_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
            </select>
            <Submit className="btn btn-ghost">Mover</Submit>
          </form>
        }
      />
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Card title="Por que este lead?">
            <div className="mb-3 text-sm"><span className="font-semibold">Próxima ação:</span> {lead.nextAction}</div>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {lead.scoreFactors.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--panel-2)] px-3 py-1.5">
                  <span className={f.kind === "missing" ? "muted" : ""}>{f.kind === "missing" ? `Falta: ${f.label}` : f.label}</span>
                  {f.kind !== "missing" && <span className={`text-xs font-bold tabular-nums ${f.points < 0 ? "text-red-600" : "text-emerald-600"}`}>{f.points > 0 ? "+" : ""}{f.points}</span>}
                </li>
              ))}
            </ul>
            <div className="muted mt-3 text-xs">
              Fontes: {sources.map((src) => `${src.source} (${src.license}${src.restrictions ? ` — ${src.restrictions}` : ""})`).join("; ") || "—"}
            </div>
          </Card>

          <Card title="Dados da empresa" action={<a className="muted text-xs font-semibold hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`${b.name} ${b.city ?? ""} site`)}`}>Verificar se tem site ↗</a>}>
            <form action={updateBusiness} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <Field label="Nome"><input className="field" name="name" defaultValue={b.name} required /></Field>
              <Field label="Segmento">
                <select className="field" name="segment" defaultValue={b.segment}>{SEGMENTS.map((sg) => <option key={sg.id} value={sg.id}>{sg.label}</option>)}</select>
              </Field>
              <Field label="WhatsApp / telefone"><input className="field" name="phone" defaultValue={b.phoneE164 ? formatBrPhone(b.phoneE164) : b.phone ?? ""} /></Field>
              <Field label="Presença digital">
                <select className="field" name="websiteStatus" defaultValue={b.websiteStatus}>
                  <option value="confirmed_absent">Confirmado: não tem site</option>
                  <option value="none_in_source">Fonte não indica site (não verificado)</option>
                  <option value="social_only">Só redes sociais</option>
                  <option value="has_website">Já tem site</option>
                  <option value="unknown">Desconhecido</option>
                </select>
              </Field>
              <Field label="Site atual (se houver)"><input className="field" name="website" defaultValue={b.website ?? ""} /></Field>
              <Field label="Instagram"><input className="field" name="instagram" defaultValue={b.instagram ?? ""} placeholder="@perfil" /></Field>
              <Field label="Endereço"><input className="field" name="address" defaultValue={b.address ?? ""} /></Field>
              <Field label="Bairro"><input className="field" name="neighborhood" defaultValue={b.neighborhood ?? ""} /></Field>
              <Field label="Cidade"><input className="field" name="city" defaultValue={b.city ?? ""} /></Field>
              <Field label="UF"><input className="field" name="state" maxLength={2} defaultValue={b.state ?? ""} /></Field>
              <Field label="CNPJ"><input className="field" name="cnpj" defaultValue={b.cnpj ?? ""} /></Field>
              <Field label="E-mail"><input className="field" name="email" type="email" defaultValue={b.email ?? ""} /></Field>
              <div className="sm:col-span-2"><Field label="Horário de funcionamento"><input className="field" name="openingHours" defaultValue={b.openingHours ?? ""} placeholder="Seg a Sáb, 9h às 19h" /></Field></div>
              <div className="sm:col-span-2"><Field label="Serviços confirmados (um por linha)" hint="Só serviços confirmados aparecem no site sem aviso de revisão."><textarea className="field min-h-20" name="services" defaultValue={b.services.join("\n")} /></Field></div>
              <div className="sm:col-span-2"><Field label="Descrição confirmada"><textarea className="field min-h-16" name="description" defaultValue={b.description ?? ""} /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={b.active} className="accent-[#39D79B]" /> Empresa ativa</label>
              <div className="sm:text-right"><Submit>Salvar dados</Submit></div>
            </form>
          </Card>

          <Card title="Histórico">
            <form action={addNote} className="mb-4 flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input className="field" name="note" placeholder="Adicionar anotação…" />
              <Submit className="btn btn-ghost">Anotar</Submit>
            </form>
            <ol className="relative space-y-3 border-l border-[var(--line)] pl-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--panel)] bg-brand-500" />
                  <div className={e.type === "note" ? "rounded-lg bg-[var(--panel-2)] px-3 py-2" : ""}>{e.message}</div>
                  <div className="muted text-xs">{new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Recife" })} · {e.type}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card tour="lead-demo" title={<span className="inline-flex items-center gap-2"><Sparkles size={15} /> Demonstração</span>}>
            {site ? (
              <>
                <div className="mb-3 overflow-hidden rounded-lg border border-[var(--line)]">
                  <iframe src={`/s/${site.slug}?k=${site.previewToken}&embed=1`} className="h-64 w-full origin-top-left" title="Prévia" loading="lazy" />
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={site.status === "published" ? "green" : "neutral"}>{site.status}</Badge>
                  <span className="muted">v{site.version} · {site.views} visualizações · {site.content.generatedBy === "llm" ? "texto por IA" : "texto por regras"}</span>
                </div>
                {site.content.pendingReview.length > 0 && (
                  <Notice tone="warn">Pendente de confirmação com o cliente: {site.content.pendingReview.join("; ")}</Notice>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={previewUrl(site)} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={14} /> Abrir</a>
                  <Link href={`/studio/${site.id}`} className="btn btn-dark">Editar no Studio</Link>
                </div>
              </>
            ) : (
              <p className="muted mb-3 text-sm">Gere uma landing page personalizada com os dados verificados desta empresa.</p>
            )}
            <form action={generatePreview} className="mt-3 flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="template" className="field" defaultValue={site?.template ?? ""} aria-label="Template">
                <option value="">Template automático</option>
                {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
              </select>
              <Submit className="btn btn-primary" pendingText="Gerando…">{site ? "Regenerar" : "Gerar"}</Submit>
            </form>
          </Card>

          <Card title={<span className="inline-flex items-center gap-2"><MessageCircle size={15} /> Contato</span>}>
            {wa ? (
              <div className="mb-3 flex items-center justify-between gap-2 text-sm">
                <div>
                  <div className="font-semibold tabular-nums">{formatBrPhone(wa.value)}</div>
                  <div className="muted text-xs">
                    WhatsApp: {wa.waExists === true ? "confirmado" : wa.waExists === false ? "não existe" : "não verificado"} · permissão: {wa.permission}
                    {wa.consentSource ? ` (${wa.consentSource})` : ""}
                  </div>
                </div>
                <form action={setContactPermission} className="flex gap-1">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="contactId" value={wa.id} />
                  <select name="permission" className="field !w-auto !py-1 text-xs" defaultValue={wa.permission === "unknown" ? "public_business" : wa.permission} aria-label="Permissão">
                    <option value="public_business">Comercial público</option>
                    <option value="opt_in">Opt-in</option>
                    <option value="opted_out">Não contatar</option>
                  </select>
                  <Submit className="btn btn-ghost !px-2 !py-1 text-xs">OK</Submit>
                </form>
              </div>
            ) : (
              <p className="muted mb-3 text-sm">Sem WhatsApp cadastrado. Edite os dados da empresa para adicionar.</p>
            )}
            {elig.eligible ? (
              <form action={sendOutreach}>
                <input type="hidden" name="leadId" value={lead.id} />
                <Submit className="btn btn-primary w-full" pendingText="Enfileirando…"><Send size={14} /> Enviar primeiro contato</Submit>
                <p className="muted mt-2 text-xs">Enviado pelo número conectado, em horário comercial, respeitando limites e aquecimento do número.</p>
              </form>
            ) : (
              <Notice tone="info">Primeiro contato indisponível: {elig.reasons.join("; ")}.</Notice>
            )}
            {lead.stage === "contacted" && (
              <form action={followUpNow} className="mt-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <Submit className="btn btn-ghost w-full">Enviar follow-up agora</Submit>
              </form>
            )}
            {convs.map((c) => (
              <Link key={c.id} href={`/inbox?c=${c.id}`} className="btn btn-dark mt-3 w-full">Abrir conversa ({c.state.replace("_", " ").toLowerCase()})</Link>
            ))}
          </Card>

        </div>
      </div>
    </>
  );
}
