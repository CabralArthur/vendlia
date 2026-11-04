import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  businesses,
  contactPoints,
  conversations,
  intentClassifications,
  leads,
  messages,
  providerEvents,
  suppressionList,
  websites,
  whatsappInstances,
  users,
  type ConversationState,
  type OrgSettings,
} from "../db";
import { env } from "../env";
import { enqueue, QUEUES } from "../queue";
import { redis } from "../redis";
import { publish } from "../realtime";
import { advanceStage, logLeadEvent, notify, setStage } from "../events";
import { getOrgSettings } from "../org";
import { assertCanSend } from "../billing";
import { outreachEligibility } from "../scoring";
import { classifyMessage } from "../ai/classify";
import { transition, automationMaySpeak } from "../handoff";
import { phoneFromJid, formatBrPhone } from "@/lib/phone";
import { isDemoInstance } from "@/lib/demo";
import { INTENT_LABEL } from "@/lib/labels";
import { EvolutionClient, EvolutionError, extractText, resolveJid, STATUS_MAP, type EvolutionWebhook, type UpsertData } from "./evolution";
import {
  brPhoneVariants,
  effectiveDailyLimit,
  greeting,
  inBusinessHours,
  localDayKey,
  localHourKey,
  nextBusinessOpening,
  randomGapSeconds,
  renderTemplate,
} from "./limits";

export function previewUrl(site: { slug: string; previewToken: string }) {
  return `${env().APP_URL.replace(/\/$/, "")}/s/${site.slug}?k=${site.previewToken}`;
}

/* ------------------------------- Instances ------------------------------- */

export async function pickInstance(orgId: string) {
  const list = await db
    .select()
    .from(whatsappInstances)
    .where(and(eq(whatsappInstances.orgId, orgId), eq(whatsappInstances.status, "open"), eq(whatsappInstances.paused, false)));
  if (!list.length) return null;
  const day = localDayKey(new Date());
  const counts = await Promise.all(list.map((i) => redis().get(`rl:${i.id}:d:${day}`)));
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Number(counts[i] ?? 0) < Number(counts[best] ?? 0)) best = i;
  return list[best]!;
}

