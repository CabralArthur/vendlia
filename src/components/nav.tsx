"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Radar, MessagesSquare, Settings, Compass } from "lucide-react";

const items = [
  { href: "/onboarding", label: "Como funciona", icon: Compass },
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/discovery", label: "Prospecção", icon: Radar },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare, badgeKey: "inbox" },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Nav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 lg:flex-col lg:overflow-visible">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        const n = it.badgeKey ? badges[it.badgeKey] ?? 0 : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            data-tour={`nav-${it.href.slice(1)}`}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-white/10 text-paper" : "text-paper/65 hover:bg-white/5 hover:text-paper"}`}
          >
            <it.icon size={17} strokeWidth={2} />
            <span>{it.label}</span>
            {n > 0 && <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-brand-900">{n > 99 ? "99+" : n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
