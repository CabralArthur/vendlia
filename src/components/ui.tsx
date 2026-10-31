import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { LeadStage } from "@/server/db/schema";
import { STAGE_LABEL, INTENT_LABEL } from "@/lib/labels";
export { STAGE_LABEL, INTENT_LABEL };
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export const cx = clsx;

/* ───────────── Layout ───────────── */

export function Card({
  children,
  className,
  title,
  description,
  action,
  tour,
  flush,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tour?: string;
  /** Remove body padding (tables, iframes). */
  flush?: boolean;
}) {
  return (
    <section className={cx("panel", className)} data-tour={tour}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold leading-6">{title}</h2>
            {description && <p className="muted mt-0.5 text-[0.8125rem]">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-7">
      {back && <div className="mb-3 text-[0.8125rem]">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          {subtitle && <div className="muted mt-1.5 text-sm">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cx("panel px-4 py-3.5", emphasis && "border-forest bg-forest text-paper")}>
      <div className={cx("text-[0.8125rem] font-medium", emphasis ? "text-paper/70" : "muted")}>{label}</div>
      <div className="mt-1 text-[1.625rem] font-bold leading-tight tracking-[-0.02em] tabular-nums">{value}</div>
      {hint && <div className={cx("mt-0.5 text-xs", emphasis ? "text-paper/60" : "muted")}>{hint}</div>}
    </div>
  );
}

/* ───────────── Feedback ───────────── */

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "dark" | "signal";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--line)]",
    green: "bg-[var(--ok-bg)] text-[var(--ok)] ring-[#abefc6]",
    amber: "bg-[var(--warn-bg)] text-[var(--warn)] ring-[#fedf89]",
    red: "bg-[var(--danger-bg)] text-[var(--danger)] ring-[#fecdca]",
    blue: "bg-[var(--info-bg)] text-[var(--info)] ring-[#b2ddff]",
    dark: "bg-forest text-paper ring-forest",
    signal: "bg-mint text-forest ring-mint",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[0.75rem] font-semibold leading-4 ring-1 ring-inset", tones[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; title?: ReactNode }) {
  const map = {
    info: { cls: "bg-[var(--info-bg)] border-[#b2ddff] text-[#1849a9]", Icon: Info },
    warn: { cls: "bg-[var(--warn-bg)] border-[#fedf89] text-[var(--warn)]", Icon: AlertTriangle },
    error: { cls: "bg-[var(--danger-bg)] border-[#fecdca] text-[var(--danger)]", Icon: XCircle },
    ok: { cls: "bg-[var(--ok-bg)] border-[#abefc6] text-[var(--ok)]", Icon: CheckCircle2 },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-[0.8125rem] leading-5", map.cls)}>
      <map.Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">{icon}</div>}
      <div className="text-[0.9375rem] font-semibold">{title}</div>
      {children && <div className="muted mt-1 max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ───────────── Forms ───────────── */

export function Field({
  label,
  children,
  hint,
  error,
  required,
  optional,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]" aria-hidden>*</span>}
        {optional && <span className="subtle ml-1 font-normal">(opcional)</span>}
      </span>
      {children}
      {error ? <span className="error-text block">{error}</span> : hint ? <span className="hint block">{hint}</span> : null}
    </label>
  );
}

export function Check({ name, label, description, defaultChecked, disabled }: { name: string; label: ReactNode; description?: ReactNode; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start gap-2.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5" />
      <span className="text-sm leading-5">
        <span className="font-medium">{label}</span>
        {description && <span className="muted mt-0.5 block text-[0.8125rem]">{description}</span>}
      </span>
    </label>
  );
}

/* ───────────── Domain labels (PT-BR) ───────────── */


export function StageBadge({ stage }: { stage: LeadStage }) {
  const tone: Tone =
    stage === "won" ? "green" : stage === "lost" || stage === "do_not_contact" ? "red" : ["interested", "negotiation", "proposal_sent"].includes(stage) ? "amber" : ["replied", "contacted", "ready_to_contact"].includes(stage) ? "blue" : "neutral";
  return <Badge tone={tone}>{STAGE_LABEL[stage]}</Badge>;
}


export const CONVERSATION_LABEL: Record<string, string> = {
  AI_ACTIVE: "Automático",
  HUMAN_REQUESTED: "Precisa de você",
  HUMAN_ASSIGNED: "Atribuída",
  HUMAN_ACTIVE: "Com você",
  RESOLVED: "Encerrada",
};

export const INSTANCE_LABEL: Record<string, [string, Tone]> = {
  open: ["Conectado", "green"],
  connecting: ["Aguardando QR code", "amber"],
  created: ["Aguardando QR code", "amber"],
  close: ["Desconectado", "red"],
  banned: ["Bloqueado", "red"],
};

export const SITE_STATUS_LABEL: Record<string, [string, Tone]> = {
  draft: ["Rascunho", "neutral"],
  preview: ["Prévia", "neutral"],
  approved: ["Aprovado", "blue"],
  published: ["No ar", "green"],
  unpublished: ["Fora do ar", "red"],
};

export const ROLE_LABEL: Record<string, string> = { owner: "Dono", admin: "Admin", operator: "Operador" };

export const PERMISSION_LABEL: Record<string, string> = {
  unknown: "Não verificado",
  public_business: "Telefone comercial público",
  opt_in: "Autorizou contato",
  opted_out: "Pediu para não ser contatado",
};

export function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? "var(--color-mint-600)" : score >= 45 ? "#dc9a0f" : "#b7c0b6";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums" title={`Nota ${score} de 100`}>
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
      </span>
      <span className="text-[0.8125rem] font-semibold">{score}</span>
    </span>
  );
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
      <text x="284" y="193" fill={ink} fontFamily="'Plus Jakarta Sans Variable', Arial, sans-serif" fontSize="170" fontWeight="750" letterSpacing="-9">
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
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return new Date(d).toLocaleDateString("pt-BR");
}
