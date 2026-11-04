import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth";
import { Card, Field, PageHeader } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { CYCLES, PAID_PLANS, PLANS, brl, priceFor, type Cycle, type PlanId } from "@/lib/plans";
import { checkoutAction } from "../../_actions/billing";
import { Lock } from "lucide-react";

export const metadata = { title: "Assinar" };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ plano?: string; ciclo?: string; err?: string }> }) {
  const s = await requireRole("owner", "admin");
  const sp = await searchParams;
  const plan = sp.plano as PlanId;
  const cycle = (sp.ciclo && sp.ciclo in CYCLES ? sp.ciclo : "monthly") as Cycle;
  if (!PAID_PLANS.includes(plan)) notFound();
  const p = PLANS[plan];
  const price = priceFor(plan, cycle);

  return (
    <>
      <PageHeader title={`Assinar o plano ${p.name}`} back={<Link href={`/planos?ciclo=${cycle}`} className="muted hover:text-[var(--ink)]">Planos</Link>} />
      <Flash sp={sp} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Dados para a cobrança" description="Usados só para emitir a cobrança e a nota. Depois você escolhe pagar com PIX, boleto ou cartão.">
          <form action={checkoutAction} className="space-y-4">
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="cycle" value={cycle} />
            <Field label="Nome completo ou razão social" required><input className="field" name="name" defaultValue={s.org.name} required autoComplete="name" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CPF ou CNPJ" required><input className="field" name="cpfCnpj" inputMode="numeric" required placeholder="000.000.000-00" /></Field>
              <Field label="Celular" optional><input className="field" name="phone" type="tel" inputMode="tel" placeholder="(81) 99999-9999" /></Field>
            </div>
            <Field label="E-mail para a cobrança" required><input className="field" name="email" type="email" defaultValue={s.user.email} required autoComplete="email" /></Field>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <span className="muted inline-flex items-center gap-1.5 text-[0.8125rem]"><Lock size={14} /> Pagamento processado pelo Asaas</span>
              <Submit className="btn btn-primary" pendingText="Gerando a cobrança…">Ir para o pagamento</Submit>
            </div>
          </form>
        </Card>
        <Card title="Resumo">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Plano</span><b>{p.name}</b></div>
            <div className="flex justify-between"><span>Periodicidade</span><b>{CYCLES[cycle].label}</b></div>
            <div className="flex justify-between"><span>Por mês</span><b>{brl(price.perMonth)}</b></div>
            <div className="flex justify-between border-t border-[var(--line)] pt-3 text-base"><span>Total agora</span><b>{brl(price.total)}</b></div>
            <p className="muted text-[0.8125rem]">Renova automaticamente {cycle === "monthly" ? "todo mês" : cycle === "quarterly" ? "a cada 3 meses" : "a cada ano"}. Cancele quando quiser. Garantia de 7 dias.</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(Object.keys(CYCLES) as Cycle[]).filter((c) => c !== cycle).map((c) => (
                <Link key={c} href={`/planos/assinar?plano=${plan}&ciclo=${c}`} className="btn btn-quiet btn-sm">Trocar para {CYCLES[c].label.toLowerCase()}{CYCLES[c].discount ? ` (−${CYCLES[c].discount * 100}%)` : ""}</Link>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
