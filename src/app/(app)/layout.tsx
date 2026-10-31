import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, conversations, whatsappInstances } from "@/server/db";
import { Nav } from "@/components/nav";
import { Live } from "@/components/live";
import { LogoMark } from "@/components/ui";
import { logoutAction } from "../(auth)/actions";
import { isDemoInstance } from "@/lib/demo";
import { LogOut } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const [[inbox], inst] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(and(eq(conversations.orgId, s.orgId), inArray(conversations.state, ["HUMAN_REQUESTED", "HUMAN_ASSIGNED"]))),
    db.select({ status: whatsappInstances.status, name: whatsappInstances.name }).from(whatsappInstances).where(eq(whatsappInstances.orgId, s.orgId)),
  ]);
  const real = inst.filter((i) => !isDemoInstance(i.name));
  const waOnline = real.some((i) => i.status === "open");
  const initials = s.user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 z-30 flex flex-col gap-3 bg-forest py-3 lg:h-screen lg:gap-0 lg:py-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-6 lg:mb-7" aria-label="Vendlia — visão geral">
          <LogoMark className="h-7 w-7" />
          <span className="text-[1.125rem] font-bold tracking-[-0.02em] text-paper">
            vendlia<span className="text-mint">.</span>
          </span>
        </Link>
        <Nav badges={{ inbox: inbox?.n ?? 0 }} />
        <div className="hidden px-3 pt-4 lg:block">
          <Link href="/settings#whatsapp" className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-[0.8125rem] text-paper/75 hover:bg-white/[0.05]">
            <span className={`h-2 w-2 rounded-full ${waOnline ? "bg-mint" : "bg-[#f5b546]"}`} aria-hidden />
            {waOnline ? "WhatsApp conectado" : real.length ? "WhatsApp desconectado" : "Conectar WhatsApp"}
          </Link>
          <div className="flex items-center gap-2.5 border-t border-white/10 px-3 pt-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[0.75rem] font-bold text-paper">{initials}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] font-semibold text-paper">{s.user.name}</div>
              <div className="truncate text-[0.75rem] text-paper/55">{s.org.name}</div>
            </div>
            <form action={logoutAction}>
              <button className="grid h-8 w-8 place-items-center rounded-md text-paper/60 hover:bg-white/10 hover:text-paper" aria-label="Sair" title="Sair">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
      <Live refreshOn={["message", "conversation", "lead", "instance"]} />
    </div>
  );
}
