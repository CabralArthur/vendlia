"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import type { SiteGenState } from "@/server/sites/progress";

/** Shows "the AI is creating the site" while a generation job runs; refreshes the page when it ends. */
export function SiteGenStatus({ leadId, initial }: { leadId: string; initial: SiteGenState | null }) {
  const [st, setSt] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const active = st?.status === "queued" || st?.status === "running";
  const was = useRef(active);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      setNow(Date.now());
      try {
        const r = await fetch(`/api/leads/${leadId}/sitegen`, { cache: "no-store" });
        if (r.ok) setSt(((await r.json()) as { state: SiteGenState | null }).state);
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [active, leadId]);

  useEffect(() => {
    if (was.current && !active) router.refresh();
    was.current = active;
  }, [active, router]);

  if (!active) return null;
  const secs = Math.max(0, Math.round((now - st!.startedAt) / 1000));
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[var(--radius)] border border-[#b2ddff] bg-[var(--info-bg)] px-4 py-3 text-[0.8125rem] text-[var(--info)]" role="status" aria-live="polite">
      {st!.mode === "ai" ? <Sparkles size={16} className="mt-0.5 shrink-0" /> : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{st!.status === "queued" ? "Na fila para gerar o site…" : st!.step || "Gerando o site…"}</div>
        <div className="opacity-80">Pode sair desta tela: o site fica pronto sozinho. {secs > 5 && `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}</div>
      </div>
      <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
    </div>
  );
}
