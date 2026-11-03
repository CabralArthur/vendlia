import { redis } from "../redis";

/** Lightweight progress flag for site generation (shown on the lead and Studio pages). */
export type SiteGenState = { status: "queued" | "running" | "done" | "failed"; step: string; at: number; startedAt: number; mode: "ai" | "template" };

const key = (leadId: string) => `vendlia:sitegen:${leadId}`;

export async function setSiteGen(leadId: string, s: Partial<SiteGenState> & { status: SiteGenState["status"] }) {
  const prev = await getSiteGen(leadId);
  const next: SiteGenState = { step: "", mode: "ai", startedAt: Date.now(), ...prev, ...s, at: Date.now() };
  await redis().set(key(leadId), JSON.stringify(next), "EX", 60 * 30).catch(() => {});
}

export async function getSiteGen(leadId: string): Promise<SiteGenState | null> {
  const raw = await redis().get(key(leadId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SiteGenState;
  } catch {
    return null;
  }
}
