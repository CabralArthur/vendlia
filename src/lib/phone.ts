import { onlyDigits } from "./text";

/**
 * Normalizes a Brazilian phone to E.164 digits without "+" (e.g. 5581999998888).
 * Returns null when the number cannot be a valid BR phone.
 */
export function normalizeBrPhone(raw: string | null | undefined, defaultDdd?: string): string | null {
  let d = onlyDigits(raw);
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  // Carrier prefix "0XX" forms like 0 21 81 9xxxx: drop 2-digit carrier code
  if (d.length === 13 || d.length === 12) d = d.slice(2);
  if ((d.length === 8 || d.length === 9) && defaultDdd) d = defaultDdd + d;
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  const local = d.slice(2);
  if (local.length === 9 && local[0] !== "9") return null;
  return "55" + d;
}

/** True for BR mobile numbers (the ones that can have WhatsApp). Landlines rarely do. */
export function isBrMobile(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const local = e164.slice(4);
  if (local.length === 9) return local[0] === "9";
  // Legacy 8-digit mobile (pre-9th digit) beginning with 6-9
  return local.length === 8 && /[6-9]/.test(local[0]!);
}

export function formatBrPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const d = e164.startsWith("55") ? e164.slice(2) : e164;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function phoneFromJid(jid: string) {
  return jid.split("@")[0]!.split(":")[0]!;
}
