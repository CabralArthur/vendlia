import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, websites, websiteVersions, leads, businesses, TEMPLATES } from "@/server/db";
import { Badge, Card, Field, Notice, PageHeader, timeAgo, SITE_STATUS_LABEL } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { THEMES } from "@/sites/themes";
import { previewUrl } from "@/server/whatsapp/service";
import { siteUrls } from "@/server/sites/publish";
import { env } from "@/server/env";
import { aiSiteAction, requestLogoAction, saveLogoAction, publishAction, rollbackAction, saveSiteAction, setDomainAction, unpublishAction, useTemplateAction } from "../../_actions/sites";
import { getSiteGen } from "@/server/sites/progress";
import { llmConfigured } from "@/server/ai/llm";
import { SiteGenStatus } from "@/components/site-gen-status";
import { fontHrefs } from "@/sites/font-pairings";
import { ExternalLink, Sparkles, PenTool } from "lucide-react";

export const metadata = { title: "Editar site" };

function Collapsible({ collapsed, label, children }: { collapsed: boolean; label: string; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group">
      <summary className="muted cursor-pointer list-none text-[0.8125rem] font-medium hover:text-[var(--ink)]">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {label}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export default async function StudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const [w] = await db.select().from(websites).where(and(eq(websites.id, id), eq(websites.orgId, s.orgId)));
  if (!w) notFound();
  const [[lb], versions] = await Promise.all([
    db.select({ lead: leads, b: businesses }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(eq(leads.id, w.leadId)),
    db.select().from(websiteVersions).where(eq(websiteVersions.websiteId, w.id)).orderBy(desc(websiteVersions.version)).limit(20),
  ]);
  const c = w.content;
  const pairs = <T,>(arr: T[], f: (x: T) => string) => arr.map(f).join("\n");
  const e = env();
  const [gen, aiOn] = [await getSiteGen(w.leadId), llmConfigured()];
  const unpublishedChanges = w.status === "published" && w.publishedVersion !== w.version;

  return (
    <>
      <PageHeader
        title="Editar site"
        back={<Link href={`/leads/${w.leadId}`} className="muted hover:text-[var(--ink)]">{lb?.b.name ?? "Lead"}</Link>}
        subtitle={<span className="inline-flex items-center gap-2">Versão {w.version} <Badge tone={(SITE_STATUS_LABEL[w.status] ?? ["", "neutral"])[1]}>{(SITE_STATUS_LABEL[w.status] ?? [w.status])[0]}</Badge></span>}
        actions={<a href={previewUrl(w)} target="_blank" rel="noreferrer" className="btn btn-secondary"><ExternalLink size={15} /> Ver como o cliente</a>}
      />
      <Flash sp={sp} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-6">
        <SiteGenStatus leadId={w.leadId} initial={gen} />
        {(c.ai || aiOn) && (
          <Card
            title={<span className="inline-flex items-center gap-2"><Sparkles size={16} /> {c.ai ? "Design criado pela IA" : "Criar com IA"}</span>}
            description={c.ai ? `${c.ai.businessType}${c.ai.concept ? `. ${c.ai.concept}` : ""}` : "A IA cria um design sob medida para este negócio, com tipografia, cores e textos próprios."}
          >
            {c.ai && (
              <p className="muted mb-4 text-[0.8125rem]">
                Fontes: {c.ai.fonts.map((f) => f.family).join(" + ") || "padrão"} · Modelo: {c.ai.model} · Custo: US$ {(c.ai.costMicros / 1_000_000).toFixed(2)}
              </p>
            )}
            <form action={aiSiteAction} className="space-y-4">
              <input type="hidden" name="siteId" value={w.id} />
              {c.ai && (
                <Field label="Pedir um ajuste" hint="Ex.: deixe mais escuro e sofisticado; troque a fonte do título por uma mais clássica; destaque o delivery.">
                  <textarea className="field min-h-20" name="instructions" placeholder="Descreva o que mudar…" />
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Foto de capa" optional hint="Foto do próprio negócio, com autorização."><input className="field" name="coverImage" type="url" placeholder="https://…" defaultValue={c.coverImage ?? ""} /></Field>
                <Field label="Mais fotos" optional hint="Uma por linha (https)."><textarea className="field min-h-10" name="gallery" defaultValue={(c.gallery ?? []).join("\n")} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.ai && <Submit className="btn btn-primary" name="op" value="adjust" pendingText="Enviando…">Aplicar ajuste</Submit>}
                <Submit className={c.ai ? "btn btn-secondary" : "btn btn-primary"} name="op" value="fresh" pendingText="Enviando…" confirm={c.ai ? "Criar um design totalmente novo? O atual fica no histórico." : undefined}>
                  <Sparkles size={15} /> {c.ai ? "Criar outro design" : "Criar com IA"}
                </Submit>
              </div>
            </form>
            {c.ai && (
              <form action={useTemplateAction} className="mt-3 border-t border-[var(--line)] pt-3">
                <input type="hidden" name="siteId" value={w.id} />
                <Submit className="btn btn-quiet btn-sm" pendingText="Trocando…" confirm="Trocar para o modelo pronto? O design da IA fica no histórico de versões.">Usar o modelo pronto em vez do design da IA</Submit>
              </form>
            )}
          </Card>
        )}
        {(aiOn || c.logo) && (
          <Card title={<span className="inline-flex items-center gap-2"><PenTool size={16} /> Logo</span>} description={c.logo ? "Escolha uma proposta e decida se ela aparece no site no lugar do nome." : "Opcional. A IA desenha 3 propostas de logo em vetor, com as fontes do site."}>
            {c.logo && fontHrefs(c.logo.fonts).map((href) => <link key={href} rel="stylesheet" href={href} />)}
            {c.logo ? (
              <form action={saveLogoAction} className="space-y-4">
                <input type="hidden" name="siteId" value={w.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {c.logo.options.map((o, i) => (
                    <label key={i} className="group cursor-pointer rounded-[var(--radius)] border border-[var(--line)] p-2 has-[:checked]:border-[var(--ink)] has-[:checked]:ring-1 has-[:checked]:ring-[var(--ink)]">
                      <div className="grid h-24 place-items-center rounded-[calc(var(--radius)-4px)] bg-white px-3 text-[#111]">
                        <span className="block w-full [&_svg]:mx-auto [&_svg]:h-14 [&_svg]:w-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: o.svg }} />
                      </div>
                      <div className="mt-1 grid h-16 place-items-center rounded-[calc(var(--radius)-4px)] bg-[#141414] px-3 text-white">
                        <span className="block w-full [&_svg]:mx-auto [&_svg]:h-10 [&_svg]:w-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: o.svg }} />
                      </div>
                      <span className="mt-2 flex items-center gap-2 px-1 text-[0.8125rem]">
                        <input type="radio" name="selected" value={i} defaultChecked={c.logo!.selected === i} /> {o.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="use" defaultChecked={c.logo.use} /> Usar no site, no lugar do nome</label>
                  <Submit className="btn btn-primary btn-sm" pendingText="Salvando…">Salvar escolha</Submit>
                </div>
              </form>
            ) : null}
            {aiOn && (
              <form action={requestLogoAction} className={c.logo ? "mt-3 border-t border-[var(--line)] pt-3" : ""}>
                <input type="hidden" name="siteId" value={w.id} />
                <Submit className={c.logo ? "btn btn-quiet btn-sm" : "btn btn-secondary"} pendingText="Enviando…" confirm={c.logo ? "Gerar 3 propostas novas? As atuais ficam no histórico de versões." : undefined}>
                  <PenTool size={14} /> {c.logo ? "Gerar outras propostas" : "Gerar logo com IA"}
                </Submit>
              </form>
            )}
          </Card>
        )}
        <Collapsible collapsed={!!c.ai} label="Editar campo a campo no modelo pronto (substitui o design da IA)">
        <form action={saveSiteAction} className="space-y-6">
          <input type="hidden" name="siteId" value={w.id} />
          <Card title="Aparência">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Modelo">
                <select className="field" name="template" defaultValue={w.template}>{TEMPLATES.map((t) => <option key={t} value={t}>{THEMES[t].label}</option>)}</select>
              </Field>
              <Field label="Cor de destaque"><input className="field" type="color" name="accent" defaultValue={w.accent} /></Field>
            </div>
          </Card>
          <Card title="Conteúdo">
            <div className="grid gap-3">
              <Field label="Nome da empresa no site"><input className="field" name="businessName" defaultValue={c.businessName} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Texto acima do título"><input className="field" name="tagline" defaultValue={c.tagline} /></Field>
                <Field label="Texto do botão"><input className="field" name="ctaLabel" defaultValue={c.ctaLabel} /></Field>
              </div>
              <Field label="Título principal"><input className="field" name="heroTitle" defaultValue={c.heroTitle} /></Field>
              <Field label="Subtítulo"><textarea className="field min-h-16" name="heroSubtitle" defaultValue={c.heroSubtitle} /></Field>
              <Field label="Foto de capa" optional hint="Link https de uma foto do próprio negócio (com autorização do dono). Com foto, o topo do site vira uma imagem em tela cheia."><input className="field" name="coverImage" type="url" placeholder="https://…" defaultValue={c.coverImage ?? ""} /></Field>
              <Field label="Mais fotos" optional hint="Uma por linha (links https). Aparecem numa galeria depois dos serviços."><textarea className="field min-h-16" name="gallery" defaultValue={(c.gallery ?? []).join("\n")} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Título da seção de serviços" optional><input className="field" name="servicesTitle" defaultValue={c.sections?.servicesTitle ?? ""} /></Field>
                <Field label="Título dos destaques" optional><input className="field" name="highlightsTitle" defaultValue={c.sections?.highlightsTitle ?? ""} /></Field>
              </div>
              <Field label="Chamada final" optional hint="Título e texto do bloco colorido antes do contato."><input className="field" name="ctaTitle" defaultValue={c.sections?.ctaTitle ?? ""} /></Field>
              <Field label="Texto da chamada final" optional><input className="field" name="ctaText" defaultValue={c.sections?.ctaText ?? ""} /></Field>
              <Field label="Sobre a empresa"><textarea className="field min-h-24" name="about" defaultValue={c.about} /></Field>
              <Field label="Serviços" hint="Um por linha. Para descrever, use uma barra: Corte | Inclui lavagem"><textarea className="field min-h-24 " name="services" defaultValue={pairs(c.services, (x) => `${x.name}${x.description ? ` | ${x.description}` : ""}`)} /></Field>
              <Field label="Destaques" hint="Um por linha, no formato: Título | descrição"><textarea className="field min-h-20 " name="highlights" defaultValue={pairs(c.highlights, (x) => `${x.title} | ${x.description}`)} /></Field>
              <Field label="Perguntas frequentes" hint="Uma por linha, no formato: Pergunta | resposta"><textarea className="field min-h-20 " name="faq" defaultValue={pairs(c.faq, (x) => `${x.question} | ${x.answer}`)} /></Field>
            </div>
          </Card>
          <Card title="Contato e Google">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp" hint="Com 55 e DDD, só números"><input className="field" name="whatsapp" defaultValue={c.contact.whatsapp ?? ""} placeholder="5581999999999" /></Field>
              <Field label="Instagram"><input className="field" name="instagram" defaultValue={c.contact.instagram ?? ""} /></Field>
              <Field label="Endereço"><input className="field" name="address" defaultValue={c.contact.address ?? ""} /></Field>
              <Field label="Horário"><input className="field" name="openingHours" defaultValue={c.contact.openingHours ?? ""} /></Field>
              <Field label="E-mail"><input className="field" name="email" defaultValue={c.contact.email ?? ""} /></Field>
              <Field label="Título no Google"><input className="field" name="seoTitle" defaultValue={c.seo.title} maxLength={70} /></Field>
              <div className="sm:col-span-2"><Field label="Descrição no Google"><textarea className="field min-h-14" name="seoDescription" defaultValue={c.seo.description} maxLength={160} /></Field></div>
              <div className="sm:col-span-2"><Field label="A confirmar com o cliente" hint="Um item por linha. Apague cada um quando o cliente confirmar."><textarea className="field min-h-14 text-xs" name="pendingReview" defaultValue={c.pendingReview.join("\n")} /></Field></div>
            </div>
          </Card>
          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur"><span className="muted text-[0.8125rem]">Cada salvamento vira uma nova versão. O site no ar só muda quando você publicar.</span><Submit className="btn btn-primary" pendingText="Salvando…">Salvar versão</Submit></div>
        </form>
        </Collapsible>
        </div>

        <div className="space-y-6">

          <Card tour="studio-publish" title="Publicação">
            {w.status === "published" ? (
              <div className="space-y-2 text-sm">
                <Notice tone="ok">No ar desde {w.publishedAt?.toLocaleString("pt-BR", { timeZone: "America/Recife" })} (v{w.publishedVersion}).</Notice>
                <ul className="space-y-1">{siteUrls(w).map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="break-all underline">{u}</a></li>)}</ul>
              </div>
            ) : (
              <p className="muted text-sm">Publique quando o cliente fechar e aprovar o conteúdo. O site sai sem a faixa de “demonstração”, aparece no Google e o lead vira “Fechado”.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {(w.status !== "published" || unpublishedChanges) && (
                <form action={publishAction}>
                  <input type="hidden" name="siteId" value={w.id} />
                  <Submit className="btn btn-primary" confirm={unpublishedChanges ? "Colocar as alterações no ar?" : "O cliente aprovou o conteúdo? O site vai ao ar agora."}>{unpublishedChanges ? "Publicar alterações" : "Publicar"}</Submit>
                </form>
              )}
              {w.status === "published" && (
                <form action={unpublishAction}>
                  <input type="hidden" name="siteId" value={w.id} />
                  <Submit className="btn btn-danger" confirm="Tirar o site do ar?">Despublicar</Submit>
                </form>
              )}
            </div>
          </Card>

          <Card title="Prévia" description="Mostra a última versão salva." flush>
            <iframe key={w.version} src={`/s/${w.slug}?k=${w.previewToken}&embed=1`} className="h-[560px] w-full rounded-b-[var(--radius-lg)] bg-white" title="Prévia do site" />
          </Card>

          <Card title="Domínio próprio">
            <form action={setDomainAction} className="flex gap-2">
              <input type="hidden" name="siteId" value={w.id} />
              <input className="field" name="domain" defaultValue={w.customDomain ?? ""} placeholder="www.barbeariadoze.com.br" />
              <Submit className="btn btn-secondary">Salvar</Submit>
            </form>
            <div className="muted mt-3 space-y-1 text-xs">
              <p>1. No Railway, serviço <b>web</b> → Settings → Networking → <b>Custom Domain</b> → adicione o domínio.</p>
              <p>2. No DNS do cliente, crie o registro CNAME indicado pelo Railway (o HTTPS é emitido automaticamente).</p>
              {e.SITES_BASE_DOMAIN && <p>Endereço gratuito já disponível: <b>{w.slug}.{e.SITES_BASE_DOMAIN}</b></p>}
            </div>
          </Card>

          <Card title="Versões">
            <ul className="divide-y divide-[var(--line)] text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                  <span>v{v.version} <span className="muted text-xs">· {v.note} · {timeAgo(v.createdAt)}</span>{v.version === w.publishedVersion && <span className="ml-1"><Badge tone="green">no ar</Badge></span>}</span>
                  {v.version !== w.version && (
                    <form action={rollbackAction}>
                      <input type="hidden" name="siteId" value={w.id} />
                      <input type="hidden" name="version" value={v.version} />
                      <Submit className="btn btn-quiet btn-sm">Restaurar</Submit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
