/** Pure helpers for outbound pacing (unit-tested). Timezone: America/Recife (UTC-3, no DST). */

export const TZ_OFFSET_HOURS = -3;

export function localHour(now: Date) {
  return (now.getUTCHours() + 24 + TZ_OFFSET_HOURS) % 24;
}

export function localDayKey(now: Date) {
  const d = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function localHourKey(now: Date) {
  const d = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600_000);
  return d.toISOString().slice(0, 13).replace(/[-T]/g, "");
}

/** Mon–Sat within [start, end) local hours. Sundays are never used for cold outreach. */
export function inBusinessHours(now: Date, start: number, end: number) {
  const local = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600_000);
  const dow = local.getUTCDay();
  if (dow === 0) return false;
  const h = localHour(now);
  return h >= start && h < end;
}

/** Next instant at which business hours open (local `start`, skipping Sunday). */
export function nextBusinessOpening(now: Date, start: number, end: number): Date {
  const t = new Date(now.getTime());
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (inBusinessHours(t, start, end)) return t;
  }
  return new Date(now.getTime() + 3600_000);
}

/** Warm-up: new numbers start at 10/day and grow 5/day until the configured limit. */
export function effectiveDailyLimit(dailyLimit: number, warmupStartedAt: Date, now: Date) {
  const days = Math.max(0, Math.floor((now.getTime() - warmupStartedAt.getTime()) / 86400_000));
  return Math.min(dailyLimit, 10 + days * 5);
}

/** Random human-like gap between cold messages on the same number (seconds). */
export function randomGapSeconds(min = 60, max = 240) {
  return Math.floor(min + Math.random() * (max - min));
}

/** BR numbers may appear with or without the 9th digit in WhatsApp JIDs. */
export function brPhoneVariants(e164: string): string[] {
  const v = new Set([e164]);
  if (e164.startsWith("55") && e164.length === 13 && e164[4] === "9") v.add(e164.slice(0, 4) + e164.slice(5));
  if (e164.startsWith("55") && e164.length === 12 && /[6-9]/.test(e164[4]!)) v.add(e164.slice(0, 4) + "9" + e164.slice(4));
  return [...v];
}

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function greeting(now: Date) {
  const h = localHour(now);
  return h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
}
