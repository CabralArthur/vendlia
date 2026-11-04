import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, organizations, usageRecords, whatsappInstances, providerEvents, users } from "../db";
import { env } from "../env";
import { PLANS, CYCLES, TRIAL_DAYS, SITE_PACK, priceFor, QUOTA_LABEL, type Cycle, type PlanId, type QuotaKind } from "@/lib/plans";
import { AsaasClient, PAID_STATUSES, isoDate, isValidCpfCnpj, type AsaasPayment } from "./asaas";
import { isDemoInstance } from "@/lib/demo";

/**
 * Plans, access and monthly quotas for each account (organization).
 * Quotas are counted from `usage_records` rows of kind quota_site / quota_search / quota_logo,
 * inside the current monthly window (anniversary of the period start).
 */

export type Org = typeof organizations.$inferSelect;
export class QuotaError extends Error {}

const DAY = 86_400_000;
const GRACE_DAYS = 5;

export async function getOrg(orgId: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!o) throw new Error("Conta não encontrada");
  return o;
}

export function trialEnd(o: Org) {
  return o.trialEndsAt ?? new Date(o.createdAt.getTime() + TRIAL_DAYS * DAY);
}

export function isOwnerEmail(email: string | null | undefined) {
  const list = env()
    .OWNER_EMAILS.split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** Can this account use paid features (search, AI, sending) right now? */
export function access(o: Org, now = new Date()): { ok: boolean; reason?: string } {
  if (o.unlimited) return { ok: true };
  if (o.plan === "trial") {
    if (now < trialEnd(o)) return { ok: true };
    if (o.billingStatus === "pending") return { ok: false, reason: "Estamos aguardando a confirmação do pagamento. Assim que o Asaas confirmar, tudo é liberado." };
    return { ok: false, reason: "Seu teste grátis terminou. Escolha um plano para continuar." };
  }
  if (o.billingStatus === "active") return { ok: true };
  const end = o.currentPeriodEnd?.getTime() ?? 0;
  if (o.billingStatus === "past_due" && now.getTime() < end + GRACE_DAYS * DAY) return { ok: true };
  if (o.billingStatus === "canceled" && now.getTime() < end) return { ok: true };
  if (o.billingStatus === "pending") return { ok: false, reason: "Estamos aguardando a confirmação do pagamento. Assim que o Asaas confirmar, tudo é liberado." };
  return { ok: false, reason: "Sua assinatura não está ativa. Escolha um plano para continuar." };
}

/** Start of the current monthly quota window. */
export function windowStart(o: Org, now = new Date()) {
  if (o.plan === "trial") return o.createdAt;
  const anchor = o.periodStart ?? o.createdAt;
  const d = new Date(anchor);
  // Move the anchor forward month by month while staying in the past.
  let months = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
  const at = (m: number) => {
    const r = new Date(d);
    r.setUTCMonth(d.getUTCMonth() + m);
    return r;
  };
  while (months > 0 && at(months) > now) months--;
  return at(Math.max(0, months));
}

export async function usage(o: Org, now = new Date()) {
  const since = windowStart(o, now);
  const rows = await db
    .select({ kind: usageRecords.kind, n: sql<number>`count(*)::int` })
    .from(usageRecords)
    .where(and(eq(usageRecords.orgId, o.id), gte(usageRecords.createdAt, since), inArray(usageRecords.kind, ["quota_site", "quota_search", "quota_logo"])))
    .groupBy(usageRecords.kind);
  const get = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
  return { since, site: get("quota_site"), search: get("quota_search"), logo: get("quota_logo") };
}

export async function quotaStatus(orgId: string, now = new Date()) {
  const o = await getOrg(orgId);
  const plan = PLANS[o.plan as PlanId];
  const u = await usage(o, now);
  const limit = { site: plan.sites, search: plan.searches, logo: plan.logos };
  return { org: o, plan, used: u, limit, extraSites: o.extraSites, access: access(o, now), unlimited: o.unlimited };
}

/** Throws a friendly QuotaError when the account can't do one more `kind` now. */
export async function assertQuota(orgId: string, kind: QuotaKind) {
  const q = await quotaStatus(orgId);
  if (q.unlimited) return;
  if (!q.access.ok) throw new QuotaError(q.access.reason);
  const used = q.used[kind];
  const lim = q.limit[kind] + (kind === "site" ? q.extraSites : 0);
  if (used >= lim) {
    const [one, many] = QUOTA_LABEL[kind];
    const where = q.plan.id === "trial" ? "no teste grátis" : `no plano ${q.plan.name} este mês`;
    const extra = kind === "site" && q.plan.id !== "trial" ? ` Compre um pacote de ${SITE_PACK.sites} sites ou mude de plano.` : " Mude de plano para continuar.";
    throw new QuotaError(`Você já usou ${lim === 1 ? `o ${one}` : `os ${lim} ${many}`} ${where}.${extra}`);
  }
}

/** Records one unit of quota use. Extra (pack) sites are spent once the monthly quota is used up. */
export async function consumeQuota(orgId: string, kind: QuotaKind, now = new Date()) {
  await db.insert(usageRecords).values({ orgId, kind: `quota_${kind}`, costMicros: 0, createdAt: now });
  if (kind !== "site") return;
  const q = await quotaStatus(orgId, now);
  if (!q.unlimited && q.used.site > q.limit.site && q.extraSites > 0) {
    await db.update(organizations).set({ extraSites: sql`greatest(${organizations.extraSites} - 1, 0)` }).where(eq(organizations.id, orgId));
  }
}

export async function assertCanAddNumber(orgId: string) {
  const o = await getOrg(orgId);
  if (o.unlimited) return;
  const a = access(o);
  if (!a.ok) throw new QuotaError(a.reason);
  const plan = PLANS[o.plan as PlanId];
  const list = await db.select({ name: whatsappInstances.name }).from(whatsappInstances).where(eq(whatsappInstances.orgId, orgId));
  const n = list.filter((i) => !isDemoInstance(i.name)).length;
  if (plan.numbers === 0) throw new QuotaError("O teste grátis não conecta número de WhatsApp. Use “Copiar mensagem” ou “Abrir no WhatsApp” na página do lead, ou escolha um plano.");
  if (n >= plan.numbers) throw new QuotaError(`O plano ${plan.name} permite ${plan.numbers} ${plan.numbers === 1 ? "número" : "números"}. Mude para o plano Agência para conectar mais.`);
}

export async function assertCanSend(orgId: string) {
  const o = await getOrg(orgId);
  if (o.unlimited) return;
  const a = access(o);
  if (!a.ok) throw new QuotaError(a.reason);
  if (!PLANS[o.plan as PlanId].outreach) throw new QuotaError("O envio automático é dos planos pagos. No teste, use “Copiar mensagem” ou “Abrir no WhatsApp” na página do lead.");
}

/* ------------------------------- Checkout ------------------------------- */

export function asaasConfigured() {
  return AsaasClient.configured();
}

/**
 * Creates (or replaces) the Asaas subscription and returns the URL of the first invoice,
 * where the customer pays by PIX, boleto or card. Access is released by the webhook.
 */
export async function startCheckout(
  orgId: string,
  input: { plan: PlanId; cycle: Cycle; name: string; email: string; cpfCnpj: string; phone?: string },
  client = AsaasClient.fromEnv(),
) {
  if (input.plan === "trial" || !PLANS[input.plan]) throw new Error("Plano inválido");
  if (!CYCLES[input.cycle]) throw new Error("Periodicidade inválida");
  const doc = input.cpfCnpj.replace(/\D/g, "");
  if (!isValidCpfCnpj(doc)) throw new Error("CPF ou CNPJ inválido");
  const o = await getOrg(orgId);
  let customer = o.asaasCustomerId;
  if (!customer) {
    const c = await client.createCustomer({ name: input.name.trim(), email: input.email.trim(), cpfCnpj: doc, mobilePhone: input.phone?.replace(/\D/g, "") || undefined, externalReference: `org:${orgId}` });
    customer = c.id;
  }
  if (o.asaasSubscriptionId) await client.cancelSubscription(o.asaasSubscriptionId).catch(() => null);
  const { total } = priceFor(input.plan, input.cycle);
  const sub = await client.createSubscription({
    customer,
    value: total,
    nextDueDate: isoDate(new Date()),
    description: `Vendlia ${PLANS[input.plan].name} (${CYCLES[input.cycle].label.toLowerCase()})`,
    externalReference: `sub:${orgId}:${input.plan}:${input.cycle}`,
    cycle: CYCLES[input.cycle].asaas,
  });
  await db
    .update(organizations)
    .set({
      asaasCustomerId: customer,
      asaasSubscriptionId: sub.id,
      pendingPlan: input.plan,
      pendingCycle: input.cycle,
      // A running trial or an active plan keeps working until the new charge is paid; otherwise the account waits for it.
      billingStatus: (o.plan === "trial" && access(o).ok) || o.billingStatus === "active" || o.billingStatus === "past_due" ? o.billingStatus : "pending",
    })
    .where(eq(organizations.id, orgId));
  const payments = await client.subscriptionPayments(sub.id);
  const first = payments.data.find((p) => !PAID_STATUSES.has(p.status)) ?? payments.data[0];
  if (!first?.invoiceUrl) throw new Error("O Asaas não devolveu o link de pagamento. Tente de novo em instantes.");
  return first.invoiceUrl;
}

/** One-off pack of extra AI sites. */
export async function buySitePack(orgId: string, client = AsaasClient.fromEnv()) {
  const o = await getOrg(orgId);
  if (!o.asaasCustomerId) throw new Error("Assine um plano antes de comprar pacotes.");
  const p = await client.createPayment({
    customer: o.asaasCustomerId,
    value: SITE_PACK.price,
    dueDate: isoDate(new Date(Date.now() + 2 * DAY)),
    description: `Vendlia: pacote de ${SITE_PACK.sites} sites com IA`,
    externalReference: `pack:${orgId}:${SITE_PACK.sites}`,
  });
  if (!p.invoiceUrl) throw new Error("O Asaas não devolveu o link de pagamento.");
  return p.invoiceUrl;
}

export async function cancelSubscription(orgId: string, client = AsaasClient.fromEnv()) {
  const o = await getOrg(orgId);
  if (o.asaasSubscriptionId) await client.cancelSubscription(o.asaasSubscriptionId).catch(() => null);
  await db.update(organizations).set({ billingStatus: "canceled", asaasSubscriptionId: null, pendingPlan: null, pendingCycle: null }).where(eq(organizations.id, orgId));
}

/* -------------------------------- Webhook -------------------------------- */

type AsaasEvent = { id?: string; event: string; payment?: AsaasPayment; subscription?: { id: string; externalReference?: string | null } };

function addMonths(d: Date, m: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + m);
  return r;
}

