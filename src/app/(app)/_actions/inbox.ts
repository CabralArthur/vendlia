"use server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, conversations, notifications } from "@/server/db";
import { queueReply } from "@/server/whatsapp/service";
import { transition } from "@/server/handoff";
import { isNull } from "drizzle-orm";

async function own(orgId: string, id: string) {
  const [c] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)));
  if (!c) throw new Error("Conversa não encontrada");
  return c;
}

export async function replyAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd, "conversationId");
  return act(`/inbox?c=${id}`, async () => {
    await own(s.orgId, id);
    const r = await queueReply(s.orgId, id, str(fd, "body"), "human", s.userId);
    if (!r.ok) throw new Error(r.reason);
  });
}

export async function takeOverAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd, "conversationId");
  return act(`/inbox?c=${id}`, async () => {
    await own(s.orgId, id);
    await transition(s.orgId, id, "HUMAN_ACTIVE", "Operador assumiu", s.userId, { assigneeId: s.userId });
    await db.update(conversations).set({ unread: 0 }).where(eq(conversations.id, id));
    return "Você assumiu a conversa. A automação está pausada.";
  });
}

export async function setConversationState(fd: FormData) {
  const s = await requireSession();
  const id = str(fd, "conversationId");
  return act(`/inbox?c=${id}`, async () => {
    await own(s.orgId, id);
    const to = str(fd, "to");
    if (to === "RESOLVED") await transition(s.orgId, id, "RESOLVED", "Encerrada pelo operador", s.userId);
    else if (to === "AI_ACTIVE") await transition(s.orgId, id, "AI_ACTIVE", "Devolvida para automação", s.userId, { assigneeId: null });
    else throw new Error("Estado inválido");
    return to === "RESOLVED" ? "Conversa encerrada." : "Automação reativada para esta conversa.";
  });
}

export async function markAllRead() {
  const s = await requireSession();
  return act("/notifications", async () => {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.orgId, s.orgId), isNull(notifications.readAt)));
  });
}
