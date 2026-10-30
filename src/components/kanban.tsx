"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { moveLead } from "@/app/(app)/_actions/leads";

type CardT = { id: string; name: string; city: string | null; score: number; stage: string; hasSite: boolean };

export function Kanban({ columns, cards }: { columns: { id: string; label: string }[]; cards: CardT[] }) {
  const [, start] = useTransition();
  const [items, setItems] = useOptimistic(cards, (state, m: { id: string; stage: string }) => state.map((c) => (c.id === m.id ? { ...c, stage: m.stage } : c)));
  return (
    <div className="scroll-thin flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const list = items.filter((c) => c.stage === col.id);
        return (
          <div
            key={col.id}
            className="flex w-64 shrink-0 flex-col rounded-xl bg-[var(--panel-2)] p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              if (!id) return;
              start(async () => {
                setItems({ id, stage: col.id });
                await moveLead(id, col.id);
              });
            }}
          >
            <div className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold">
              <span>{col.label}</span>
              <span className="muted tabular-nums">{list.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {list.slice(0, 100).map((c) => (
                <Link
                  key={c.id}
                  href={`/leads/${c.id}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="panel block cursor-grab p-3 text-sm active:cursor-grabbing"
                >
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="muted mt-0.5 flex items-center justify-between text-xs">
                    <span className="truncate">{c.city ?? "—"}</span>
                    <span className="tabular-nums">{c.score}{c.hasSite ? " · demo" : ""}</span>
                  </div>
                </Link>
              ))}
              {list.length > 100 && <div className="muted px-2 text-xs">+{list.length - 100} na lista de leads</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
