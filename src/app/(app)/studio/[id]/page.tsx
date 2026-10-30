import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, websites, websiteVersions, leads, businesses, proposals, TEMPLATES } from "@/server/db";
import { Badge, Card, Field, Notice, PageHeader, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { THEMES } from "@/sites/themes";
import { previewUrl } from "@/server/whatsapp/service";
import { siteUrls } from "@/server/commerce";
import { env } from "@/server/env";
import { publishAction, rollbackAction, saveSiteAction, setDomainAction, unpublishAction } from "../../_actions/commerce";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Website Studio" };

export default async function StudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const [w] = await db.select().from(websites).where(and(eq(websites.id, id), eq(websites.orgId, s.orgId)));
  if (!w) notFound();
  const [[lb], versions, [paid]] = await Promise.all([
    db.select({ lead: leads, b: businesses }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(eq(leads.id, w.leadId)),
    db.select().from(websiteVersions).where(eq(websiteVersions.websiteId, w.id)).orderBy(desc(websiteVersions.version)).limit(20),
    db.select().from(proposals).where(and(eq(proposals.websiteId, w.id), eq(proposals.status, "paid"))).limit(1),
  ]);
  const c = w.content;
  const pairs = <T,>(arr: T[], f: (x: T) => string) => arr.map(f).join("\n");
  const e = env();
  const unpublishedChanges = w.status === "published" && w.publishedVersion !== w.version;

  return (
    <>
      <PageHeader
        title="Website Studio"
        subtitle={<><Link href={`/leads/${w.leadId}`} className="underline">{lb?.b.name}</Link> · v{w.version} · <Badge tone={w.status === "published" ? "green" : "neutral"}>{w.status}</Badge></>}
        actions={<a href={previewUrl(w)} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={14} /> Abrir prévia</a>}
      />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
        <form action={saveSiteAction} className="space-y-6">
          <input type="hidden" name="siteId" value={w.id} />
          <Card title="Aparência">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Template">
                <select className="field" name="template" defaultValue={w.template}>{TEMPLATES.map((t) => <option key={t} value={t}>{THEMES[t].label}</option>)}</select>
              </Field>
              <Field label="Cor de destaque"><input className="field h-[38px] !p-1" type="color" name="accent" defaultValue={w.accent} /></Field>
            </div>
          </Card>
          <Card title="Conteúdo">
            <div className="grid gap-3">
              <Field label="Nome exibido"><input className="field" name="businessName" defaultValue={c.businessName} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rótulo (eyebrow)"><input className="field" name="tagline" defaultValue={c.tagline} /></Field>
                <Field label="Texto do botão"><input className="field" name="ctaLabel" defaultValue={c.ctaLabel} /></Field>
              </div>
              <Field label="Título principal"><input className="field" name="heroTitle" defaultValue={c.heroTitle} /></Field>
              <Field label="Subtítulo"><textarea className="field min-h-16" name="heroSubtitle" defaultValue={c.heroSubtitle} /></Field>
              <Field label="Sobre"><textarea className="field min-h-24" name="about" defaultValue={c.about} /></Field>
              <Field label="Serviços" hint="Um por linha. Formato: Nome | descrição (opcional)"><textarea className="field min-h-24 font-mono text-xs" name="services" defaultValue={pairs(c.services, (x) => `${x.name}${x.description ? ` | ${x.description}` : ""}`)} /></Field>
              <Field label="Destaques" hint="Título | descrição"><textarea className="field min-h-20 font-mono text-xs" name="highlights" defaultValue={pairs(c.highlights, (x) => `${x.title} | ${x.description}`)} /></Field>
              <Field label="Perguntas frequentes" hint="Pergunta | resposta"><textarea className="field min-h-20 font-mono text-xs" name="faq" defaultValue={pairs(c.faq, (x) => `${x.question} | ${x.answer}`)} /></Field>
            </div>
          </Card>
          <Card title="Contato e SEO">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp (com DDI)"><input className="field" name="whatsapp" defaultValue={c.contact.whatsapp ?? ""} placeholder="5581999999999" /></Field>
              <Field label="Instagram"><input className="field" name="instagram" defaultValue={c.contact.instagram ?? ""} /></Field>
              <Field label="Endereço"><input className="field" name="address" defaultValue={c.contact.address ?? ""} /></Field>
              <Field label="Horário"><input className="field" name="openingHours" defaultValue={c.contact.openingHours ?? ""} /></Field>
              <Field label="E-mail"><input className="field" name="email" defaultValue={c.contact.email ?? ""} /></Field>
              <Field label="Título SEO"><input className="field" name="seoTitle" defaultValue={c.seo.title} maxLength={70} /></Field>
              <div className="sm:col-span-2"><Field label="Descrição SEO"><textarea className="field min-h-14" name="seoDescription" defaultValue={c.seo.description} maxLength={160} /></Field></div>
              <div className="sm:col-span-2"><Field label="Pendências de revisão" hint="Itens não confirmados com o cliente (um por linha). Apague quando confirmar."><textarea className="field min-h-14 text-xs" name="pendingReview" defaultValue={c.pendingReview.join("\n")} /></Field></div>
            </div>
          </Card>
          <div className="sticky bottom-4 z-10 flex justify-end"><Submit className="btn btn-dark shadow-lg" pendingText="Salvando…">Salvar nova versão</Submit></div>
        </form>

        <div className="space-y-6">
          <Card title="Prévia" className="[&>div]:p-0">
            <iframe key={w.version} src={`/s/${w.slug}?k=${w.previewToken}&embed=1`} className="h-[640px] w-full rounded-b-[14px]" title="Prévia do site" />
          </Card>

          <Card title="Publicação">
            {w.status === "published" ? (
              <div className="space-y-2 text-sm">
                <Notice tone="ok">No ar desde {w.publishedAt?.toLocaleString("pt-BR", { timeZone: "America/Recife" })} (v{w.publishedVersion}).</Notice>
                <ul className="space-y-1">{siteUrls(w).map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="break-all underline">{u}</a></li>)}</ul>
              </div>
            ) : (
              <p className="muted text-sm">A publicação exige pagamento confirmado e aprovação do conteúdo pelo cliente (feita na página da proposta). {paid ? "Pagamento confirmado ✓" : "Pagamento ainda não confirmado."}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {(w.status !== "published" || unpublishedChanges) && (
                <form action={publishAction}>
                  <input type="hidden" name="siteId" value={w.id} />
                  <Submit className="btn btn-primary">{unpublishedChanges ? "Publicar alterações" : "Publicar"}</Submit>
                </form>
              )}
              {w.status === "published" && (
                <form action={unpublishAction}>
                  <input type="hidden" name="siteId" value={w.id} />
                  <Submit className="btn btn-danger" confirm="Tirar o site do ar?">Despublicar</Submit>
                </form>
              )}
            </div>
            {s.role !== "operator" && w.status !== "published" && (
              <details className="mt-4 text-sm">
                <summary className="muted cursor-pointer text-xs">Cliente aprovou e pagou fora do sistema?</summary>
                <form action={publishAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="siteId" value={w.id} />
                  <input className="field" name="overrideReason" placeholder="Ex.: aprovado por WhatsApp em 30/10, Pix recebido" required minLength={10} />
                  <Submit className="btn btn-ghost" confirm="Publicar registrando aprovação externa (fica no log de auditoria)?">Publicar</Submit>
                </form>
              </details>
            )}
          </Card>

          <Card title="Domínio próprio">
            <form action={setDomainAction} className="flex gap-2">
              <input type="hidden" name="siteId" value={w.id} />
              <input className="field" name="domain" defaultValue={w.customDomain ?? ""} placeholder="www.barbeariadoze.com.br" />
              <Submit className="btn btn-ghost">Salvar</Submit>
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
                      <Submit className="btn btn-ghost !py-1 text-xs">Restaurar</Submit>
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
