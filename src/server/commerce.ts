import { and, desc, eq, lt, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  businesses,
  customers,
  leads,
  payments,
  products,
  proposals,
  providerEvents,
  subscriptions,
  websites,
} from "./db";
import { env } from "./env";
import { enqueue, QUEUES } from "./queue";
import { advanceStage, audit, logLeadEvent, notify, setStage } from "./events";
import { AsaasClient, isoDate, isValidCpfCnpj, PAID_STATUSES, type AsaasPayment } from "./payments/asaas";
import { randomToken, formatBRL, onlyDigits } from "@/lib/text";
import { normalizeBrPhone } from "@/lib/phone";

export function proposalUrl(token: string) {
  return `${env().APP_URL.replace(/\/$/, "")}/p/${token}`;
}

export function siteUrls(site: { slug: string; customDomain: string | null }) {
  const e = env();
  const urls = [`${e.APP_URL.replace(/\/$/, "")}/s/${site.slug}`];
  if (e.SITES_BASE_DOMAIN) urls.unshift(`https://${site.slug}.${e.SITES_BASE_DOMAIN}`);
  if (site.customDomain) urls.unshift(`https://${site.customDomain}`);
  return urls;
}

/* ------------------------------- Proposals ------------------------------- */

export async function createProposal(
  orgId: string,
  input: { leadId: string; productId: string; setupPriceCents?: number; monthlyPriceCents?: number; notes?: string; validDays?: number },
  actorId: string,
) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, input.leadId), eq(leads.orgId, orgId)));
  if (!lead) throw new Error("Lead não encontrado");
  const [product] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.orgId, orgId)));
  if (!product) throw new Error("Plano não encontrado");
  const open = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.leadId, lead.id), sql`${proposals.status} in ('sent','viewed','accepted')`));
  // Avoid conflicting offers: cancel previous open proposals for this lead.
  for (const p of open) await db.update(proposals).set({ status: "canceled" }).where(eq(proposals.id, p.id));
  const [site] = await db.select().from(websites).where(eq(websites.leadId, lead.id)).orderBy(desc(websites.createdAt)).limit(1);
  const setup = input.setupPriceCents ?? product.setupPriceCents;
  const monthly = input.monthlyPriceCents ?? product.monthlyPriceCents;
  if (setup < 0 || monthly < 0) throw new Error("Valores inválidos");
  const [p] = await db
    .insert(proposals)
    .values({
      orgId,
      leadId: lead.id,
      websiteId: site?.id ?? null,
      productId: product.id,
      token: randomToken(12),
      setupPriceCents: setup,
      monthlyPriceCents: monthly,
      notes: input.notes?.slice(0, 2000) || null,
      expiresAt: new Date(Date.now() + (input.validDays ?? 7) * 86400_000),
    })
    .returning();
  await logLeadEvent(orgId, lead.id, "proposal", `Proposta criada: ${product.name} — ${formatBRL(setup)} + ${formatBRL(monthly)}/mês`, { proposalId: p!.id }, actorId);
  await advanceStage(orgId, lead.id, "proposal_sent", actorId);
  if (open.length) await logLeadEvent(orgId, lead.id, "proposal", `${open.length} proposta(s) anterior(es) cancelada(s)`, null, actorId);
  return p!;
}

export async function loadProposalByToken(token: string) {
  const [row] = await db
    .select({ proposal: proposals, product: products, lead: leads, business: businesses })
    .from(proposals)
    .innerJoin(products, eq(products.id, proposals.productId))
    .innerJoin(leads, eq(leads.id, proposals.leadId))
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(eq(proposals.token, token));
  if (!row) return null;
  const site = row.proposal.websiteId ? (await db.select().from(websites).where(eq(websites.id, row.proposal.websiteId)))[0] : undefined;
  const pays = await db.select().from(payments).where(eq(payments.proposalId, row.proposal.id)).orderBy(desc(payments.createdAt));
  return { ...row, site, payments: pays };
}

export async function markProposalViewed(token: string) {
  const [p] = await db
    .update(proposals)
    .set({ status: "viewed" })
    .where(and(eq(proposals.token, token), eq(proposals.status, "sent")))
    .returning();
  if (p) {
    await logLeadEvent(p.orgId, p.leadId, "proposal", "Cliente abriu a proposta");
    await notify(p.orgId, { type: "proposal_viewed", title: "Proposta visualizada", body: "O cliente abriu a proposta agora.", link: `/leads/${p.leadId}` });
  }
}