/** Applies one Asaas webhook event. Idempotent by event id (provider_events). */
export async function handleAsaasEvent(ev: AsaasEvent, now = new Date()) {
  const key = ev.id ?? `${ev.event}:${ev.payment?.id ?? ev.subscription?.id ?? ""}:${ev.payment?.status ?? ""}`;
  const inserted = await db
    .insert(providerEvents)
    .values({ provider: "asaas", eventId: key, type: ev.event, payload: ev as object })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id });
  if (!inserted.length) return "duplicado";

  const pay = ev.payment;
  const ref = pay?.externalReference ?? ev.subscription?.externalReference ?? "";
  const subId = pay?.subscription ?? ev.subscription?.id ?? null;
  let orgId = ref.split(":")[1];
  if ((!orgId || !/^(sub|pack|org)$/.test(ref.split(":")[0] ?? "")) && subId) {
    const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.asaasSubscriptionId, subId));
    orgId = o?.id;
  }
  if (!orgId) return "sem conta";
  const o = await getOrg(orgId).catch(() => null);
  if (!o) return "sem conta";

  const paid = pay && PAID_STATUSES.has(pay.status) && /PAYMENT_(CONFIRMED|RECEIVED)/.test(ev.event);

  if (ref.startsWith("pack:") && paid) {
    const n = Number(ref.split(":")[2]) || SITE_PACK.sites;
    await db.update(organizations).set({ extraSites: sql`${organizations.extraSites} + ${n}` }).where(eq(organizations.id, orgId));
    return "pacote liberado";
  }

  if (paid && subId && subId === o.asaasSubscriptionId) {
    const [, , planRef, cycleRef] = ref.split(":");
    const plan = (o.pendingPlan ?? planRef ?? o.plan) as PlanId;
    const cycle = (o.pendingCycle ?? cycleRef ?? o.billingCycle ?? "monthly") as Cycle;
    const months = CYCLES[cycle]?.months ?? 1;
    const renewing = o.billingStatus === "active" || o.billingStatus === "past_due";
    const start = renewing && o.currentPeriodEnd && o.currentPeriodEnd > now ? o.currentPeriodEnd : now;
    await db
      .update(organizations)
      .set({
        plan: PLANS[plan] ? plan : o.plan,
        billingCycle: cycle,
        billingStatus: "active",
        // A new plan starts a fresh quota window; a renewal keeps counting monthly from the original anchor.
        periodStart: renewing && plan === o.plan ? (o.periodStart ?? now) : now,
        currentPeriodEnd: addMonths(start, months),
        pendingPlan: null,
        pendingCycle: null,
      })
      .where(eq(organizations.id, orgId));
    return "assinatura ativa";
  }

  if (ev.event === "PAYMENT_OVERDUE" && subId === o.asaasSubscriptionId && o.billingStatus === "active") {
    await db.update(organizations).set({ billingStatus: "past_due" }).where(eq(organizations.id, orgId));
    return "em atraso";
  }
  if (/SUBSCRIPTION_(DELETED|INACTIVATED)/.test(ev.event) && subId === o.asaasSubscriptionId) {
    await db.update(organizations).set({ billingStatus: "canceled", asaasSubscriptionId: null }).where(eq(organizations.id, orgId));
    return "cancelada";
  }
  if (/PAYMENT_(REFUNDED|CHARGEBACK_REQUESTED)/.test(ev.event) && subId === o.asaasSubscriptionId) {
    await db.update(organizations).set({ billingStatus: "canceled", currentPeriodEnd: now }).where(eq(organizations.id, orgId));
    return "estornada";
  }
  return "ignorado";
}

/** Daily: trials that ended become "expired" (only a label; access() already blocks them). */
export async function expireTrials(now = new Date()) {
  await db
    .update(organizations)
    .set({ billingStatus: "expired" })
    .where(and(eq(organizations.plan, "trial"), eq(organizations.billingStatus, "trialing"), eq(organizations.unlimited, false), sql`coalesce(${organizations.trialEndsAt}, ${organizations.createdAt} + interval '${sql.raw(String(TRIAL_DAYS))} days') < ${now.toISOString()}`));
}

/** Owner check by session user. */
export async function isPlatformOwner(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return isOwnerEmail(u?.email);
}

