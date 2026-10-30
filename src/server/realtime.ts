import { redis } from "./redis";

export type RealtimeEvent =
  | { type: "message"; conversationId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "notification"; title: string; body: string; link?: string; priority: "normal" | "high" }
  | { type: "lead"; leadId: string }
  | { type: "instance"; instanceId: string };

export const channelFor = (orgId: string) => `vendlia:org:${orgId}`;

export async function publish(orgId: string, event: RealtimeEvent) {
  try {
    await redis().publish(channelFor(orgId), JSON.stringify(event));
  } catch (err) {
    console.error("[realtime] publish failed", err);
  }
}