export async function approveContent(token: string) {
  const [p] = await db.select().from(proposals).where(eq(proposals.token, token));
  if (!p) throw new Error("Proposta não encontrada");
  if (p.clientApprovedContentAt) return p;
  const [u] = await db.update(proposals).set({ clientApprovedContentAt: new Date() }).where(eq(proposals.id, p.id)).returning();
  if (p.websiteId) {
    const [site] = await db.select().from(websites).where(eq(websites.id, p.websiteId));
    if (site) {
      await db.update(websites).set({ status: site.status === "published" ? "published" : "approved", content: { ...site.content, pendingReview: [] } }).where(eq(websites.id, site.id));
    }
  }
  await logLeadEvent(p.orgId, p.leadId, "approval", "Cliente aprovou o conteúdo do site");
  await notify(p.orgId, { type: "content_approved", title: "Conteúdo aprovado pelo cliente", body: "O cliente aprovou o site.", link: `/leads/${p.leadId}` });
  if (p.status === "paid") await tryAutoPublish(p.id);
  return u!;
}

export type CheckoutInput = { name: string; document: string; email: string; phone?: string; approveContent: boolean; acceptTerms: boolean };

/** Client-side checkout: creates the customer, the setup charge and the monthly subscription at Asaas. */
export async function checkoutProposal(token: string, input: CheckoutInput, fetchImpl?: typeof fetch): Promise<{ redirectUrl: string }> {
  const data = await loadProposalByToken(token);
  if (!data) throw new Error("Proposta não encontrada");
  const { proposal, product, business } = data;
  if (["canceled", "expired"].includes(proposal.status)) throw new Error("Esta proposta não está mais disponível.");
  if (proposal.expiresAt < new Date() && proposal.status !== "accepted" && proposal.status !== "paid") {
    await db.update(proposals).set({ status: "expired" }).where(eq(proposals.id, proposal.id));
    throw new Error("Esta proposta expirou. Peça uma nova ao atendente.");
  }
  if (!input.acceptTerms) throw new Error("É preciso aceitar a proposta.");
  const doc = onlyDigits(input.document);
  if (!isValidCpfCnpj(doc)) throw new Error("CPF ou CNPJ inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("E-mail inválido.");
  if (input.name.trim().length < 3) throw new Error("Informe o nome completo ou razão social.");

  const pending = data.payments.find((p) => p.kind === "setup" && p.status === "pending" && p.invoiceUrl);
  if (pending) {
    if (input.approveContent) await approveContent(token);
    return { redirectUrl: pending.invoiceUrl! };
  }
  if (data.payments.some((p) => p.kind === "setup" && p.status === "confirmed")) return { redirectUrl: proposalUrl(token) };

  if (!AsaasClient.configured()) throw new Error("Pagamento online indisponível no momento. Fale com o atendente para pagar via Pix.");
  const asaas = AsaasClient.fromEnv(fetchImpl);
  const phone = normalizeBrPhone(input.phone ?? business.phoneE164 ?? "");
  const ac = await asaas.createCustomer({
    name: input.name.trim(),
    cpfCnpj: doc,
    email: input.email.trim(),
    mobilePhone: phone ? phone.slice(2) : undefined,
    externalReference: proposal.leadId,
  });
  const [cust] = await db
    .insert(customers)
    .values({ orgId: proposal.orgId, leadId: proposal.leadId, name: input.name.trim(), document: doc, email: input.email.trim(), phone, providerCustomerId: ac.id })
    .returning();
  const due = isoDate(new Date(Date.now() + 2 * 86400_000));
  const setupCharge = await asaas.createPayment({
    customer: ac.id,
    value: proposal.setupPriceCents / 100,
    dueDate: due,
    description: `${product.name} — implantação do site (${business.name})`,
    externalReference: `proposal:${proposal.id}:setup`,
  });
  await db.insert(payments).values({
    orgId: proposal.orgId,
    proposalId: proposal.id,
    customerId: cust!.id,
    kind: "setup",
    provider: "asaas",
    providerPaymentId: setupCharge.id,
    amountCents: proposal.setupPriceCents,
    invoiceUrl: setupCharge.invoiceUrl ?? null,
    dueDate: due,
  });
  if (proposal.monthlyPriceCents > 0) {
    const sub = await asaas.createSubscription({
      customer: ac.id,
      value: proposal.monthlyPriceCents / 100,
      nextDueDate: isoDate(new Date(Date.now() + 30 * 86400_000)),
      description: `${product.name} — hospedagem e manutenção (${business.name})`,
      externalReference: `proposal:${proposal.id}:monthly`,
    });
    await db.insert(subscriptions).values({
      orgId: proposal.orgId,
      customerId: cust!.id,
      proposalId: proposal.id,
      websiteId: proposal.websiteId,
      provider: "asaas",
      providerSubscriptionId: sub.id,
      amountCents: proposal.monthlyPriceCents,
      status: "active",
      nextDueDate: sub.nextDueDate,
    });
  }
  await db.update(proposals).set({ status: "accepted", acceptedAt: new Date() }).where(eq(proposals.id, proposal.id));
  if (input.approveContent) await approveContent(token);
  await logLeadEvent(proposal.orgId, proposal.leadId, "checkout", "Cliente aceitou a proposta e gerou a cobrança");
  await notify(proposal.orgId, {
    type: "proposal_accepted",
    title: `💳 ${business.name} aceitou a proposta`,
    body: `Cobrança de ${formatBRL(proposal.setupPriceCents)} gerada. Aguardando pagamento.`,
    link: `/leads/${proposal.leadId}`,
    priority: "high",
  });
  await advanceStage(proposal.orgId, proposal.leadId, "negotiation");
  if (!setupCharge.invoiceUrl) throw new Error("O provedor não retornou o link de pagamento.");
  return { redirectUrl: setupCharge.invoiceUrl };
}

/* --------------------------- Payment confirmation -------------------------- */

async function onSetupPaid(proposalId: string) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!p || p.status === "paid") return;
  await db.update(proposals).set({ status: "paid", paidAt: new Date() }).where(eq(proposals.id, p.id));
  await setStage(p.orgId, p.leadId, "won");
  await logLeadEvent(p.orgId, p.leadId, "payment", `Pagamento confirmado: ${formatBRL(p.setupPriceCents)}`);
  const [b] = await db.select({ name: businesses.name }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(eq(leads.id, p.leadId));
  await notify(p.orgId, {
    type: "payment_confirmed",
    title: `✅ Venda fechada: ${b?.name ?? "cliente"}`,
    body: `${formatBRL(p.setupPriceCents)} confirmado.${p.clientApprovedContentAt ? " Publicando o site." : " Aguardando aprovação do conteúdo para publicar."}`,
    link: `/leads/${p.leadId}`,
    priority: "high",
  });
  await tryAutoPublish(p.id);
}