async function ensureConversation(orgId: string, instanceId: string, phoneE164: string, opts: { leadId?: string | null; contactName?: string | null; jid?: string }) {
  const variants = brPhoneVariants(phoneE164);
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.instanceId, instanceId), inArray(conversations.phoneE164, variants)))
    .limit(1);
  if (existing) {
    if (!existing.leadId && opts.leadId) await db.update(conversations).set({ leadId: opts.leadId }).where(eq(conversations.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(conversations)
    .values({
      orgId,
      instanceId,
      remoteJid: opts.jid ?? `${phoneE164}@s.whatsapp.net`,
      phoneE164,
      leadId: opts.leadId ?? null,
      contactName: opts.contactName ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.instanceId, instanceId), eq(conversations.remoteJid, opts.jid ?? `${phoneE164}@s.whatsapp.net`)));
  return again!;
}

async function isSuppressed(orgId: string, phoneE164: string) {
  const r = await db
    .select({ id: suppressionList.id })
    .from(suppressionList)
    .where(and(eq(suppressionList.orgId, orgId), inArray(suppressionList.value, brPhoneVariants(phoneE164))))
    .limit(1);
  return r.length > 0;
}

/* -------------------------------- Outbound ------------------------------- */

export type QueueResult = { ok: true; messageId: string } | { ok: false; reason: string };

/** The first-contact text for a lead, as it would be sent (used by "Copiar mensagem"). */
export async function outreachText(orgId: string, leadId: string, actorName?: string) {
  const [row] = await db
    .select({ business: businesses })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  if (!row) return null;
  const [site] = await db.select().from(websites).where(eq(websites.leadId, leadId)).orderBy(desc(websites.createdAt)).limit(1);
  if (!site) return null;
  const settings = await getOrgSettings(orgId);
  return renderTemplate(settings.outreachTemplate, {
    saudacao: greeting(new Date()),
    empresa: row.business.name,
    cidade: row.business.city ?? "sua cidade",
    link: previewUrl(site),
    operador: actorName?.split(" ")[0] ?? "a equipe",
  });
}

/** Queues the first contact (or the single follow-up) for a lead, enforcing eligibility rules. */
export async function queueOutreach(orgId: string, leadId: string, actorId: string | null, kind: "outreach" | "followup" = "outreach"): Promise<QueueResult> {
  const [row] = await db
    .select({ lead: leads, business: businesses })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
  if (!row) return { ok: false, reason: "Lead não encontrado" };
  const { lead, business } = row;
  if (business.isDemo) return { ok: false, reason: "Lead de exemplo — não envia mensagens" };
  try {
    await assertCanSend(orgId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Plano sem envio automático" };
  }
  const [site] = await db.select().from(websites).where(eq(websites.leadId, leadId)).orderBy(desc(websites.createdAt)).limit(1);
  const [cp] = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.businessId, business.id), eq(contactPoints.channel, "whatsapp")))
    .limit(1);
  const settings = await getOrgSettings(orgId);
  const phone = business.phoneE164;
  const suppressed = phone ? await isSuppressed(orgId, phone) : false;

  const priorOut = await db
    .select({ id: messages.id, kind: messages.kind })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.leadId, leadId), eq(messages.direction, "out"), inArray(messages.kind, ["outreach", "followup"]), sql`${messages.status} <> 'failed' and ${messages.status} <> 'canceled'`));

  if (kind === "outreach") {
    const el = outreachEligibility({
      phoneE164: phone,
      permission: cp?.permission ?? "unknown",
      waExists: cp?.waExists,
      suppressed,
      alreadyContacted: priorOut.length > 0,
      stage: lead.stage,
      allowColdOutreach: settings.allowColdOutreach,
      hasPreview: !!site,
    });
    if (!el.eligible) return { ok: false, reason: el.reasons.join("; ") };
  } else {
    if (!phone || suppressed || priorOut.some((m) => m.kind === "followup") || !site) return { ok: false, reason: "Follow-up não permitido" };
    if (["do_not_contact", "lost", "won"].includes(lead.stage)) return { ok: false, reason: "Etapa não permite follow-up" };
  }

  const instance = await pickInstance(orgId);
  if (!instance) return { ok: false, reason: "Nenhum número de WhatsApp conectado" };

  let operator = "a equipe";
  if (actorId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId));
    if (u) operator = u.name.split(" ")[0]!;
  }
  const vars = {
    saudacao: greeting(new Date()),
    empresa: business.name,
    cidade: business.city ?? "sua cidade",
    link: previewUrl(site!),
    operador: operator,
  };
  const body =
    kind === "outreach"
      ? renderTemplate(settings.outreachTemplate, vars)
      : renderTemplate("Oi, {{saudacao}}! Conseguiu ver a demonstração do site da {{empresa}}? {{link}}\n\nSe não fizer sentido agora, sem problemas — é só responder SAIR que não envio mais nada.", vars);

  const conv = await ensureConversation(orgId, instance.id, phone!, { leadId, contactName: business.name });
  const [msg] = await db
    .insert(messages)
    .values({ orgId, conversationId: conv.id, direction: "out", author: actorId ? "human" : "system", kind, body, status: "queued" })
    .returning({ id: messages.id });
  await enqueue(QUEUES.outbound, "send", { messageId: msg!.id }, { jobId: `msg-${msg!.id}`, attempts: 6 });
  await logLeadEvent(orgId, leadId, kind, kind === "outreach" ? "Primeiro contato enfileirado" : "Follow-up enfileirado", { messageId: msg!.id }, actorId);
  if (kind === "outreach") await advanceStage(orgId, leadId, "ready_to_contact", actorId);
  return { ok: true, messageId: msg!.id };
}

