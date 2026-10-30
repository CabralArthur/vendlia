import { db, leadEvents, leads, notifications, auditLogs, type LeadStage } from "./db";
import { and, eq } from "drizzle-orm";
import { publish } from "./realtime";

export async function logLeadEvent(
  orgId: string,
  leadId: string,
  type: string,
  message: string,
  data?: unknown,
  actorId?: string | null,
) {
  await db.insert(leadEvents).values({ orgId, leadId, type, message, data: data ?? null, actorId: actorId ?? null });
}

const STAGE_ORDER: LeadStage[] = [
  "discovered",
  "qualified",
  "preview_ready",
  "ready_to_contact",
  "contacted",
  "replied",
  "interested",
  "proposal_sent",
  "negotiation",
  "won",
];

/** Moves a lead forward only (never backwards automatically); terminal stages are respected. */
export async function advanceStage(orgId: string, leadId: string, to: LeadStage, actorId?: string | null) {
  const [l] = await db.select({ stage: leads.stage }).from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  if (!l) return;
  if (["won", "lost", "do_not_contact"].includes(l.stage) && to !== "won") return;
  const from = STAGE_ORDER.indexOf(l.stage);
  const target = STAGE_ORDER.indexOf(to);
  if (target !== -1 && from !== -1 && target <= from) return;
  await setStage(orgId, leadId, to, actorId, l.stage);
}

export async function setStage(orgId: string, leadId: string, to: LeadStage, actorId?: string | null, from?: string) {
  await db.update(leads).set({ stage: to }).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  await logLeadEvent(orgId, leadId, "stage", `Etapa alterada${from ? ` de ${from}` : ""} para ${to}`, { from, to }, actorId);
  await publish(orgId, { type: "lead", leadId });
}

export async function notify(
  orgId: string,
  n: { type: string; title: string; body: string; link?: string; priority?: "normal" | "high" },
) {
  await db.insert(notifications).values({ orgId, ...n, priority: n.priority ?? "normal" });
  await publish(orgId, { type: "notification", title: n.title, body: n.body, link: n.link, priority: n.priority ?? "normal" });
}

export async function audit(orgId: string, actorId: string | null, action: string, target?: string, data?: unknown) {
  await db.insert(auditLogs).values({ orgId, actorId, action, target: target ?? null, data: data ?? null });
}
