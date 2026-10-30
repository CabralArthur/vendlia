export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STOP = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "mei", "de", "da", "do", "dos", "das", "e", "the"]);

/** Canonical name used for duplicate detection. */
export function normalizeName(name: string) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ")
    .trim();
}

export function slugify(s: string, max = 48) {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64url");
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
