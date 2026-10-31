import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, websites, conversations, businesses, messages, whatsappInstances, usageRecords, LEAD_STAGES } from "@/server/db";
import { Card, PageHeader, Stat, STAGE_LABEL, timeAgo, Badge } from "@/components/ui";
import { Flash } from "@/components/flash";
import { getSetupProgress } from "@/server/onboarding";
import { isDemoInstance } from "@/lib/demo";
import { llmConfigured } from "@/server/ai/llm";
import { CheckCircle2, Circle, ArrowRight, Flame } from "lucide-react";

export const metadata = { title: "Visão geral" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(3, 0, 0, 0);
  const dayStart = new Date(Date.now() - ((Date.now() - 3 * 3600_000) % 86400_000));

  const [stageRows, [previews], hot, [sentToday], instances, [aiSpend]] = await Promise.all([
    db.select({ stage: leads.stage, n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, s.orgId)).groupBy(leads.stage),
    db.select({ n: sql<number>`count(*)::int` }).from(websites).where(eq(websites.orgId, s.orgId)),
    db
      .select({ c: conversations, name: businesses.name, city: businesses.city })
      .from(conversations)
      .leftJoin(leads, eq(leads.id, conversations.leadId))
      .leftJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(eq(conversations.orgId, s.orgId), inArray(conversations.state, ["HUMAN_REQUESTED", "HUMAN_ASSIGNED"])))
      .orderBy(desc(conversations.handoffAt))
      .limit(6),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.orgId, s.orgId), inArray(messages.kind, ["outreach", "followup"]), gte(messages.sentAt, dayStart))),
    db.select().from(whatsappInstances).where(eq(whatsappInstances.orgId, s.orgId)),
    db.select({ v: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::int` }).from(usageRecords).where(and(eq(usageRecords.orgId, s.orgId), gte(usageRecords.createdAt, monthStart))),
  ]);

  const count = (st: string[]) => stageRows.filter((r) => st.includes(r.stage)).reduce((a, r) => a + r.n, 0);
  const total = stageRows.reduce((a, r) => a + r.n, 0);
  const interested = count(["interested", "proposal_sent", "negotiation"]);
  const won = count(["won"]);
  const contacted = count(["contacted", "replied", "interested", "proposal_sent", "negotiation", "won", "lost"]);
  const replied = count(["replied", "interested", "proposal_sent", "negotiation", "won"]);

  const progress = await getSetupProgress(s.orgId);
  const steps = progress.steps;
  const pendingSteps = steps.filter((x) => !x.done && !x.optional).length;
  const realInstances = instances.filter((i) => !isDemoInstance(i.name));

  const funnel = [
    { label: "Leads", v: total },
    { label: "Contatados", v: contacted },
    { label: "Responderam", v: replied },
    { label: "Interessados", v: interested + won },
    { label: "Fechados", v: won },
  ];
  const maxF = Math.max(1, funnel[0]!.v);

  return (
    <>
      <PageHeader
        title={`Olá, ${s.user.name.split(" ")[0]}`}
        subtitle="Quem encontrar, para quem gerar o site e quem está esperando sua resposta."
        actions={
          <>
            <Link href="/discovery" className="btn btn-ghost">Nova prospecção</Link>
            <Link href="/inbox" className="btn btn-dark">Abrir inbox</Link>
          </>
        }
      />
      <Flash sp={sp} />

      {pendingSteps > 0 && (
        <Card className="mb-6" title={`Primeiros passos · ${progress.done}/${progress.required}`} action={<Link href="/onboarding" className="muted text-xs font-semibold hover:underline">Ver passo a passo →</Link>}>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {steps.map((st) => (
              <li key={st.id}>
                <Link href={st.href} className={`flex h-full items-start gap-2 rounded-lg border border-[var(--line)] p-3 text-sm ${st.done ? "opacity-60" : "hover:border-[var(--accent)]"}`}>
                  {st.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-500" /> : <Circle size={18} className="muted mt-0.5 shrink-0" />}
                  <span className={st.done ? "line-through" : "font-medium"}>{st.title}{st.optional ? " (opcional)" : ""}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Leads" value={total.toLocaleString("pt-BR")} />
        <Stat label="Demonstrações" value={previews?.n ?? 0} />
        <Stat label="Interessados" value={interested} tone="accent" />
        <Stat label="Contatados" value={contacted} hint={`${sentToday?.n ?? 0} hoje`} />
        <Stat label="Responderam" value={replied} />
        <Stat label="Fechados" value={won} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card tour="hot" title={<span className="inline-flex items-center gap-2"><Flame size={16} className="text-brand-500" /> Leads aguardando você</span>} action={<Link href="/inbox" className="muted text-xs font-semibold hover:underline">Ver inbox</Link>}>
          {hot.length === 0 ? (
            <p className="muted text-sm">Nenhum lead aguardando atendimento. Quando alguém demonstrar interesse, aparece aqui e você recebe um alerta.</p>
          ) : (
            <ul className="-my-2 divide-y divide-[var(--line)]">
              {hot.map(({ c, name, city }) => (
                <li key={c.id}>
                  <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-900 text-sm font-bold text-brand-500">{(name ?? c.contactName ?? "?").slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{name ?? c.contactName ?? c.phoneE164}{city ? <span className="muted font-normal"> · {city}</span> : null}</div>
                      <div className="muted truncate text-xs">{c.summary}</div>
                    </div>
                    <Badge tone="amber">{c.lastIntent?.replace(/_/g, " ") ?? "novo"}</Badge>
                    <span className="muted w-12 text-right text-xs">{timeAgo(c.handoffAt)}</span>
                    <ArrowRight size={14} className="muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Funil comercial">
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{f.label}</span>
                  <span className="muted tabular-nums">
                    {f.v}
                    {i > 0 && funnel[i - 1]!.v > 0 ? ` · ${Math.round((f.v / funnel[i - 1]!.v) * 100)}%` : ""}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, (f.v / maxF) * 100)}%`, background: i === funnel.length - 1 ? "#39D79B" : "#102F29", opacity: i === funnel.length - 1 ? 1 : 0.85 - i * 0.12 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="muted mt-5 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-4 text-xs">
            <div><div className="text-base font-bold text-[var(--ink)]">{sentToday?.n ?? 0}</div>contatos hoje</div>
            <div><div className="text-base font-bold text-[var(--ink)]">{realInstances.filter((i) => i.status === "open").length}/{realInstances.length}</div>números online</div>
            <div><div className="text-base font-bold text-[var(--ink)]">US$ {((aiSpend?.v ?? 0) / 1e6).toFixed(2)}</div>IA no mês{llmConfigured() ? "" : " (off)"}</div>
          </div>
        </Card>
      </div>

      <Card className="mt-6" title="Leads por etapa">
        <div className="flex flex-wrap gap-2">
          {LEAD_STAGES.map((st) => {
            const n = stageRows.find((r) => r.stage === st)?.n ?? 0;
            return (
              <Link key={st} href={`/leads?stage=${st}`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--accent)]">
                <span className="font-bold tabular-nums">{n}</span> <span className="muted">{STAGE_LABEL[st]}</span>
              </Link>
            );
          })}
        </div>
      </Card>
    </>
  );
}
