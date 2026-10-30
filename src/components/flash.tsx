import { Notice } from "./ui";

export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <div className="mb-5"><Notice tone="error">{sp.err}</Notice></div>;
  if (sp.ok) return <div className="mb-5"><Notice tone="ok">{sp.ok}</Notice></div>;
  return null;
}