/** Queues a reply inside an existing conversation (human from the panel, AI auto-reply, or system). */
export async function queueReply(
  orgId: string,
  conversationId: string,
  body: string,
  author: "human" | "ai" | "system",
  actorId: string | null,
): Promise<QueueResult> {
  const text = body.trim();
  if (!text) return { ok: false, reason: "Mensagem vazia" };
  if (text.length > 4000) return { ok: false, reason: "Mensagem muito longa" };
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  if (!conv) return { ok: false, reason: "Conversa não encontrada" };
  const [ci] = await db.select({ name: whatsappInstances.name }).from(whatsappInstances).where(eq(whatsappInstances.id, conv.instanceId));
  if (isDemoInstance(ci?.name)) return { ok: false, reason: "Conversa de exemplo — respostas não são enviadas" };
  if (author !== "system" && (await isSuppressed(orgId, conv.phoneE164))) return { ok: false, reason: "Contato pediu para não receber mensagens" };
  if (author === "ai" && !automationMaySpeak(conv.state)) return { ok: false, reason: "Conversa está com um humano" };
  if (author === "human") {
    await transition(orgId, conversationId, "HUMAN_ACTIVE", "Operador respondeu pelo painel", actorId, { assigneeId: actorId });
  }
  const [msg] = await db
    .insert(messages)
    .values({ orgId, conversationId, direction: "out", author, kind: "reply", body: text, status: "queued" })
    .returning({ id: messages.id });
  await db.update(conversations).set({ lastMessageAt: new Date(), unread: 0 }).where(eq(conversations.id, conversationId));
  await enqueue(QUEUES.outbound, "send", { messageId: msg!.id }, { jobId: `msg-${msg!.id}`, priority: 1, attempts: 6 });
  await publish(orgId, { type: "message", conversationId });
  return { ok: true, messageId: msg!.id };
}

const HOLDING_TEXT: Record<string, string> = {
  price_request: "Oi! Já vou te passar os valores certinhos.",
  purchase_intent: "Que ótimo! Já vou te chamar para acertarmos os detalhes.",
  negotiation: "Entendi! Já te respondo sobre isso.",
  demo_request: "Claro! Já te mostro.",
  initial_interest: "Que bom que gostou! Já te explico como funciona.",
  human_requested: "Claro! Já falo com você.",
};

/** Text of the holding reply: promises a human answer, never a price or a deadline it can't keep. */
export function holdingText(intent: string, now: Date, settings: { businessHoursStart: number; businessHoursEnd: number }) {
  const base = HOLDING_TEXT[intent] ?? "Recebi sua mensagem! Já te respondo.";
  if (inBusinessHours(now, settings.businessHoursStart, settings.businessHoursEnd)) return `${base} Só um instante.`;
  const open = nextBusinessOpening(now, settings.businessHoursStart, settings.businessHoursEnd);
  const sameOrNextDay = open.getTime() - now.getTime() < 30 * 3600_000;
  return `${base} Te respondo ${sameOrNextDay ? "logo cedo" : "na segunda logo cedo"}, tudo bem?`;
}

/**
 * Queues one short holding reply to a hot lead, sent only if no human answers within N minutes.
 * At most one per conversation every 12 hours.
 */
export async function queueHoldingReply(orgId: string, conversationId: string, intent: string, settings: OrgSettings, now = new Date()) {
  const recent = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.kind, "holding"), sql`${messages.createdAt} > ${new Date(now.getTime() - 12 * 3600_000).toISOString()}`))
    .limit(1);
  if (recent.length) return null;
  const minutes = Math.max(0, Math.min(120, settings.holdingReplyAfterMinutes ?? 5));
  const sendAt = new Date(now.getTime() + minutes * 60_000);
  const [msg] = await db
    .insert(messages)
    .values({ orgId, conversationId, direction: "out", author: "ai", kind: "holding", body: holdingText(intent, sendAt, settings), status: "queued" })
    .returning({ id: messages.id });
  await enqueue(QUEUES.outbound, "send", { messageId: msg!.id }, { jobId: `msg-${msg!.id}`, delay: minutes * 60_000, attempts: 6 });
  return msg!.id;
}

export type SendOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "skipped"; reason: string }
  | { status: "delay"; until: Date; reason: string }
  | { status: "failed"; reason: string };

