"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Radar, MessagesSquare, Settings, Compass, CreditCard, Shield, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; badgeKey?: string };

const MAIN: Item[] = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/discovery", label: "Prospecção", icon: Radar },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare, badgeKey: "inbox" },
];
const SECONDARY: Item[] = [
  { href: "/onboarding", label: "Como funciona", icon: Compass },
  { href: "/planos", label: "Plano", icon: CreditCard },
  { href: "/settings", label: "Configurações", icon: Settings },
];
const OWNER: Item = { href: "/admin", label: "Administração", icon: Shield };

function NavLink({ it, active, badge }: { it: Item; active: boolean; badge: number }) {
  return (
    <Link
      href={it.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-[0.875rem] font-medium transition-colors ${
        active ? "bg-white/[0.09] text-paper" : "text-paper/70 hover:bg-white/[0.05] hover:text-paper"
      }`}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 hidden w-[3px] rounded-r bg-mint lg:block" />}
      <it.icon size={17} strokeWidth={1.9} className={active ? "text-mint" : ""} />
      <span>{it.label}</span>
      {badge > 0 && (
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-mint px-1.5 text-[0.6875rem] font-bold text-forest" aria-label={`${badge} aguardando`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function Nav({ badges, owner = false }: { badges: Record<string, number>; owner?: boolean }) {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(href + "/") || (href === "/leads" && path.startsWith("/studio"));
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 lg:flex-1 lg:flex-col lg:overflow-visible">
      {MAIN.map((it) => (
        <NavLink key={it.href} it={it} active={isActive(it.href)} badge={it.badgeKey ? badges[it.badgeKey] ?? 0 : 0} />
      ))}
      <div className="hidden lg:mt-auto lg:block" />
      {[...(owner ? [OWNER] : []), ...SECONDARY].map((it) => (
        <NavLink key={it.href} it={it} active={isActive(it.href)} badge={0} />
      ))}
    </nav>
  );
}
