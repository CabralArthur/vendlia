import { notFound } from "next/navigation";
import { desc, eq, gte, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, organizations, memberships, users, usageRecords } from "@/server/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { access, isOwnerEmail, trialEnd } from "@/server/billing";
import { PLANS, brl, priceFor, type Cycle, type PlanId } from "@/lib/plans";
import { adminAccountAction } from "../_actions/admin";

export const metadata = { title: "Administração" };

const date = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Recife" }) : "—");

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  if (!isOwnerEmail(s.user.email)) notFound();
  const sp = await searchParams;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [orgs, owners, use] = await Promise.all([
    db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(500),
    db.select({ orgId: memberships.orgId, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.role, "owner")),
    db
      .select({
        orgId: usageRecords.orgId,
        cost: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::bigint`,
        sites: sql<number>`count(*) filter (where ${usageRecords.kind} = 'quota_site')::int`,
        searches: sql<number>`count(*) filter (where ${usageRecords.kind} = 'quota_search')::int`,
      })
      .from(usageRecords)
      .where(gte(usageRecords.createdAt, monthStart))
      .groupBy(usageRecords.orgId),
  ]);
  const ownerOf = new Map(owners.map((o) => [o.orgId, o.email]));
  const useOf = new Map(use.map((u) => [u.orgId, u]));
  const paying = orgs.filter((o) => !o.unlimited && o.plan !== "trial" && (o.billingStatus === "active" || o.billingStatus === "past_due"));
  const mrr = paying.reduce((sum, o) => sum + priceFor(o.plan as PlanId, (o.billingCycle ?? "monthly") as Cycle).perMonth, 0);
  const trials = orgs.filter((o) => !o.unlimited && o.plan === "trial" && access(o).ok).length;
  const aiCost = use.reduce((sum, u) => sum + Number(u.cost), 0) / 1_000_000;

  const stat = (label: string, value: string, hint?: string) => (
    <div className="panel p-5">
      <div className="muted text-[0.8125rem]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="muted mt-0.5 text-[0.75rem]">{hint}</div>}
    </div>
  );

  return (
    <>
      <PageHeader title="Administração" subtitle="Contas da plataforma, assinaturas e custo de IA do mês." />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Receita mensal recorrente", brl(mrr), `${paying.length} ${paying.length === 1 ? "conta pagante" : "contas pagantes"}`)}
        {stat("Testes em andamento", String(trials))}
        {stat("Contas", String(orgs.length))}
        {stat("Custo de IA no mês", `US$ ${aiCost.toFixed(2)}`, "Todas as contas")}
      </div>
      <Card title="Contas" flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="table min-w-[980px]">
            <thead>
              <tr><th>Conta</th><th>Plano</th><th>Situação</th><th>Vence</th><th>Uso no mês</th><th>IA no mês</th><th></th></tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const u = useOf.get(o.id);
                const acc = access(o);
                return (
                  <tr key={o.id}>
                    <td className="max-w-[260px]"><div className="truncate font-semibold">{o.name}</div><div className="muted truncate text-[0.8125rem]">{ownerOf.get(o.id) ?? "—"} · desde {date(o.createdAt)}</div></td>
                    <td>{o.unlimited ? <Badge tone="green">Acesso total</Badge> : <>{PLANS[o.plan as PlanId]?.name}{o.billingCycle && o.plan !== "trial" ? <span className="muted text-[0.8125rem]"> · {o.billingCycle === "monthly" ? "mensal" : o.billingCycle === "quarterly" ? "trimestral" : "anual"}</span> : null}</>}</td>
                    <td>{o.unlimited ? "—" : <Badge tone={acc.ok ? (o.billingStatus === "past_due" ? "amber" : "green") : "red"}>{o.billingStatus === "trialing" ? (acc.ok ? "Em teste" : "Teste acabou") : o.billingStatus === "active" ? "Ativa" : o.billingStatus === "past_due" ? "Em atraso" : o.billingStatus === "pending" ? "Aguardando pagamento" : o.billingStatus === "canceled" ? "Cancelada" : "Expirada"}</Badge>}</td>
                    <td className="tabular-nums">{o.unlimited ? "—" : date(o.plan === "trial" ? trialEnd(o) : o.currentPeriodEnd)}</td>
                    <td className="tabular-nums">{u?.sites ?? 0} sites · {u?.searches ?? 0} buscas</td>
                    <td className="tabular-nums">US$ {((Number(u?.cost ?? 0)) / 1_000_000).toFixed(2)}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {o.plan === "trial" && !o.unlimited && (
                          <form action={adminAccountAction}><input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="op" value="extend" /><Submit className="btn btn-quiet btn-sm">+7 dias</Submit></form>
                        )}
                        <form action={adminAccountAction}><input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="op" value="unlimited" /><Submit className="btn btn-quiet btn-sm" confirm={o.unlimited ? "Tirar o acesso total desta conta?" : "Dar acesso total (sem limites e sem cobrança) a esta conta?"}>{o.unlimited ? "Tirar acesso total" : "Acesso total"}</Submit></form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