/** Reserves a pacing slot for a cold message on an instance. Returns a retry time when not allowed now. */
export async function reserveColdSlot(
  instance: { id: string; hourlyLimit: number; dailyLimit: number; warmupStartedAt: Date },
  settings: { businessHoursStart: number; businessHoursEnd: number },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; until: Date; reason: string }> {
  const devBypass = process.env.NODE_ENV !== "production" && process.env.DEV_IGNORE_BUSINESS_HOURS === "true";
  if (!devBypass && !inBusinessHours(now, settings.businessHoursStart, settings.businessHoursEnd)) {
    return { ok: false, until: nextBusinessOpening(now, settings.businessHoursStart, settings.businessHoursEnd), reason: "Fora do horário comercial" };
  }
  const r = redis();
  const nextKey = `rl:${instance.id}:next`;
  const next = Number((await r.get(nextKey)) ?? 0);
  if (next > now.getTime()) return { ok: false, until: new Date(next), reason: "Intervalo entre mensagens" };
  const dayKey = `rl:${instance.id}:d:${localDayKey(now)}`;
  const hourKey = `rl:${instance.id}:h:${localHourKey(now)}`;
  const daily = effectiveDailyLimit(instance.dailyLimit, instance.warmupStartedAt, now);
  const [d, h] = (await r.multi().incr(dayKey).expire(dayKey, 2 * 86400).incr(hourKey).expire(hourKey, 7200).exec())!
    .filter((_, i) => i % 2 === 0)
    .map(([, v]) => Number(v));
  if (d! > daily) {
    await r.decr(dayKey);
    await r.decr(hourKey);
    const local = new Date(now.getTime() - 3 * 3600_000);
    const nextLocalMidnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 3));
    return { ok: false, until: nextBusinessOpening(nextLocalMidnight, settings.businessHoursStart, settings.businessHoursEnd), reason: "Limite diário do número" };
  }
  if (h! > instance.hourlyLimit) {
    await r.decr(dayKey);
    await r.decr(hourKey);
    const nextHour = new Date(now);
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    return { ok: false, until: new Date(nextHour.getTime() + 60_000), reason: "Limite por hora do número" };
  }
  await r.set(nextKey, String(now.getTime() + randomGapSeconds() * 1000), "EX", 3600);
  return { ok: true };
}

