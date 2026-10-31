import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { LeadStage } from "@/server/db/schema";

export const cx = clsx;

export function Card({ children, className, title, action, tour }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; tour?: string }) {
  return (
    <section className={cx("panel", className)} data-tour={tour}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.6rem] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "accent" }) {
  return (
    <div className={cx("panel p-4", tone === "accent" && "border-[var(--accent)]")}>
      <div className="muted text-xs font-medium uppercase tracking-wide">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" | "dark" }) {
  const tones = {
    neutral: "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--line)]",
    green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
    red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25",
    blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
    dark: "bg-brand-900 text-paper border-brand-900",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

export const STAGE_LABEL: Record<LeadStage, string> = {
  discovered: "Descoberto",
  qualified: "Qualificado",
  preview_ready: "Preview criado",
  ready_to_contact: "Pronto p/ contato",
  contacted: "Contatado",
  replied: "Respondeu",
  interested: "Interessado",
  proposal_sent: "Proposta enviada",
  negotiation: "Negociação",
  won: "Fechado",
  lost: "Perdido",
  do_not_contact: "Não contatar",
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  const tone =
    stage === "won" ? "green" : stage === "lost" || stage === "do_not_contact" ? "red" : ["interested", "negotiation", "proposal_sent"].includes(stage) ? "amber" : ["replied", "contacted"].includes(stage) ? "blue" : "neutral";
  return <Badge tone={tone}>{STAGE_LABEL[stage]}</Badge>;
}

export function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? "var(--accent)" : score >= 45 ? "#e0b13a" : "#c9cfc9";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-[var(--panel-2)]">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
      </span>
      <span className="text-xs font-semibold">{score}</span>
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] px-6 py-12 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--panel-2)]">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
      </div>
      <div className="font-semibold">{title}</div>
      {children && <div className="muted mt-1 max-w-md text-sm">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const t = {
    info: "border-sky-500/30 bg-sky-500/8",
    warn: "border-amber-500/40 bg-amber-500/10",
    error: "border-red-500/40 bg-red-500/10",
    ok: "border-emerald-500/40 bg-emerald-500/10",
  }[tone];
  return <div className={cx("rounded-xl border px-4 py-3 text-sm", t)}>{children}</div>;
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  const ink = inverted ? "#F7F8F4" : "#102F29";
  return (
    <svg viewBox="0 0 1100 260" className={className} role="img" aria-label="Vendlia">
      <g transform="translate(30 36)">
        <path fill={ink} d="M30 0H153Q183 0 183 30V59H46Q20 59 20 85V169H130L110 189H30Q0 189 0 159V30Q0 0 30 0Z" />
        <circle cx="30" cy="25" r="8" fill={inverted ? "#102F29" : "#F7F8F4"} />
        <circle cx="55" cy="25" r="8" fill={inverted ? "#102F29" : "#F7F8F4"} />
        <path fill="#39D79B" d="M92 195C120 176 147 141 170 98L183 66V138C191 152 204 160 225 165C203 170 190 184 183 208C174 186 160 174 139 169C155 158 167 145 173 124C153 156 125 181 92 195Z" />
      </g>
      <text x="284" y="193" fill={ink} fontFamily="Inter, Arial, sans-serif" fontSize="170" fontWeight="750" letterSpacing="-9">
        vendlia
      </text>
      <circle cx="813" cy="176" r="14" fill="#39D79B" />
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      <g transform="translate(8 14)">
        <path fill="#F7F8F4" d="M30 0H153Q183 0 183 30V59H46Q20 59 20 85V169H130L110 189H30Q0 189 0 159V30Q0 0 30 0Z" />
        <circle cx="30" cy="25" r="8" fill="#102F29" />
        <circle cx="55" cy="25" r="8" fill="#102F29" />
        <path fill="#39D79B" d="M92 195C120 176 147 141 170 98L183 66V138C191 152 204 160 225 165C203 170 190 184 183 208C174 186 160 174 139 169C155 158 167 145 173 124C153 156 125 181 92 195Z" />
      </g>
    </svg>
  );
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d`;
  return new Date(d).toLocaleDateString("pt-BR");
}
