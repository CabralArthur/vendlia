"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ev = { type: string; title?: string; body?: string; link?: string; priority?: string };

/** Subscribes to org realtime events: refreshes server components and shows hot-lead toasts. */
export function Live({ refreshOn = [] }: { refreshOn?: string[] }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<(Ev & { id: number })[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = (m) => {
        let ev: Ev;
        try {
          ev = JSON.parse(m.data);
        } catch {
          return;
        }
        if (ev.type === "notification") {
          const id = Date.now() + Math.random();
          setToasts((t) => [...t.slice(-3), { ...ev, id }]);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ev.priority === "high" ? 15000 : 6000);
          if (ev.priority === "high" && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            new Notification(ev.title ?? "Vendlia", { body: ev.body, icon: "/icon.svg" });
          }
        }
        if (refreshOn.includes(ev.type) || ev.type === "notification") {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 400);
        }
      };
      es.onerror = () => {
        es?.close();
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    return () => {
      es?.close();
      clearTimeout(retry);
    };
  }, [router, refreshOn.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <a
          key={t.id}
          href={t.link ?? "#"}
          className={`pointer-events-auto block rounded-xl border p-4 shadow-xl ${t.priority === "high" ? "border-brand-500 bg-brand-900 text-paper" : "panel"}`}
        >
          <div className="text-sm font-semibold">{t.title}</div>
          <div className={`mt-1 text-xs ${t.priority === "high" ? "text-paper/75" : "muted"}`}>{t.body}</div>
          {t.priority === "high" && <div className="mt-2 text-xs font-semibold text-brand-500">Assumir atendimento →</div>}
        </a>
      ))}
    </div>
  );
}
