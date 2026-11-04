import Link from "next/link";
import { requireSession } from "@/server/auth";
import { Card, Notice, PageHeader, Badge } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { access, asaasConfigured, quotaStatus, trialEnd } from "@/server/billing";
import { CYCLES, PAID_PLANS, PLANS, SITE_PACK, brl, priceFor, type Cycle } from "@/lib/plans";
import { buyPackAction, cancelAction } from "../_actions/billing";
import { Check } from "lucide-react";

export const metadata = { title: "Plano" };

const STATUS: Record<string, [string, "green" | "amber" | "red" | "neutral" | "blue"]> = {
  trialing: ["Teste grátis", "blue"],
  pending: ["Aguardando pagamento", "amber"],
  active: ["Ativo", "green"],
  past_due: ["Pagamento em atraso", "red"],
  canceled: ["Cancelado", "neutral"],
  expired: ["Teste encerrado", "neutral"],
};

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[0.8125rem]">
        <span className="font-medium">{label}</span>
        <span className="muted tabular-nums">{used} de {limit}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-[var(--danger)]" : pct >= 80 ? "bg-[#f79009]" : "bg-[var(--ink)]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const date = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Recife" }) : "—");

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; ciclo?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = await quotaStatus(s.orgId);
  const o = q.org;
  const cycle = (sp.ciclo && sp.ciclo in CYCLES ? sp.ciclo : "monthly") as Cycle;
  const st = STATUS[o.billingStatus] ?? [o.billingStatus, "neutral"];
  const acc = access(o);
  const paid = o.plan !== "trial" && !o.unlimited;
  const admin = s.role !== "operator";

  return (
    <>
      <PageHeader title="Plano" subtitle="Seu plano, o que já usou este mês e as opções para continuar." />
      <Flash sp={sp} />
      {!asaasConfigured() && !o.unlimited && <div className="mb-6"><Notice tone="warn" title="Pagamento ainda não configurado">O dono da plataforma precisa configurar a ASAAS_API_KEY.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card title="Seu plano" action={o.unlimited ? <Badge tone="green">Acesso total</Badge> : <Badge tone={st[1]}>{st[0]}</Badge>}>
          {o.unlimited ? (
            <p className="muted text-sm">Esta conta é da administração da plataforma: uso sem limites e sem cobrança.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-2xl font-semibold">{q.plan.name}</div>
                <div className="muted text-[0.8125rem]">
                  {o.plan === "trial" ? `Termina em ${date(trialEnd(o))}` : o.billingStatus === "canceled" ? `Acesso até ${date(o.currentPeriodEnd)}` : `Próxima cobrança em ${date(o.currentPeriodEnd)}`}
                  {o.billingCycle && o.plan !== "trial" ? ` · ${CYCLES[o.billingCycle as Cycle].label}` : ""}
                </div>
              </div>
              {!acc.ok && <Notice tone={o.billingStatus === "pending" ? "info" : "error"}>{acc.reason}</Notice>}
              {o.pendingPlan && <Notice tone="info">Aguardando o pagamento do plano {PLANS[o.pendingPlan as keyof typeof PLANS]?.name}. Assim que o Asaas confirmar, ele é ativado.</Notice>}
              <div className="space-y-3">
                <Meter label="Sites com IA" used={q.used.site} limit={q.limit.site + q.extraSites} />
                <Meter label="Buscas" used={q.used.search} limit={q.limit.search} />
                <Meter label="Logos" used={q.used.logo} limit={q.limit.logo} />
              </div>
              <p className="muted text-[0.8125rem]">
                Contagem desde {date(q.used.since)}. {q.extraSites > 0 && `Inclui ${q.extraSites} sites de pacote avulso. `}Sites com o modelo pronto não contam.
              </p>
              {admin && paid && o.billingStatus === "active" && (
                <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                  <form action={buyPackAction}><Submit className="btn btn-secondary btn-sm" pendingText="Abrindo…">Comprar {SITE_PACK.sites} sites extras por {brl(SITE_PACK.price)}</Submit></form>
                  <form action={cancelAction} className="ml-auto"><Submit className="btn btn-quiet btn-sm" confirm="Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.">Cancelar assinatura</Submit></form>
                </div>
              )}
            </div>
          )}
        </Card>
        <Card title="O que todos os planos têm">
          <ul className="space-y-2 text-sm">
            {["Busca de empresas por nicho, cidade e bairro, com nota e fotos do Google", "Site de demonstração criado pela IA para cada empresa", "Envio do primeiro contato no WhatsApp, no horário comercial e com limites seguros", "Leitura das respostas, alerta de lead quente e mensagem de espera", "Publicação do site com domínio próprio quando o cliente fechar", "Cancelamento a qualquer momento, sem multa"].map((t) => (
              <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />{t}</li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="muted text-[0.8125rem]">PIX, boleto ou cartão. Garantia de 7 dias: não gostou, devolvemos.</p>
        </div>
        <nav className="inline-flex rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-1" aria-label="Periodicidade">
          {(Object.keys(CYCLES) as Cycle[]).map((c) => (
            <Link key={c} href={`/planos?ciclo=${c}`} className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-medium ${c === cycle ? "bg-[var(--ink)] text-[var(--surface)]" : "muted hover:text-[var(--ink)]"}`}>
              {CYCLES[c].label}{CYCLES[c].discount ? ` −${CYCLES[c].discount * 100}%` : ""}
            </Link>
          ))}
        </nav>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PAID_PLANS.map((id) => {
          const p = PLANS[id];
          const price = priceFor(id, cycle);
          const current = o.plan === id && o.billingStatus === "active" && o.billingCycle === cycle;
          return (
            <section key={id} className={`panel relative flex flex-col p-6 ${p.highlight ? "ring-2 ring-[var(--ink)]" : ""}`}>
              {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-[var(--ink)] px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--surface)]">Mais escolhido</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="muted text-[0.8125rem]">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums">{brl(price.perMonth)}</span>
                <span className="muted text-sm">/mês</span>
              </div>
              <p className="muted h-5 text-[0.75rem]">{cycle !== "monthly" ? `${brl(price.total)} a cada ${cycle === "yearly" ? "ano" : "trimestre"}` : ""}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />{p.sites} sites com IA por mês</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />{p.searches} buscas por mês</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />{p.logos} logos por mês</li>
                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />{p.numbers} {p.numbers === 1 ? "número" : "números"} de WhatsApp</li>
                {p.customDomain && <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--ok)]" />Domínio próprio nos sites</li>}
              </ul>
              {current ? (
                <span className="btn btn-secondary mt-6 w-full cursor-default">Seu plano atual</span>
              ) : admin ? (
                <Link href={`/planos/assinar?plano=${id}&ciclo=${cycle}`} className={`btn mt-6 w-full ${p.highlight ? "btn-primary" : "btn-secondary"}`}>{o.plan === "trial" || o.unlimited ? "Assinar" : "Mudar para este"}</Link>
              ) : (
                <span className="muted mt-6 text-center text-[0.8125rem]">Peça a um administrador da conta.</span>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