/** Sends one queued message. Idempotent: a message is only ever sent from status "queued". */
export async function sendQueuedMessage(messageId: string, opts: { client?: EvolutionClient; now?: Date } = {}): Promise<SendOutcome> {
  const client = opts.client;
  const [row] = await db
    .select({ msg: messages, conv: conversations, inst: whatsappInstances })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(whatsappInstances, eq(whatsappInstances.id, conversations.instanceId))
    .where(eq(messages.id, messageId));
  if (!row) return { status: "skipped", reason: "Mensagem inexistente" };
  const { msg, conv, inst } = row;
  if (msg.status !== "queued") return { status: "skipped", reason: `Status ${msg.status}` };

  const cancel = async (reason: string) => {
    await db.update(messages).set({ status: "canceled", error: reason }).where(and(eq(messages.id, msg.id), eq(messages.status, "queued")));
    await publish(msg.orgId, { type: "message", conversationId: conv.id });
    return { status: "skipped" as const, reason };
  };

  if (isDemoInstance(inst.name)) return cancel("Instância de exemplo");
  const isOptOutAck = msg.author === "system" && msg.kind === "reply";
  if (!isOptOutAck && (await isSuppressed(msg.orgId, conv.phoneE164))) return cancel("Contato na lista de supressão");
  if (msg.kind === "holding") {
    // Only while nobody answered: a human reply (panel or phone) after the hold was queued cancels it.
    if (conv.state === "HUMAN_ACTIVE" || conv.state === "RESOLVED") return cancel("Você já respondeu");
    const [human] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, "out"), eq(messages.author, "human"), sql`${messages.createdAt} > ${msg.createdAt.toISOString()}`))
      .limit(1);
    if (human) return cancel("Você já respondeu");
  } else if (msg.author === "ai" && !automationMaySpeak(conv.state)) return cancel("Humano assumiu a conversa");
  if (inst.status !== "open") return { status: "delay", until: new Date(Date.now() + 5 * 60_000), reason: "Número desconectado" };

  if (msg.kind === "outreach" || msg.kind === "followup") {
    if (inst.paused) return { status: "delay", until: new Date(Date.now() + 30 * 60_000), reason: "Número pausado" };
    // A lead that replied (or was blocked) meanwhile must not receive a cold message.
    if (conv.lastInboundAt && msg.kind === "followup") return cancel("Lead já respondeu");
    const settings = await getOrgSettings(msg.orgId);
    const slot = await reserveColdSlot(inst, settings, opts.now);
    if (!slot.ok) return { status: "delay", until: slot.until, reason: slot.reason };
  }

  // Claim the message atomically so concurrent workers cannot double-send.
  const claimed = await db
    .update(messages)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(messages.id, msg.id), eq(messages.status, "queued")))
    .returning({ id: messages.id });
  if (!claimed.length) return { status: "skipped", reason: "Já processada" };

  try {
    const c = client ?? EvolutionClient.fromEnv();
    const number = conv.remoteJid.endsWith("@s.whatsapp.net") ? phoneFromJid(conv.remoteJid) : conv.phoneE164;
    const res = await c.sendText(inst.name, number, msg.body, msg.kind === "reply" ? 800 : 1500);
    await db.update(messages).set({ providerMessageId: res.key.id }).where(eq(messages.id, msg.id));
    if (res.key.remoteJid && res.key.remoteJid !== conv.remoteJid && res.key.remoteJid.endsWith("@s.whatsapp.net")) {
      await db.update(conversations).set({ remoteJid: res.key.remoteJid }).where(eq(conversations.id, conv.id)).catch(() => {});
    }
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    if ((msg.kind === "outreach" || msg.kind === "followup") && conv.leadId) {
      await db.update(leads).set({ lastContactAt: new Date() }).where(eq(leads.id, conv.leadId));
      await advanceStage(msg.orgId, conv.leadId, "contacted");
      await logLeadEvent(msg.orgId, conv.leadId, "sent", msg.kind === "outreach" ? "Primeiro contato enviado" : "Follow-up enviado", { messageId: msg.id });
    }
    await publish(msg.orgId, { type: "message", conversationId: conv.id });
    return { status: "sent", providerMessageId: res.key.id };
  } catch (err) {
    const permanent = err instanceof EvolutionError && err.status >= 400 && err.status < 500;
    // Release the claim so a retry can send it; permanent errors are marked failed.
    await db
      .update(messages)
      .set({ status: permanent ? "failed" : "queued", error: err instanceof Error ? err.message.slice(0, 500) : String(err), sentAt: null })
      .where(eq(messages.id, msg.id));
    await publish(msg.orgId, { type: "message", conversationId: conv.id });
    if (permanent) {
      if (/exists.*false|not.*exist/i.test(String((err as EvolutionError).body))) {
        await db.update(contactPoints).set({ waExists: false }).where(and(eq(contactPoints.orgId, msg.orgId), eq(contactPoints.value, conv.phoneE164)));
      }
      return { status: "failed", reason: (err as Error).message };
    }
    throw err;
  }
}

/* ------------------------------ Webhook intake ----------------------------- */

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Validates, de-duplicates and persists a webhook event, then queues it. Fast path for the HTTP handler. */
export async function intakeEvolutionWebhook(token: string | null, payload: EvolutionWebhook): Promise<{ status: number; body: string }> {
  if (!payload?.instance || !payload.event) return { status: 400, body: "payload inválido" };
  const [inst] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.name, payload.instance));
  if (!inst) return { status: 404, body: "instância desconhecida" };
  if (!token || !safeEqual(token, inst.webhookToken)) return { status: 401, body: "token inválido" };

  const event = payload.event.toLowerCase().replace(/_/g, ".");
  const d = payload.data as Record<string, any>;
  let eventId: string;
  if (event === "messages.upsert") eventId = `up:${inst.id}:${d?.key?.id}`;
  else if (event === "messages.update") eventId = `st:${inst.id}:${d?.keyId ?? d?.key?.id}:${d?.status}`;
  else if (event === "connection.update" || event === "qrcode.updated") eventId = `${event}:${inst.id}:${payload.date_time ?? Date.now()}:${d?.state ?? ""}`;
  else return { status: 200, body: "ignorado" };

  const [ev] = await db
    .insert(providerEvents)
    .values({ provider: "evolution", eventId, type: event, payload: { ...payload, apikey: undefined } as object })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id });
  if (!ev) return { status: 200, body: "duplicado" };
  await enqueue(QUEUES.inbound, "event", { providerEventId: ev.id }, { jobId: `ev-${ev.id}` });
  return { status: 200, body: "ok" };
}

/* ----------------------------- Inbound processor --------------------------- */

