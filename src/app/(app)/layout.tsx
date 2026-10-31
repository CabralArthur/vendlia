import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, conversations, notifications, whatsappInstances } from "@/server/db";
import { Nav } from "@/components/nav";
import { Live } from "@/components/live";
import { LogoMark } from "@/components/ui";
import { logoutAction } from "../(auth)/actions";
import { Tour } from "@/components/tour";
import { getDemoRefs } from "@/server/onboarding";
import { isDemoInstance } from "@/lib/demo";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const [[inbox], [notes], inst, demo] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(and(eq(conversations.orgId, s.orgId), inArray(conversations.state, ["HUMAN_REQUESTED", "HUMAN_ASSIGNED"]))),
    db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.orgId, s.orgId), isNull(notifications.readAt))),
    db.select({ status: whatsappInstances.status, name: whatsappInstances.name }).from(whatsappInstances).where(eq(whatsappInstances.orgId, s.orgId)),
    getDemoRefs(s.orgId),
  ]);
  const waOnline = inst.some((i) => i.status === "open" && !isDemoInstance(i.name));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="sticky top-0 z-30 flex flex-col bg-brand-900 py-3 lg:h-screen lg:py-5">
        <div className="mb-2 flex items-center gap-2.5 px-6 lg:mb-6">
          <LogoMark className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight text-paper">vendlia<span className="text-brand-500">.</span></span>
        </div>
        <Nav badges={{ inbox: inbox?.n ?? 0, notifications: notes?.n ?? 0 }} />
        <div className="mt-auto hidden px-5 pt-6 lg:block">
          <div className="mb-3 flex items-center gap-2 text-xs text-paper/70">
            <span className={`h-2 w-2 rounded-full ${waOnline ? "bg-brand-500" : "bg-amber-400"}`} />
            {waOnline ? "WhatsApp conectado" : "WhatsApp desconectado"}
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="truncate text-sm font-semibold text-paper">{s.user.name}</div>
            <div className="truncate text-xs text-paper/55">{s.org.name}</div>
            <form action={logoutAction}>
              <button className="mt-2 text-xs font-medium text-brand-400 hover:underline">Sair</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-[1280px]">
          {demo.hasDemo && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
              <span><b>Modo exemplo:</b> há empresas e conversas fictícias misturadas aos seus dados. Elas nunca enviam mensagens.</span>
              <Link href="/onboarding" className="font-semibold underline">Remover exemplos</Link>
            </div>
          )}
          {children}
        </div>
      </main>
      <Live refreshOn={["message", "conversation", "lead", "instance"]} />
      <Tour refs={{ leadId: demo.leadId, siteId: demo.siteId, conversationId: demo.conversationId }} />
    </div>
  );
}
