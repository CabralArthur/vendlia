"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Circle } from "lucide-react";

type Log = { t: string; msg: string; level: "info" | "ok" | "warn" | "error" };
export type RunView = {
  id: string;
  source: string;
  status: "queued" | "running" | "done" | "failed";
  found: number;
  created: number;
  error: string | null;
  logs: Log[];
  createdAt: string;
  finishedAt: string | null;
  label: string;
  segment: string;
};

const STATUS: Record<RunView["status"], [string, string]> = {
  queued: ["Na fila", "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--line)]"],
  running: ["Buscando", "bg-[var(--info-bg)] text-[var(--info)] ring-[#b2ddff]"],
  done: ["Concluída", "bg-[var(--ok-bg)] text-[var(--ok)] ring-[#abefc6]"],
  failed: ["Falhou", "bg-[var(--danger-bg)] text-[var(--danger)] ring-[#fecdca]"],
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Recife" });
const ago = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
};

function LevelIcon({ level, last, active }: { level: Log["level"]; last: boolean; active: boolean }) {
  if (last && active) return <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-[var(--info)]" aria-hidden />;
  if (level === "ok") return <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--ok)]" aria-hidden />;
  if (level === "warn") return <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#b54708]" aria-hidden />;
  if (level === "error") return <XCircle size={14} className="mt-0.5 shrink-0 text-[var(--danger)]" aria-hidden />;
  return <Circle size={14} className="subtle mt-0.5 shrink-0" aria-hidden />;
}

function Console({ run }: { run: RunView }) {
  const active = run.status === "queued" || run.status === "running";
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) end.current?.scrollIntoView({ block: "nearest" });
  }, [run.logs.length, active]);
  return (
    <ol className="scroll-thin mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-[0.8125rem]" aria-live={active ? "polite" : undefined}>
      {run.logs.map((l, i) => (
        <li key={i} className="flex gap-2.5">
          <LevelIcon level={l.level} last={i === run.logs.length - 1} active={active} />
          <span className="subtle w-16 shrink-0 tabular-nums">{time(l.t)}</span>
          <span className={l.level === "error" ? "text-[var(--danger)]" : ""}>{l.msg}</span>
        </li>
      ))}
      {run.logs.length === 0 && <li className="muted">Sem registros.</li>}
      <div ref={end} />
    </ol>
  );
}

export function DiscoveryRuns({ initial, initialWorkerOk }: { initial: RunView[]; initialWorkerOk: boolean }) {
  const [runs, setRuns] = useState(initial);
  const [workerOk, setWorkerOk] = useState(initialWorkerOk);
  const router = useRouter();
  const active = runs.some((r) => r.status === "queued" || r.status === "running");
  const wasActive = useRef(active);

  useEffect(() => setRuns(initial), [initial]);

  // Poll while a search is running; stop when everything has finished.
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/discovery/runs", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { workerOk: boolean; runs: (Omit<RunView, "label" | "segment"> & { params: { city: string; state: string; segment: string } })[] };
        if (stop) return;
        setWorkerOk(j.workerOk);
        setRuns((prev) =>
          j.runs.map((r) => {
            const old = prev.find((p) => p.id === r.id);
            return { ...r, label: old?.label ?? `${r.params.city}/${r.params.state}`, segment: old?.segment ?? r.params.segment };
          }),
        );
      } catch {
        /* keep polling */
      }
    };
    const id = setInterval(tick, 2000);
    void tick();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [active]);

  // When a search finishes, refresh server data (lead counts, etc.).
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  if (runs.length === 0) return <p className="muted px-5 py-6 text-sm">Nenhuma busca ainda. Os passos de cada busca aparecem aqui, ao vivo.</p>;

  const stuck = runs.some((r) => r.status === "queued" && Date.now() - new Date(r.createdAt).getTime() > 60_000);

  return (
    <>
      {stuck && !workerOk && (
        <p className="border-b border-[var(--line)] bg-[var(--warn-bg)] px-5 py-3 text-[0.8125rem] text-[var(--warn)]">
          O processamento em segundo plano não está respondendo, então as buscas ficam na fila. Confira se o serviço está no ar e se DATABASE_URL e REDIS_URL estão configuradas.
        </p>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {runs.map((r, idx) => {
          const [label, cls] = STATUS[r.status];
          const isActive = r.status === "queued" || r.status === "running";
          const head = (
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="muted text-[0.8125rem]">
                  {r.source === "google_places" ? "Google Maps" : "OpenStreetMap"}, {ago(r.createdAt)}
                  {r.status === "done" && <> · {r.created} {r.created === 1 ? "nova" : "novas"} de {r.found} encontradas</>}
                </div>
                {r.status === "failed" && r.error && <div className="mt-1 break-words text-[0.8125rem] text-[var(--danger)]">{r.error}</div>}
                {r.status === "done" && r.found === 0 && <div className="mt-1 text-[0.8125rem] text-[var(--warn)]">Nada encontrado. Confira o nome da cidade e a UF, ou tente outro tipo de negócio.</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.75rem] font-semibold ring-1 ring-inset ${cls}`}>
                  {isActive && <Loader2 size={12} className="animate-spin" aria-hidden />}
                  {label}
                </span>
                {r.status === "done" && r.created > 0 && <Link href={`/leads?segment=${r.segment}`} className="btn btn-secondary btn-sm">Ver leads</Link>}
              </div>
            </div>
          );
          // The running search (or the latest one) shows its log open; older ones keep it behind "Ver passos".
          return (
            <li key={r.id} className="px-5 py-4">
              {head}
              {isActive || idx === 0 ? (
                <Console run={r} />
              ) : (
                <details className="group mt-2">
                  <summary className="muted cursor-pointer list-none text-[0.8125rem] font-medium hover:text-[var(--ink)]">
                    <span className="inline-block transition-transform group-open:rotate-90">›</span> Ver passos
                  </summary>
                  <Console run={r} />
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