export async function processProviderEvent(providerEventId: string, opts: { fetchImpl?: typeof fetch } = {}) {
  const [ev] = await db.select().from(providerEvents).where(eq(providerEvents.id, providerEventId));
  if (!ev || ev.processedAt) return;
  const payload = ev.payload as EvolutionWebhook;
  const [inst] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.name, payload.instance));
  if (!inst) return;
  const d = payload.data as Record<string, any>;

  if (ev.type === "messages.upsert") await handleUpsert(inst, d as UpsertData, opts.fetchImpl);
  else if (ev.type === "messages.update") {
    const st = STATUS_MAP[String(d.status)];
    const id = d.keyId ?? d.key?.id;
    if (st && id) {
      const rank = { queued: 0, sent: 1, delivered: 2, read: 3 } as Record<string, number>;
      const [m] = await db.select().from(messages).where(and(eq(messages.orgId, inst.orgId), eq(messages.providerMessageId, id)));
      if (m && (st === "failed" || (rank[st] ?? 0) > (rank[m.status] ?? 0))) {
        await db.update(messages).set({ status: st }).where(eq(messages.id, m.id));
        await publish(inst.orgId, { type: "message", conversationId: m.conversationId });
      }
    }
  } else if (ev.type === "connection.update") {
    const state = String(d.state ?? "");
    if (["open", "close", "connecting"].includes(state)) {
      const patch: Partial<typeof whatsappInstances.$inferInsert> = { status: state as "open" | "close" | "connecting" };
      if (state === "open") {
        patch.qrBase64 = null;
        if (d.wuid) patch.phone = phoneFromJid(String(d.wuid));
      }
      await db.update(whatsappInstances).set(patch).where(eq(whatsappInstances.id, inst.id));
      await publish(inst.orgId, { type: "instance", instanceId: inst.id });
      if (state === "close" && inst.status === "open") {
        await notify(inst.orgId, {
          type: "instance_down",
          title: `WhatsApp "${inst.label}" desconectou`,
          body: `Motivo: ${d.statusReason ?? "desconhecido"}. Reconecte em Configurações > WhatsApp.`,
          link: "/settings",
          priority: "high",
        });
      }
    }
  } else if (ev.type === "qrcode.updated") {
    const b64 = d.qrcode?.base64 ?? d.base64;
    if (b64) {
      await db.update(whatsappInstances).set({ qrBase64: String(b64), status: "connecting" }).where(eq(whatsappInstances.id, inst.id));
      await publish(inst.orgId, { type: "instance", instanceId: inst.id });
    }
  }
  await db.update(providerEvents).set({ processedAt: new Date() }).where(eq(providerEvents.id, ev.id));
}

async function findLeadByPhone(orgId: string, phone: string) {
  const [r] = await db
    .select({ leadId: leads.id })
    .from(businesses)
    .innerJoin(leads, eq(leads.businessId, businesses.id))
    .where(and(eq(businesses.orgId, orgId), inArray(businesses.phoneE164, brPhoneVariants(phone))))
    .limit(1);
  return r?.leadId ?? null;
}