/** Registers a payment received outside the gateway (e.g. Pix direto). Owner/admin only — audited. */
export async function markSetupPaidManually(orgId: string, proposalId: string, actorId: string, note: string) {
  const [p] = await db.select().from(proposals).where(and(eq(proposals.id, proposalId), eq(proposals.orgId, orgId)));
  if (!p) throw new Error("Proposta não encontrada");
  if (note.trim().length < 5) throw new Error("Descreva o comprovante (ex.: Pix ID).");
  await audit(orgId, actorId, "payment.manual_confirm", proposalId, { note });
  await onSetupPaid(p.id);
}

async function tryAutoPublish(proposalId: string) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!p?.websiteId || p.status !== "paid" || !p.clientApprovedContentAt) return;
  await publishWebsite(p.orgId, p.websiteId, null);
}

export async function intakeAsaasWebhook(token: string | null, payload: { id?: string; event?: string; payment?: AsaasPayment; [k: string]: unknown }) {
  const expected = env().ASAAS_WEBHOOK_TOKEN;
  if (!expected) return { status: 503, body: "webhook não configurado" };
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401, body: "token inválido" };
  if (!payload?.event) return { status: 400, body: "payload inválido" };
  const eventId = payload.id ?? `${payload.event}:${payload.payment?.id ?? ""}:${payload.payment?.status ?? ""}`;
  const [ev] = await db
    .insert(providerEvents)
    .values({ provider: "asaas", eventId, type: payload.event, payload: payload as object })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id });
  if (!ev) return { status: 200, body: "duplicado" };
  await enqueue(QUEUES.payments, "asaas", { providerEventId: ev.id }, { jobId: `pay-${ev.id}` });
  return { status: 200, body: "ok" };
}

