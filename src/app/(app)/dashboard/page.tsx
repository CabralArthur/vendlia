import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, websites, conversations, businesses, messages, LEAD_STAGES } from "@/server/db";
import { Badge, Card, PageHeader, Stat, STAGE_LABEL, INTENT_LABEL, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { getSetupProgress } from "@/server/onboarding";
import { formatBrPhone } from "@/lib/phone";
import { MessagesSquare, Radar } from "lucide-react";

export const metadata = { title: "Visão geral" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const dayStart = new Date(Date.now() - ((Date.now() - 3 * 3600_000) % 86400_000));

  const [stageRows, [sites], waiting, [sentToday], progress] = await Promise.all([
    db.select({ stage: leads.stage, n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.orgId, s.orgId)).groupBy(leads.stage),
    db.select({ n: sql<number>`count(*)::int` }).from(websites).where(eq(websites.orgId, s.orgId)),
    db
      .select({ c: conversations, name: businesses.name, city: businesses.city })
      .from(conversations)
      .leftJoin(leads, eq(leads.id, conversations.leadId))
      .leftJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(eq(conversations.orgId, s.orgId), inArray(conversations.state, ["HUMAN_REQUESTED", "HUMAN_ASSIGNED"])))
      .orderBy(desc(conversations.handoffAt))
      .limit(8),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.orgId, s.orgId), inArray(messages.kind, ["outreach", "followup"]), gte(messages.sentAt, dayStart))),
    getSetupProgress(s.orgId),
  ]);

  const count = (st: string[]) => stageRows.filter((r) => st.includes(r.stage)).reduce((a, r) => a + r.n, 0);
  const total = stageRows.reduce((a, r) => a + r.n, 0);
  const won = count(["won"]);
  const contacted = count(["contacted", "replied", "interested", "proposal_sent", "negotiation", "won", "lost"]);
  const replied = count(["replied", "interested", "proposal_sent", "negotiation", "won"]);
  const interested = count(["interested", "proposal_sent", "negotiation", "won"]);

  const funnel = [
    { label: "Leads", v: total },
    { label: "Com site gerado", v: sites?.n ?? 0 },
    { label: "Contatados", v: contacted },
    { label: "Responderam", v: replied },
    { label: "Interessados", v: interested },
    { label: "Fechados", v: won },
  ];
  const maxF = Math.max(1, ...funnel.map((f) => f.v));
  const next = progress.steps.find((x) => !x.done);
  const doneCount = progress.steps.filter((x) => x.done).length;
  const stagesWithLeads = LEAD_STAGES.filter((st) => (stageRows.find((r) => r.stage === st)?.n ?? 0) > 0);

  return (
    <>
      <PageHeader
        title={`Olá, ${s.user.name.split(" ")[0]}`}
        subtitle="Quem respondeu, quem falta contatar e como está o funil."
        actions={
          <>
            <Link href="/discovery" className="btn btn-secondary"><Radar size={16} /> Prospectar</Link>
            <Link href="/inbox" className="btn btn-primary"><MessagesSquare size={16} /> Abrir Inbox</Link>
          </>
        }
      />
      <Flash sp={sp} />

      {next && (
        <Link href="/onboarding" className="panel mb-6 flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:border-[var(--line-strong)]">
          <div className="relative h-10 w-10 shrink-0">
            <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-mint-600)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(doneCount / progress.steps.length) * 97.4} 97.4`} />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[0.6875rem] font-bold tabular-nums">{doneCount}/{progress.steps.length}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Próximo passo: {next.title.charAt(0).toLowerCase() + next.title.slice(1)}</div>
            <div className="muted truncate text-[0.8125rem]">{next.why}</div>
          </div>
          <span className="btn btn-secondary btn-sm">Continuar</span>
        </Link>
      )}

      <section aria-label="Aguardando você" className={`mb-6 overflow-hidden rounded-[var(--radius-lg)] ${waiting.length ? "bg-forest text-paper" : "panel"}`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[0.9375rem] font-semibold">
              {waiting.length ? `${waiting.length} ${waiting.length === 1 ? "cliente esperando" : "clientes esperando"} sua resposta` : "Ninguém esperando resposta"}
            </h2>
            <p className={`mt-0.5 text-[0.8125rem] ${waiting.length ? "text-paper/65" : "muted"}`}>
              {waiting.length ? "Responderam com interesse. A automação está pausada nessas conversas." : "Quando um cliente responder com interesse, ele aparece aqui e você recebe um alerta na tela."}
            </p>
          </div>
          {waiting.length > 0 && <Link href="/inbox?tab=attention" className="btn btn-sm shrink-0 bg-mint text-forest hover:bg-[#5fe0af]">Atender</Link>}
        </div>
        {waiting.length > 0 && (
          <ul className="border-t border-white/10">
            {waiting.map(({ c, name, city }) => (
              <li key={c.id} className="border-b border-white/10 last:border-0">
                <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint text-[0.8125rem] font-bold text-forest">{(name ?? c.contactName ?? "?").slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {name ?? c.contactName ?? formatBrPhone(c.phoneE164)}
                      {city && <span className="font-normal text-paper/55"> em {city}</span>}
                    </div>
                    <div className="truncate text-[0.8125rem] text-paper/65">“{c.summary}”</div>
                  </div>
                  {c.lastIntent && <span className="hidden rounded-md bg-white/10 px-2 py-0.5 text-[0.75rem] font-semibold sm:inline">{INTENT_LABEL[c.lastIntent] ?? c.lastIntent}</span>}
                  <span className="w-16 shrink-0 text-right text-[0.75rem] text-paper/55">{timeAgo(c.handoffAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Leads" value={total.toLocaleString("pt-BR")} />
        <Stat label="Sites gerados" value={sites?.n ?? 0} />
        <Stat label="Contatados" value={contacted} hint={`${sentToday?.n ?? 0} hoje`} />
        <Stat label="Responderam" value={replied} hint={contacted ? `${Math.round((replied / contacted) * 100)}% dos contatados` : undefined} />
        <Stat label="Fechados" value={won} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Funil" description="Quantas empresas chegaram a cada etapa.">
          <dl className="space-y-3.5">
            {funnel.map((f, i) => (
              <div key={f.label} className="grid grid-cols-[140px_1fr_48px] items-center gap-3">
                <dt className="truncate text-[0.8125rem] font-medium">{f.label}</dt>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full" style={{ width: `${f.v ? Math.max(3, (f.v / maxF) * 100) : 0}%`, background: i === funnel.length - 1 ? "var(--color-mint-600)" : "var(--primary)" }} />
                </div>
                <dd className="text-right text-[0.8125rem] font-semibold tabular-nums">{f.v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Leads por etapa" action={<Link href="/leads" className="btn btn-quiet btn-sm">Ver todos</Link>}>
          {stagesWithLeads.length === 0 ? (
            <p className="muted text-sm">Nenhum lead ainda. Comece pela prospecção.</p>
          ) : (
            <ul className="-my-1.5 divide-y divide-[var(--line)]">
              {stagesWithLeads.map((st) => (
                <li key={st}>
                  <Link href={`/leads?stage=${st}`} className="flex items-center justify-between py-2 text-sm hover:text-[var(--primary)]">
                    <span>{STAGE_LABEL[st]}</span>
                    <Badge>{stageRows.find((r) => r.stage === st)?.n ?? 0}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