async function handleUpsert(inst: typeof whatsappInstances.$inferSelect, d: UpsertData, fetchImpl?: typeof fetch) {
  if (!d?.key?.id) return;
  const jid = resolveJid(d.key);
  if (!jid || jid.endsWith("@g.us") || jid.includes("broadcast") || jid.includes("newsletter")) return;
  const text = extractText(d.message);
  if (!text) return;
  const phone = phoneFromJid(jid);
  const orgId = inst.orgId;

  if (d.key.fromMe) {
    // Our own sends come back here too; anything unknown was typed by the operator on the phone.
    const [known] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.orgId, orgId), eq(messages.providerMessageId, d.key.id)));
    if (known) return;
    const conv = await ensureConversation(orgId, inst.id, phone, { leadId: await findLeadByPhone(orgId, phone), jid });
    const inserted = await db
      .insert(messages)
      .values({ orgId, conversationId: conv.id, direction: "out", author: "human", kind: "reply", body: text, providerMessageId: d.key.id, status: "sent", sentAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: messages.id });
    if (inserted.length) {
      await transition(orgId, conv.id, "HUMAN_ACTIVE", "Operador respondeu pelo celular");
      await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
      await publish(orgId, { type: "message", conversationId: conv.id });
    }
    return;
  }

  const leadId = await findLeadByPhone(orgId, phone);
  const conv = await ensureConversation(orgId, inst.id, phone, { leadId, contactName: d.pushName ?? null, jid });
  const [msg] = await db
    .insert(messages)
    .values({ orgId, conversationId: conv.id, direction: "in", author: "lead", kind: "inbound", body: text, providerMessageId: d.key.id, status: "received" })
    .onConflictDoNothing()
    .returning();
  if (!msg) return; // duplicate delivery
  await db
    .update(conversations)
    .set({ lastInboundAt: new Date(), lastMessageAt: new Date(), unread: sql`${conversations.unread} + 1`, contactName: conv.contactName ?? d.pushName ?? null })
    .where(eq(conversations.id, conv.id));
  await publish(orgId, { type: "message", conversationId: conv.id });

  const effectiveLeadId = conv.leadId ?? leadId;
  if (effectiveLeadId) {
    await advanceStage(orgId, effectiveLeadId, "replied");
    await logLeadEvent(orgId, effectiveLeadId, "inbound", `Mensagem recebida: "${text.slice(0, 120)}"`, { messageId: msg.id });
  }

  // Cancel any pending cold follow-up for this conversation.
  await db
    .update(messages)
    .set({ status: "canceled", error: "Lead respondeu" })
    .where(and(eq(messages.conversationId, conv.id), eq(messages.status, "queued"), eq(messages.kind, "followup")));

  const settings = await getOrgSettings(orgId);
  const history = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt))
    .limit(30);
  const c = await classifyMessage(orgId, text, history.slice(0, -1), settings.classifierConfidenceThreshold, fetchImpl);
  await db.insert(intentClassifications).values({
    orgId,
    messageId: msg.id,
    conversationId: conv.id,
    intent: c.intent,
    confidence: c.confidence,
    urgency: c.urgency,
    sentiment: c.sentiment,
    suggestedAction: c.suggestedAction,
    suggestedReply: c.suggestedReply ?? null,
    reason: c.reason,
    handoffRequired: c.handoffRequired,
    summary: c.summary,
    model: c.model,
  });
  await db.update(conversations).set({ lastIntent: c.intent, summary: c.summary }).where(eq(conversations.id, conv.id));

  const [b] = effectiveLeadId
    ? await db.select({ name: businesses.name, city: businesses.city }).from(leads).innerJoin(businesses, eq(businesses.id, leads.businessId)).where(eq(leads.id, effectiveLeadId))
    : [];
  const who = b ? `${b.name}${b.city ? ` · ${b.city}` : ""}` : conv.contactName ?? formatBrPhone(phone);

  if (c.intent === "stop_request") {
    await db.insert(suppressionList).values({ orgId, value: phone, reason: "Pediu para parar (WhatsApp)" }).onConflictDoNothing();
    await db.update(contactPoints).set({ permission: "opted_out" }).where(and(eq(contactPoints.orgId, orgId), inArray(contactPoints.value, brPhoneVariants(phone))));
    await db.update(messages).set({ status: "canceled", error: "Opt-out" }).where(and(eq(messages.conversationId, conv.id), eq(messages.status, "queued")));
    if (effectiveLeadId) await setStage(orgId, effectiveLeadId, "do_not_contact");
    await transition(orgId, conv.id, "RESOLVED", "Opt-out solicitado");
    await queueReply(orgId, conv.id, "Tudo certo, não enviaremos mais mensagens. Obrigado e desculpe o incômodo!", "system", null);
    return;
  }

  if (c.intent === "not_interested") {
    if (effectiveLeadId) {
      await db.update(leads).set({ lostReason: "Sem interesse (WhatsApp)" }).where(eq(leads.id, effectiveLeadId));
      await setStage(orgId, effectiveLeadId, "lost");
    }
    await transition(orgId, conv.id, "RESOLVED", "Lead sem interesse");
    await notify(orgId, { type: "not_interested", title: `${who} não tem interesse`, body: text.slice(0, 140), link: `/inbox?c=${conv.id}` });
    return;
  }

  const state: ConversationState = (await db.select({ s: conversations.state }).from(conversations).where(eq(conversations.id, conv.id)))[0]!.s;

  if (c.handoffRequired) {
    if (effectiveLeadId && ["initial_interest", "price_request", "purchase_intent", "negotiation", "demo_request"].includes(c.intent)) {
      await advanceStage(orgId, effectiveLeadId, c.intent === "negotiation" ? "negotiation" : "interested");
    }
    if (state === "AI_ACTIVE" || state === "RESOLVED") {
      await transition(orgId, conv.id, "HUMAN_REQUESTED", `${c.intent}: ${c.reason}`);
      if (effectiveLeadId) await logLeadEvent(orgId, effectiveLeadId, "handoff", `Cliente precisa de você: ${INTENT_LABEL[c.intent] ?? c.intent}`, { summary: c.summary });
    }
    await notify(orgId, {
      type: "hot_lead",
      title: `🔥 ${who}`,
      body: `“${text.slice(0, 140)}” — ${c.suggestedAction}`,
      link: `/inbox?c=${conv.id}`,
      priority: c.urgency === "high" ? "high" : "normal",
    });
    if (settings.holdingReply && state !== "HUMAN_ACTIVE") await queueHoldingReply(orgId, conv.id, c.intent, settings).catch((e) => console.warn("[espera] falhou", e?.message));
    if (settings.operatorWhatsapp && state !== "HUMAN_ACTIVE") {
      try {
        await EvolutionClient.fromEnv().sendText(inst.name, settings.operatorWhatsapp, `Vendlia: lead quente — ${who}\n"${text.slice(0, 200)}"\n${env().APP_URL}/inbox?c=${conv.id}`);
      } catch (err) {
        console.warn("[alerta operador] falhou", err instanceof Error ? err.message : err);
      }
    }
    return;
  }

  if (
    automationMaySpeak(state) &&
    settings.autoReplyInformational &&
    c.intent === "informational_question" &&
    c.confidence >= settings.classifierConfidenceThreshold &&
    c.suggestedReply
  ) {
    await queueReply(orgId, conv.id, c.suggestedReply, "ai", null);
  }
}

