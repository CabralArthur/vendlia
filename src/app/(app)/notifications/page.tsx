import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, notifications } from "@/server/db";
import { Card, Empty, PageHeader, timeAgo } from "@/components/ui";
import { Submit } from "@/components/submit";
import { markAllRead } from "../_actions/inbox";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const s = await requireSession();
  const list = await db.select().from(notifications).where(eq(notifications.orgId, s.orgId)).orderBy(desc(notifications.createdAt)).limit(100);
  return (
    <>
      <PageHeader title="Notificações" actions={<form action={markAllRead}><Submit className="btn btn-ghost">Marcar todas como lidas</Submit></form>} />
      {list.length === 0 ? <Empty title="Nada por aqui">Você será avisado quando um lead responder com interesse, um pagamento for confirmado ou um número desconectar.</Empty> : (
        <Card className="[&>div]:p-0">
          <ul className="divide-y divide-[var(--line)]">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "#"} className={`flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--panel-2)] ${n.readAt ? "opacity-60" : ""}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.priority === "high" ? "bg-brand-500" : "bg-[var(--line)]"}`} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{n.title}</div><div className="muted truncate text-sm">{n.body}</div></div>
                  <span className="muted shrink-0 text-xs">{timeAgo(n.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
