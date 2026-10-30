import { and, eq } from "drizzle-orm";
import { db, conversations, handoffs, type ConversationState } from "./db";
import { publish } from "./realtime";

const ALLOWED: Record<ConversationState, ConversationState[]> = {
  AI_ACTIVE: ["HUMAN_REQUESTED", "HUMAN_ASSIGNED", "HUMAN_ACTIVE", "RESOLVED"],
  HUMAN_REQUESTED: ["HUMAN_ASSIGNED", "HUMAN_ACTIVE", "RESOLVED", "AI_ACTIVE"],
  HUMAN_ASSIGNED: ["HUMAN_ACTIVE", "RESOLVED", "AI_ACTIVE", "HUMAN_REQUESTED"],
  HUMAN_ACTIVE: ["RESOLVED", "AI_ACTIVE", "HUMAN_ASSIGNED"],
  RESOLVED: ["AI_ACTIVE", "HUMAN_REQUESTED", "HUMAN_ACTIVE", "HUMAN_ASSIGNED"],
};

export function canTransition(from: ConversationState, to: ConversationState) {
  return from === to || ALLOWED[from].includes(to);
}

/** Automation may only speak when no human owns the conversation. */
export function automationMaySpeak(state: ConversationState) {
  return state === "AI_ACTIVE";
}

/**
 * Atomic state transition using compare-and-set on the current state, so an AI reply racing
 * with a human takeover can never both win.
 */
export async function transition(
  orgId: string,
  conversationId: string,
  to: ConversationState,
  reason: string,
  actorId?: string | null,
  extra?: { assigneeId?: string | null },
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [c] = await db
      .select({ state: conversations.state })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
    if (!c) return false;
    if (c.state === to && extra?.assigneeId === undefined) return true;
    if (!canTransition(c.state, to)) return false;
    const patch: Partial<typeof conversations.$inferInsert> = { state: to };
    if (to === "HUMAN_REQUESTED") Object.assign(patch, { handoffAt: new Date(), priority: 10 });
    if (to === "RESOLVED" || to === "AI_ACTIVE") patch.priority = 0;
    if (extra?.assigneeId !== undefined) patch.assigneeId = extra.assigneeId;
    const updated = await db
      .update(conversations)
      .set(patch)
      .where(and(eq(conversations.id, conversationId), eq(conversations.state, c.state)))
      .returning({ id: conversations.id });
    if (updated.length) {
      if (c.state !== to) {
        await db.insert(handoffs).values({ orgId, conversationId, fromState: c.state, toState: to, reason, actorId: actorId ?? null });
      }
      await publish(orgId, { type: "conversation", conversationId });
      return true;
    }
  }
  return false;
}
