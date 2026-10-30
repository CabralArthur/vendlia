import { notFound } from "next/navigation";
import { loadProposalByToken, markProposalViewed, siteUrls } from "@/server/commerce";
import { previewUrl } from "@/server/whatsapp/service";
import { AsaasClient } from "@/server/payments/asaas";
import { formatBRL } from "@/lib/text";
import { Logo, Notice } from "@/components/ui";
import { Submit } from "@/components/submit";
import { checkoutAction, approveAction } from "../actions";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta", robots: { index: false, follow: false } };

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const data = await loadProposalByToken(token);
  if (!data) notFound();
  await markProposalViewed(token);
  const { proposal: p, product, business: b, site } = data;
  const expired = p.status === "expired" || (p.expiresAt < new Date() && !["accepted", "paid"].includes(p.status));
  const paid = p.status === "paid";
  const pendingPay = data.payments.find((x) => x.kind === "setup" && x.status === "pending" && x.invoiceUrl);
  const gateway = AsaasClient.configured();

  return (
    <main className="min-h-screen bg-paper text-brand-800">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo className="h-7 w-auto" />
          <span className="text-xs text-black/50">Proposta válida até {p.expiresAt.toLocaleDateString("pt-BR")}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Site profissional para {b.name}</h1>
        <p className="mt-2 text-black/60">Seu site pronto para receber clientes pelo WhatsApp, com hospedagem e manutenção inclusas.</p>
        {sp.err && <div className="mt-6"><Notice tone="error">{sp.err}</Notice></div>}
        {sp.ok && <div className="mt-6"><Notice tone="ok">{sp.ok}</Notice></div>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
            {site && (
              <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                <div className="flex items-center gap-1.5 border-b border-black/10 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-black/15" /><span className="h-2.5 w-2.5 rounded-full bg-black/15" /><span className="h-2.5 w-2.5 rounded-full bg-black/15" />
                  <a href={previewUrl(site)} target="_blank" rel="noreferrer" className="ml-3 truncate text-xs text-black/50 underline">Abrir demonstração em tela cheia ↗</a>
                </div>
                <iframe src={`/s/${site.slug}?k=${site.previewToken}&embed=1`} className="h-[480px] w-full" title="Demonstração do site" />
              </div>
            )}
            {site && site.content.pendingReview.length > 0 && !p.clientApprovedContentAt && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-5 text-sm">
                <div className="font-semibold">Antes de publicar, confirme com a gente:</div>
                <ul className="mt-2 list-disc pl-5 text-black/70">{site.content.pendingReview.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="mt-2 text-black/60">Responda no WhatsApp com os ajustes — corrigimos antes de colocar no ar.</p>
              </div>
            )}
          </div>

          <aside className="h-fit rounded-2xl bg-brand-900 p-6 text-paper shadow-lg">
            <div className="text-sm font-semibold text-brand-500">{product.name}</div>
            <div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-bold">{formatBRL(p.setupPriceCents)}</span><span className="text-paper/60">implantação</span></div>
            <div className="text-paper/80">+ {formatBRL(p.monthlyPriceCents)}/mês <span className="text-paper/50">(1ª mensalidade em 30 dias)</span></div>
            <ul className="mt-5 space-y-2 text-sm">
              {product.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-500" />{f}</li>)}
            </ul>
            {p.notes && <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-paper/80">{p.notes}</p>}

            <div className="mt-6 border-t border-white/10 pt-6">
              {paid ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-brand-500"><CheckCircle2 size={18} /> Pagamento confirmado</div>
                  {site?.status === "published" ? (
                    <p>Seu site está no ar: <a className="font-semibold underline" href={siteUrls(site)[0]} target="_blank" rel="noreferrer">{siteUrls(site)[0]}</a></p>
                  ) : p.clientApprovedContentAt ? (
                    <p className="text-paper/75">Conteúdo aprovado. Estamos publicando seu site.</p>
                  ) : (
                    <form action={approveAction}>
                      <input type="hidden" name="token" value={token} />
                      <p className="mb-3 text-paper/75">Confira a demonstração e aprove o conteúdo para publicarmos.</p>
                      <Submit className="btn btn-primary w-full">Aprovar conteúdo e publicar</Submit>
                    </form>
                  )}
                </div>
              ) : expired || p.status === "canceled" ? (
                <p className="text-sm text-paper/75">Esta proposta não está mais disponível. Fale com o atendente para receber uma nova.</p>
              ) : pendingPay ? (
                <div className="space-y-3">
                  <a href={pendingPay.invoiceUrl!} className="btn btn-primary w-full">Pagar agora (Pix, boleto ou cartão)</a>
                  <p className="text-xs text-paper/55">A confirmação é automática após o pagamento.</p>
                </div>
              ) : gateway ? (
                <form action={checkoutAction} className="space-y-3">
                  <input type="hidden" name="token" value={token} />
                  <input className="field !bg-white !text-brand-800" name="name" placeholder="Nome completo ou razão social" required autoComplete="name" />
                  <input className="field !bg-white !text-brand-800" name="document" placeholder="CPF ou CNPJ" required inputMode="numeric" />
                  <input className="field !bg-white !text-brand-800" name="email" type="email" placeholder="E-mail para a nota e cobranças" required autoComplete="email" />
                  <input className="field !bg-white !text-brand-800" name="phone" placeholder="WhatsApp (opcional)" autoComplete="tel" />
                  <label className="flex gap-2 text-xs text-paper/80"><input type="checkbox" name="approve" className="mt-0.5 accent-[#39D79B]" /> Aprovo o conteúdo da demonstração para publicação (ajustes podem ser pedidos depois).</label>
                  <label className="flex gap-2 text-xs text-paper/80"><input type="checkbox" name="accept" required className="mt-0.5 accent-[#39D79B]" /> Aceito a proposta: implantação única e mensalidade recorrente, cancelável a qualquer momento.</label>
                  <Submit className="btn btn-primary w-full" pendingText="Gerando pagamento…">Contratar e pagar</Submit>
                  <p className="text-center text-[11px] text-paper/45">Pagamento processado com segurança pelo Asaas.</p>
                </form>
              ) : (
                <p className="text-sm text-paper/75">Para contratar, responda à conversa no WhatsApp — enviaremos a chave Pix.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
