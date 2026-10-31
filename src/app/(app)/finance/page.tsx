import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, payments, subscriptions, customers, products, proposals, leads, businesses, usageRecords } from "@/server/db";
import { Badge, Card, Field, PageHeader, Stat, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { formatBRL } from "@/lib/text";
import { saveProductAction } from "../_actions/commerce";

export const metadata = { title: "Financeiro" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(3, 0, 0, 0);
  const [[mrr], [month], [total], [overdue], [churned], pays, subs, prods, [ai], [won]] = await Promise.all([
    db.select({ v: sql<number>`coalesce(sum(${subscriptions.amountCents}),0)::int`, n: sql<number>`count(*)::int` }).from(subscriptions).where(and(eq(subscriptions.orgId, s.orgId), inArray(subscriptions.status, ["active", "overdue"]))),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).where(and(eq(payments.orgId, s.orgId), eq(payments.status, "confirmed"), gte(payments.paidAt, monthStart))),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` }).from(payments).where(and(eq(payments.orgId, s.orgId), eq(payments.status, "confirmed"))),
    db.select({ v: sql<number>`coalesce(sum(${payments.amountCents}),0)::int`, n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.orgId, s.orgId), eq(payments.status, "overdue"))),
    db.select({ n: sql<number>`count(*)::int` }).from(subscriptions).where(and(eq(subscriptions.orgId, s.orgId), eq(subscriptions.status, "canceled"))),
    db
      .select({ p: payments, name: businesses.name, leadId: leads.id })
      .from(payments)
      .innerJoin(proposals, eq(proposals.id, payments.proposalId))
      .innerJoin(leads, eq(leads.id, proposals.leadId))
      .innerJoin(businesses, eq(businesses.id, leads.businessId))
      .where(eq(payments.orgId, s.orgId))
      .orderBy(desc(payments.createdAt))
      .limit(50),
    db.select({ sub: subscriptions, customer: customers.name }).from(subscriptions).innerJoin(customers, eq(customers.id, subscriptions.customerId)).where(eq(subscriptions.orgId, s.orgId)).orderBy(desc(subscriptions.createdAt)).limit(50),
    db.select().from(products).where(eq(products.orgId, s.orgId)).orderBy(asc(products.setupPriceCents)),
    db.select({ v: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::int` }).from(usageRecords).where(and(eq(usageRecords.orgId, s.orgId), gte(usageRecords.createdAt, monthStart))),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(eq(leads.orgId, s.orgId), eq(leads.stage, "won"))),
  ]);
  const totalSubs = (mrr?.n ?? 0) + (churned?.n ?? 0);
  return (
    <>
      <PageHeader title="Financeiro" subtitle="Receita, recorrência e cobranças. Valores confirmados pelo gateway." />
      <Flash sp={sp} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="MRR" value={formatBRL(mrr?.v ?? 0)} hint={`${mrr?.n ?? 0} assinaturas ativas`} tone="accent" />
        <Stat label="Recebido no mês" value={formatBRL(month?.v ?? 0)} />
        <Stat label="Recebido total" value={formatBRL(total?.v ?? 0)} />
        <Stat label="Em atraso" value={formatBRL(overdue?.v ?? 0)} hint={`${overdue?.n ?? 0} cobranças`} />
        <Stat label="Churn" value={totalSubs ? `${Math.round(((churned?.n ?? 0) / totalSubs) * 100)}%` : "—"} hint={`${churned?.n ?? 0} canceladas`} />
        <Stat label="Vendas fechadas" value={won?.n ?? 0} hint={`IA no mês: US$ ${((ai?.v ?? 0) / 1e6).toFixed(2)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Cobranças" className="[&>div]:p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Venc.</th><th /></tr></thead>
              <tbody>
                {pays.length === 0 && <tr><td colSpan={6} className="muted py-8 text-center">Nenhuma cobrança ainda.</td></tr>}
                {pays.map(({ p, name, leadId }) => (
                  <tr key={p.id}>
                    <td><Link href={`/leads/${leadId}`} className="font-medium hover:underline">{name}</Link></td>
                    <td className="text-xs">{p.kind === "setup" ? "Implantação" : "Mensalidade"}</td>
                    <td className="tabular-nums">{formatBRL(p.amountCents)}</td>
                    <td><Badge tone={p.status === "confirmed" ? "green" : p.status === "overdue" ? "red" : p.status === "pending" ? "amber" : "neutral"}>{p.status}</Badge></td>
                    <td className="muted text-xs">{p.dueDate ?? "—"}</td>
                    <td>{p.invoiceUrl && <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs underline">fatura</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Assinaturas" className="[&>div]:p-0">
          <table className="table">
            <thead><tr><th>Cliente</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {subs.length === 0 && <tr><td colSpan={3} className="muted py-8 text-center">Nenhuma assinatura.</td></tr>}
              {subs.map(({ sub, customer }) => (
                <tr key={sub.id}><td>{customer}<div className="muted text-xs">desde {timeAgo(sub.createdAt)}</div></td><td className="tabular-nums">{formatBRL(sub.amountCents)}</td><td><Badge tone={sub.status === "active" ? "green" : sub.status === "overdue" ? "red" : "neutral"}>{sub.status}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-bold">Planos</h2>
      <div className="grid gap-4 md:grid-cols-3" data-tour="plans">
        {[...prods, null].map((p) => (
          <Card key={p?.id ?? "new"} title={p ? p.name : "Novo plano"}>
            <form action={saveProductAction} className="space-y-3">
              <input type="hidden" name="productId" value={p?.id ?? ""} />
              <Field label="Nome"><input className="field" name="name" defaultValue={p?.name ?? ""} required /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Implantação (R$)"><input className="field" name="setup" defaultValue={p ? (p.setupPriceCents / 100).toFixed(2).replace(".", ",") : ""} required /></Field>
                <Field label="Mensal (R$)"><input className="field" name="monthly" defaultValue={p ? (p.monthlyPriceCents / 100).toFixed(2).replace(".", ",") : ""} required /></Field>
              </div>
              <Field label="Descrição"><input className="field" name="description" defaultValue={p?.description ?? ""} /></Field>
              <Field label="Itens inclusos (um por linha)"><textarea className="field min-h-24 text-xs" name="features" defaultValue={p?.features.join("\n") ?? ""} /></Field>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="accent-[#39D79B]" /> Ativo</label>
                <Submit className="btn btn-ghost">Salvar</Submit>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
