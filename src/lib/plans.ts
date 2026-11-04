/** Subscription plans (shared by the sales page, the app and the billing code). Prices in BRL. */
export type PlanId = "trial" | "inicial" | "pro" | "agencia";
export type Cycle = "monthly" | "quarterly" | "yearly";
export type QuotaKind = "site" | "search" | "logo";

export type Plan = {
  id: PlanId;
  name: string;
  monthly: number; // BRL per month on the monthly cycle
  tagline: string;
  sites: number; // AI-designed sites per month
  searches: number; // searches (up to 60 companies each) per month
  logos: number;
  numbers: number; // WhatsApp numbers
  outreach: boolean; // automatic WhatsApp sending
  customDomain: boolean;
  highlight?: boolean;
};

export const TRIAL_DAYS = 7;

export const PLANS: Record<PlanId, Plan> = {
  trial: { id: "trial", name: "Teste grátis", monthly: 0, tagline: "7 dias para ver funcionando", sites: 1, searches: 3, logos: 1, numbers: 0, outreach: false, customDomain: false },
  inicial: { id: "inicial", name: "Inicial", monthly: 97, tagline: "Para fechar os primeiros sites", sites: 15, searches: 20, logos: 3, numbers: 1, outreach: true, customDomain: false },
  pro: { id: "pro", name: "Pro", monthly: 197, tagline: "Para quem prospecta toda semana", sites: 30, searches: 40, logos: 10, numbers: 1, outreach: true, customDomain: true, highlight: true },
  agencia: { id: "agencia", name: "Agência", monthly: 397, tagline: "Para equipes e vários números", sites: 70, searches: 80, logos: 30, numbers: 3, outreach: true, customDomain: true },
};

export const PAID_PLANS: PlanId[] = ["inicial", "pro", "agencia"];

export const CYCLES: Record<Cycle, { label: string; months: number; discount: number; asaas: "MONTHLY" | "QUARTERLY" | "YEARLY" }> = {
  monthly: { label: "Mensal", months: 1, discount: 0, asaas: "MONTHLY" },
  quarterly: { label: "Trimestral", months: 3, discount: 0.1, asaas: "QUARTERLY" },
  yearly: { label: "Anual", months: 12, discount: 0.2, asaas: "YEARLY" },
};

/** Extra AI sites sold as a one-off pack when the monthly quota runs out. */
export const SITE_PACK = { sites: 10, price: 39 };

/** Price charged per cycle (rounded to cents) and the equivalent per month. */
export function priceFor(plan: PlanId, cycle: Cycle) {
  const p = PLANS[plan];
  const c = CYCLES[cycle];
  const perMonth = Math.round(p.monthly * (1 - c.discount) * 100) / 100;
  return { perMonth, total: Math.round(perMonth * c.months * 100) / 100 };
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 ? 2 : 0 });

export const QUOTA_LABEL: Record<QuotaKind, [string, string]> = { site: ["site com IA", "sites com IA"], search: ["busca", "buscas"], logo: ["logo", "logos"] };