export async function processAsaasEvent(providerEventId: string, fetchImpl?: typeof fetch) {
  const [ev] = await db.select().from(providerEvents).where(eq(providerEvents.id, providerEventId));
  if (!ev || ev.processedAt) return;
  const payload = ev.payload as { event: string; payment?: AsaasPayment; subscription?: { id: string } };
  const pay = payload.payment;

  if (pay) {
    // Never trust the webhook body alone: re-read the payment from the provider.
    const live = AsaasClient.configured() ? await AsaasClient.fromEnv(fetchImpl).getPayment(pay.id) : pay;
    const [local] = await db.select().from(payments).where(eq(payments.providerPaymentId, live.id));

    if (!local && live.subscription) {
      // Monthly charge generated by the subscription.
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, live.subscription));
      if (sub) {
        await db
          .insert(payments)
          .values({
            orgId: sub.orgId,
            proposalId: sub.proposalId,
            customerId: sub.customerId,
            kind: "monthly",
            provider: "asaas",
            providerPaymentId: live.id,
            providerSubscriptionId: live.subscription,
            amountCents: Math.round(live.value * 100),
            invoiceUrl: live.invoiceUrl ?? null,
            dueDate: live.dueDate ?? null,
          })
          .onConflictDoNothing();
      }
    }
    const [row] = await db.select().from(payments).where(eq(payments.providerPaymentId, live.id));
    if (row) {
      let status: typeof row.status = row.status;
      if (PAID_STATUSES.has(live.status)) status = "confirmed";
      else if (live.status === "OVERDUE") status = "overdue";
      else if (live.status === "REFUNDED") status = "refunded";
      else if (payload.event === "PAYMENT_DELETED") status = "canceled";
      if (status !== row.status) {
        await db
          .update(payments)
          .set({ status, paidAt: status === "confirmed" ? new Date() : row.paidAt })
          .where(eq(payments.id, row.id));
      }
      if (status === "confirmed" && row.kind === "setup") await onSetupPaid(row.proposalId);
      if (row.kind === "monthly" && row.providerSubscriptionId) {
        const subStatus = status === "overdue" ? "overdue" : status === "confirmed" ? "active" : undefined;
        if (subStatus) await db.update(subscriptions).set({ status: subStatus }).where(eq(subscriptions.providerSubscriptionId, row.providerSubscriptionId));
        if (status === "overdue") {
          await notify(row.orgId, { type: "overdue", title: "Mensalidade em atraso", body: `Cobrança ${formatBRL(row.amountCents)} venceu.`, link: "/finance", priority: "high" });
        }
      }
      if (status === "refunded") {
        await notify(row.orgId, { type: "refund", title: "Pagamento estornado", body: `${formatBRL(row.amountCents)} foi estornado.`, link: "/finance", priority: "high" });
      }
    }
  }
  if (payload.event?.startsWith("SUBSCRIPTION_") && payload.subscription?.id && /DELETED|INACTIVATED/.test(payload.event)) {
    await db.update(subscriptions).set({ status: "canceled", canceledAt: new Date() }).where(eq(subscriptions.providerSubscriptionId, payload.subscription.id));
  }
  await db.update(providerEvents).set({ processedAt: new Date() }).where(eq(providerEvents.id, ev.id));
}

/* -------------------------------- Publishing ------------------------------- */

export async function publishWebsite(orgId: string, siteId: string, actorId: string | null, override?: { reason: string }) {
  const [site] = await db.select().from(websites).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId)));
  if (!site) throw new Error("Site não encontrado");
  const [p] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.websiteId, siteId), eq(proposals.status, "paid")))
    .orderBy(desc(proposals.paidAt))
    .limit(1);
  if (!override) {
    if (!p) throw new Error("Publicação exige pagamento confirmado.");
    if (!p.clientApprovedContentAt) throw new Error("Publicação exige aprovação do conteúdo pelo cliente.");
  } else {
    if (override.reason.trim().length < 10) throw new Error("Explique a aprovação externa (mín. 10 caracteres).");
    await audit(orgId, actorId, "site.publish_override", siteId, override);
  }
  await db
    .update(websites)
    .set({ status: "published", publishedVersion: site.version, publishedAt: new Date(), content: { ...site.content, pendingReview: [] } })
    .where(eq(websites.id, siteId));
  await logLeadEvent(orgId, site.leadId, "published", `Site publicado (v${site.version})`, { urls: siteUrls(site) }, actorId);
  await notify(orgId, { type: "published", title: "Site publicado", body: siteUrls(site)[0]!, link: `/studio/${siteId}` });
}

export async function unpublishWebsite(orgId: string, siteId: string, actorId: string | null, reason: string) {
  const [site] = await db.update(websites).set({ status: "unpublished" }).where(and(eq(websites.id, siteId), eq(websites.orgId, orgId))).returning();
  if (site) await logLeadEvent(orgId, site.leadId, "unpublished", `Site despublicado: ${reason}`, null, actorId);
}

/** Suspends published sites whose subscription has been overdue for more than `graceDays`. */
export async function suspendOverdueSites(graceDays = 15) {
  const cutoff = isoDate(new Date(Date.now() - graceDays * 86400_000));
  const rows = await db
    .select({ orgId: payments.orgId, siteId: subscriptions.websiteId })
    .from(payments)
    .innerJoin(subscriptions, eq(subscriptions.providerSubscriptionId, payments.providerSubscriptionId))
    .innerJoin(websites, eq(websites.id, subscriptions.websiteId))
    .where(and(eq(payments.status, "overdue"), lt(payments.dueDate, cutoff), eq(websites.status, "published")));
  for (const r of rows) if (r.siteId) await unpublishWebsite(r.orgId, r.siteId, null, `Mensalidade em atraso há mais de ${graceDays} dias`);
  return rows.length;
}
