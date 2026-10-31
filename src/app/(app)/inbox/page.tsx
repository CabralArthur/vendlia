import Link from "next/link";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, conversations, messages, leads, businesses, intentClassifications, whatsappInstances, websites, users, type ConversationState } from "@/server/db";
import { Badge, Card, Empty, StageBadge, timeAgo } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { Composer, ScrollBottom } from "@/components/composer";
import { formatBrPhone } from "@/lib/phone";
import { takeOverAction, setConversationState } from "../_actions/inbox";
import { previewUrl } from "@/server/whatsapp/service";
import { isDemoInstance } from "@/lib/demo";
import { Check, CheckCheck, Clock, AlertTriangle, Bot, User } from "lucide-react";

export const metadata = { title: "Inbox" };

const STATE: Record<ConversationState, [string, "amber" | "green" | "blue" | "neutral" | "red"]> = {
  AI_ACTIVE: ["Automação", "blue"],
  HUMAN_REQUESTED: ["Aguardando humano", "amber"],
  HUMAN_ASSIGNED: ["Atribuída", "amber"],
  HUMAN_ACTIVE: ["Em atendimento", "green"],
  RESOLVED: ["Encerrada", "neutral"],
};

const TABS = [
  { id: "attention", label: "Precisa de você" },
  { id: "all", label: "Todas" },
  { id: "mine", label: "Minhas" },
  { id: "resolved", label: "Encerradas" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string; ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const tab = sp.tab ?? "all";
  const where: SQL[] = [eq(conversations.orgId, s.orgId)];
  if (tab === "attention") where.push(inArray(conversations.state, ["HUMAN_REQUESTED", "HUMAN_ASSIGNED"]));
  if (tab === "mine") where.push(eq(conversations.assigneeId, s.userId));
  if (tab === "resolved") where.push(eq(conversations.state, "RESOLVED"));

  const list = await db
    .select({
      c: conversations,
      name: businesses.name,
      last: sql<string | null>`(select body from messages m where m.conversation_id = ${conversations.id} order by created_at desc limit 1)`,
    })
    .from(conversations)
    .leftJoin(leads, eq(leads.id, conversations.leadId))
    .leftJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(...where))
    .orderBy(desc(conversations.priority), desc(conversations.lastMessageAt))
    .limit(150);

  const activeId = sp.c ?? list[0]?.c.id;
  const [active] = activeId
    ? await db
        .select({ c: conversations, lead: leads, b: businesses, inst: whatsappInstances, assignee: users.name })
        .from(conversations)
        .innerJoin(whatsappInstances, eq(whatsappInstances.id, conversations.instanceId))
        .leftJoin(leads, eq(leads.id, conversations.leadId))
        .leftJoin(businesses, eq(businesses.id, leads.businessId))
        .leftJoin(users, eq(users.id, conversations.assigneeId))
        .where(and(eq(conversations.id, activeId), eq(conversations.orgId, s.orgId)))
    : [];
  const thread = active ? await db.select().from(messages).where(eq(messages.conversationId, active.c.id)).orderBy(asc(messages.createdAt)).limit(500) : [];
  const [cls] = active ? await db.select().from(intentClassifications).where(eq(intentClassifications.conversationId, active.c.id)).orderBy(desc(intentClassifications.createdAt)).limit(1) : [];
  const [site] = active?.lead ? await db.select().from(websites).where(eq(websites.leadId, active.lead.id)).orderBy(desc(websites.createdAt)).limit(1) : [];
  if (active && active.c.unread > 0 && active.c.state !== "HUMAN_REQUESTED") await db.update(conversations).set({ unread: 0 }).where(eq(conversations.id, active.c.id));

  return (
    <>
      <Flash sp={sp} />
      <div className="panel grid h-[calc(100vh-7rem)] min-h-[560px] overflow-hidden lg:grid-cols-[320px_1fr_300px]">
        {/* Column 1: conversations */}
        <div className="flex min-h-0 flex-col border-b border-[var(--line)] lg:border-r lg:border-b-0">
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] p-2">
            {TABS.map((t) => (
              <Link key={t.id} href={`/inbox?tab=${t.id}`} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-brand-900 text-paper" : "muted hover:bg-[var(--panel-2)]"}`}>{t.label}</Link>
            ))}
          </div>
          <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && <li className="muted p-6 text-center text-sm">Nenhuma conversa aqui.</li>}
            {list.map(({ c, name, last }) => (
              <li key={c.id}>
                <Link href={`/inbox?tab=${tab}&c=${c.id}`} className={`flex gap-3 border-b border-[var(--line)] px-3 py-3 ${c.id === activeId ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel-2)]"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${c.state === "HUMAN_REQUESTED" ? "bg-brand-500 text-brand-900" : "bg-brand-900 text-paper"}`}>{(name ?? c.contactName ?? "#").slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{name ?? c.contactName ?? formatBrPhone(c.phoneE164)}</span>
                      <span className="muted shrink-0 text-[11px]">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div className="muted truncate text-xs">{last}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge tone={STATE[c.state][1]}>{STATE[c.state][0]}</Badge>
                      {c.unread > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-brand-900">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2: thread */}
        <div className="flex min-h-0 flex-col">
          {!active ? (
            <div className="grid flex-1 place-items-center p-6"><Empty title="Sua caixa de entrada">As respostas dos leads chegam aqui em tempo real. Quando houver interesse, a conversa sobe para o topo e você recebe um alerta.</Empty></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{active.b?.name ?? active.c.contactName ?? formatBrPhone(active.c.phoneE164)}</div>
                  <div className="muted text-xs">{formatBrPhone(active.c.phoneE164)} · via {active.inst.label}{active.assignee ? ` · com ${active.assignee}` : ""}</div>
                </div>
                <Badge tone={STATE[active.c.state][1]}>{STATE[active.c.state][0]}</Badge>
              </div>
              <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--bg)] px-4 py-4">
                {thread.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.direction === "out" ? (m.author === "ai" ? "bg-sky-100 text-sky-950" : "bg-brand-900 text-paper") : "panel"}`}>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${m.direction === "out" && m.author !== "ai" ? "text-paper/60" : "muted"}`}>
                        {m.author === "ai" && <><Bot size={11} /> IA ·</>}
                        {m.author === "system" && <>sistema ·</>}
                        {m.kind === "outreach" && <>1º contato ·</>}
                        {m.kind === "followup" && <>follow-up ·</>}
                        {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" })}
                        {m.direction === "out" && (m.status === "queued" ? <Clock size={11} /> : m.status === "failed" ? <AlertTriangle size={11} className="text-red-400" /> : m.status === "read" ? <CheckCheck size={12} className="text-brand-500" /> : m.status === "delivered" ? <CheckCheck size={12} /> : m.status === "canceled" ? <span>cancelada</span> : <Check size={12} />)}
                      </div>
                      {m.status === "failed" && m.error && <div className="mt-1 text-[10px] text-red-400">{m.error.slice(0, 120)}</div>}
                    </div>
                  </div>
                ))}
                <ScrollBottom dep={thread.length} />
              </div>
              <Composer
                conversationId={active.c.id}
                suggestion={cls?.suggestedReply}
                disabled={isDemoInstance(active.inst.name) ? "Conversa de exemplo — aqui você responderia ao cliente. Com um número real conectado, a mensagem sai pelo WhatsApp." : active.lead?.stage === "do_not_contact" ? "Este contato pediu para não receber mensagens." : undefined}
              />
            </>
          )}
        </div>

        {/* Column 3: context */}
        <div className="scroll-thin hidden min-h-0 overflow-y-auto border-l border-[var(--line)] p-4 lg:block">
          {active && (
            <div className="space-y-4 text-sm">
              {active.c.state !== "HUMAN_ACTIVE" && (
                <form action={takeOverAction} data-tour="takeover">
                  <input type="hidden" name="conversationId" value={active.c.id} />
                  <Submit className="btn btn-primary w-full"><User size={15} /> Assumir atendimento</Submit>
                </form>
              )}
              {cls && (
                <Card title="Leitura da IA" className="[&>div]:p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="amber">{cls.intent.replace(/_/g, " ")}</Badge>
                    <Badge>{Math.round(cls.confidence * 100)}%</Badge>
                    <Badge tone={cls.urgency === "high" ? "red" : "neutral"}>urgência {cls.urgency}</Badge>
                  </div>
                  <p className="mt-2"><b>Ação:</b> {cls.suggestedAction}</p>
                  <p className="muted mt-1 text-xs">{cls.reason} · {cls.model}</p>
                </Card>
              )}
              {active.lead && active.b && (
                <Card title="Lead" className="[&>div]:p-4">
                  <Link href={`/leads/${active.lead.id}`} className="font-semibold hover:underline">{active.b.name}</Link>
                  <div className="muted text-xs">{[active.b.neighborhood, active.b.city].filter(Boolean).join(", ")}</div>
                  <div className="mt-2"><StageBadge stage={active.lead.stage} /></div>
                  {site && <a href={previewUrl(site)} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-semibold underline">Ver demonstração enviada ↗</a>}
                  <Link href={`/leads/${active.lead.id}`} className="btn btn-dark mt-3 w-full">Abrir lead</Link>
                </Card>
              )}
              <div className="grid gap-2">
                {active.c.state !== "AI_ACTIVE" && active.c.state !== "RESOLVED" && (
                  <form action={setConversationState}>
                    <input type="hidden" name="conversationId" value={active.c.id} />
                    <input type="hidden" name="to" value="AI_ACTIVE" />
                    <Submit className="btn btn-ghost w-full"><Bot size={15} /> Devolver para automação</Submit>
                  </form>
                )}
                {active.c.state !== "RESOLVED" && (
                  <form action={setConversationState}>
                    <input type="hidden" name="conversationId" value={active.c.id} />
                    <input type="hidden" name="to" value="RESOLVED" />
                    <Submit className="btn btn-ghost w-full">Encerrar conversa</Submit>
                  </form>
                )}
              </div>
              <p className="muted text-xs">Enquanto um humano estiver no atendimento, a automação não envia nenhuma mensagem nesta conversa.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