/* ------------------------------- Maintenance ------------------------------- */

/** Queues the single follow-up for leads contacted >= N hours ago that never replied. */
export async function queueDueFollowUps(now = new Date()) {
  const orgs = await db.selectDistinct({ orgId: conversations.orgId }).from(conversations);
  let queued = 0;
  for (const { orgId } of orgs) {
    const settings = await getOrgSettings(orgId);
    if (!settings.followUpEnabled) continue;
    const cutoff = new Date(now.getTime() - settings.followUpAfterHours * 3600_000);
    const rows = await db
      .select({ leadId: conversations.leadId })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(leads, eq(leads.id, conversations.leadId))
      .where(
        and(
          eq(messages.orgId, orgId),
          eq(messages.kind, "outreach"),
          inArray(messages.status, ["sent", "delivered", "read"]),
          sql`${messages.sentAt} < ${cutoff.toISOString()}`,
          isNull(conversations.lastInboundAt),
          eq(leads.stage, "contacted"),
          sql`not exists (select 1 from messages m2 where m2.conversation_id = ${conversations.id} and m2.kind = 'followup')`,
        ),
      )
      .limit(200);
    for (const r of rows) {
      if (!r.leadId) continue;
      const res = await queueOutreach(orgId, r.leadId, null, "followup");
      if (res.ok) queued++;
    }
  }
  return queued;
}

/** Re-checks connection state of all instances (covers missed webhooks). */
export async function syncInstances() {
  const e = env();
  if (!e.EVOLUTION_API_URL || !e.EVOLUTION_API_KEY) return;
  const client = EvolutionClient.fromEnv();
  const list = await db.select().from(whatsappInstances);
  for (const i of list) {
    if (isDemoInstance(i.name)) continue;
    try {
      const s = await client.connectionState(i.name);
      const st = s.instance?.state;
      if (st && st !== i.status && ["open", "close", "connecting"].includes(st)) {
        await db.update(whatsappInstances).set({ status: st as "open" }).where(eq(whatsappInstances.id, i.id));
        await publish(i.orgId, { type: "instance", instanceId: i.id });
      }
    } catch (err) {
      console.warn(`[sync] ${i.name}`, err instanceof Error ? err.message : err);
    }
  }
}
