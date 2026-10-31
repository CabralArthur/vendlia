"use server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, businesses, discoveryRuns, leads, contactPoints, LEAD_STAGES, WEBSITE_STATUSES, suppressionList } from "@/server/db";
import { enqueue, QUEUES } from "@/server/queue";
import { SEGMENTS } from "@/server/discovery/segments";
import { ingestCandidates, rescoreLead } from "@/server/discovery/ingest";
import { mapCsvRows, parseCsv, type Candidate } from "@/server/discovery/connectors";
import { setStage, logLeadEvent, audit } from "@/server/events";
import { generateSiteForLead } from "@/server/sites/service";
import { queueOutreach } from "@/server/whatsapp/service";
import { normalizeBrPhone } from "@/lib/phone";
import { normalizeName, onlyDigits } from "@/lib/text";
import { UF_DDD, type SegmentId } from "@/server/discovery/segments";
import { env } from "@/server/env";

const segIds = SEGMENTS.map((s) => s.id) as [SegmentId, ...SegmentId[]];

export async function startDiscovery(fd: FormData) {
  const s = await requireSession();
  return act("/discovery", async () => {
    const p = z
      .object({ source: z.enum(["osm", "google_places"]), city: z.string().min(2), state: z.string().length(2), segment: z.enum(segIds), limit: z.coerce.number().min(10).max(1000).default(300) })
      .parse({ source: str(fd, "source"), city: str(fd, "city"), state: str(fd, "state").toUpperCase(), segment: str(fd, "segment"), limit: str(fd, "limit") || undefined });
    if (p.source === "google_places" && !env().GOOGLE_PLACES_API_KEY) throw new Error("Configure GOOGLE_PLACES_API_KEY para usar o Google Places.");
    const [run] = await db.insert(discoveryRuns).values({ orgId: s.orgId, source: p.source, params: { city: p.city, state: p.state, segment: p.segment, limit: p.limit } }).returning();
    await enqueue(QUEUES.discovery, "run", { runId: run!.id }, { jobId: `disc-${run!.id}`, attempts: 2 });
    return "Busca iniciada. Você será avisado quando terminar.";
  });
}

export async function importCsv(fd: FormData) {
  const s = await requireSession();
  return act("/discovery", async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecione um arquivo CSV.");
    if (file.size > 5_000_000) throw new Error("Arquivo muito grande (máx. 5 MB).");
    const origin = str(fd, "origin");
    if (origin.length < 3) throw new Error("Informe a origem dos dados (ex.: lista própria, fornecedor licenciado).");
    const rows = parseCsv(await file.text()).slice(0, 5000);
    const segment = z.enum(segIds).parse(str(fd, "segment"));
    const cands = mapCsvRows(rows, { segment, city: str(fd, "city") || undefined, state: str(fd, "state").toUpperCase() || undefined }).map((c) => ({ ...c, license: `Importado pelo operador — origem: ${origin}` }));
    if (!cands.length) throw new Error("Nenhuma linha válida. A coluna 'nome' é obrigatória.");
    const r = await ingestCandidates(s.orgId, cands);
    await audit(s.orgId, s.userId, "import.csv", undefined, { rows: rows.length, origin, ...r, leadIds: undefined });
    return `${r.created} novas empresas, ${r.updated} atualizadas, ${r.skipped} ignoradas.`;
  });
}

export async function addManualBusiness(fd: FormData) {
  const s = await requireSession();
  return act("/discovery", async () => {
    const name = str(fd, "name");
    if (name.length < 2) throw new Error("Informe o nome.");
    const c: Candidate = {
      source: "manual",
      externalId: `${normalizeName(name)}|${onlyDigits(str(fd, "phone")) || Date.now()}`,
      license: "Cadastro manual do operador",
      payload: { by: s.userId },
      name,
      segment: z.enum(segIds).parse(str(fd, "segment")),
      phone: str(fd, "phone") || undefined,
      city: str(fd, "city") || undefined,
      state: str(fd, "state").toUpperCase() || undefined,
      website: str(fd, "website") || undefined,
      instagram: str(fd, "instagram") || undefined,
      address: str(fd, "address") || undefined,
    };
    const r = await ingestCandidates(s.orgId, [c]);
    return r.created ? "Empresa cadastrada." : "Empresa já existia — dados mesclados.";
  });
}

export async function updateBusiness(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const [l] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, s.orgId)));
    if (!l) throw new Error("Lead não encontrado");
    const [b] = await db.select().from(businesses).where(eq(businesses.id, l.businessId));
    const state = str(fd, "state").toUpperCase() || null;
    const phoneE164 = normalizeBrPhone(str(fd, "phone"), state ? UF_DDD[state] : undefined);
    if (str(fd, "phone") && !phoneE164) throw new Error("Telefone inválido.");
    const websiteStatus = z.enum(WEBSITE_STATUSES).parse(str(fd, "websiteStatus"));
    const services = str(fd, "services").split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
    const cnpj = onlyDigits(str(fd, "cnpj"));
    await db
      .update(businesses)
      .set({
        name: str(fd, "name") || b!.name,
        normalizedName: normalizeName(str(fd, "name") || b!.name),
        segment: z.enum(segIds).parse(str(fd, "segment")),
        cnpj: cnpj.length === 14 ? cnpj : null,
        phone: str(fd, "phone") || null,
        phoneE164,
        email: str(fd, "email") || null,
        website: str(fd, "website") || null,
        websiteStatus,
        instagram: str(fd, "instagram").replace(/^@/, "") || null,
        address: str(fd, "address") || null,
        neighborhood: str(fd, "neighborhood") || null,
        city: str(fd, "city") || null,
        state,
        openingHours: str(fd, "openingHours") || null,
        description: str(fd, "description") || null,
        services,
        active: fd.get("active") === "on",
      })
      .where(eq(businesses.id, b!.id));
    if (phoneE164 && phoneE164 !== b!.phoneE164) {
      await db.insert(contactPoints).values({ orgId: s.orgId, businessId: b!.id, channel: "whatsapp", value: phoneE164, permission: "public_business", consentSource: "Informado/verificado pelo operador" }).onConflictDoNothing();
    }
    await rescoreLead(s.orgId, leadId);
    await logLeadEvent(s.orgId, leadId, "edit", "Dados da empresa atualizados", null, s.userId);
    return "Dados salvos e score recalculado.";
  });
}

export async function setLeadStageAction(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  const back = str(fd, "back") || `/leads/${leadId}`;
  return act(back, async () => {
    const stage = z.enum(LEAD_STAGES).parse(str(fd, "stage"));
    const [l] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, s.orgId)));
    if (!l) throw new Error("Lead não encontrado");
    if (stage === "do_not_contact") {
      const [b] = await db.select().from(businesses).where(eq(businesses.id, l.businessId));
      if (b?.phoneE164) await db.insert(suppressionList).values({ orgId: s.orgId, value: b.phoneE164, reason: "Marcado manualmente" }).onConflictDoNothing();
    }
    if (stage === "lost") await db.update(leads).set({ lostReason: str(fd, "reason") || "Marcado manualmente" }).where(eq(leads.id, leadId));
    await setStage(s.orgId, leadId, stage, s.userId, l.stage);
  });
}

export async function addNote(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const note = str(fd, "note");
    if (!note) throw new Error("Nota vazia");
    const [l] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, s.orgId)));
    if (!l) throw new Error("Lead não encontrado");
    await logLeadEvent(s.orgId, leadId, "note", note.slice(0, 2000), null, s.userId);
    return "Nota adicionada.";
  });
}

export async function generatePreview(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const t = str(fd, "template");
    await generateSiteForLead(s.orgId, leadId, { template: (t || undefined) as never });
    return "Demonstração pronta.";
  });
}

function ids(fd: FormData) {
  return fd.getAll("ids").map(String).filter(Boolean).slice(0, 200);
}

export async function bulkAction(fd: FormData) {
  const s = await requireSession();
  const back = str(fd, "back") || "/leads";
  return act(back, async () => {
    const list = ids(fd);
    if (!list.length) throw new Error("Selecione ao menos um lead.");
    const owned = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.orgId, s.orgId), inArray(leads.id, list)));
    const op = str(fd, "op");
    if (op === "preview") {
      for (const l of owned) await enqueue(QUEUES.sites, "generate", { orgId: s.orgId, leadId: l.id }, { jobId: `site-${l.id}-${Date.now()}` });
      return `${owned.length} demonstrações sendo geradas.`;
    }
    if (op === "outreach") {
      let ok = 0;
      const fails: string[] = [];
      for (const l of owned) {
        const r = await queueOutreach(s.orgId, l.id, s.userId);
        if (r.ok) ok++;
        else fails.push(r.reason);
      }
      const why = fails.length ? ` ${fails.length} não elegíveis (ex.: ${fails[0]}).` : "";
      return `${ok} contatos enfileirados — envio gradual em horário comercial.${why}`;
    }
    if (op === "discard") {
      for (const l of owned) await setStage(s.orgId, l.id, "lost", s.userId);
      return `${owned.length} leads descartados.`;
    }
    throw new Error("Operação inválida");
  });
}

export async function sendOutreach(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const r = await queueOutreach(s.orgId, leadId, s.userId);
    if (!r.ok) throw new Error(`Não foi possível enfileirar: ${r.reason}`);
    return "Contato enfileirado. O envio respeita horário comercial e limites do número.";
  });
}

export async function setContactPermission(fd: FormData) {
  const s = await requireSession();
  const leadId = str(fd, "leadId");
  return act(`/leads/${leadId}`, async () => {
    const permission = z.enum(["public_business", "opt_in", "opted_out"]).parse(str(fd, "permission"));
    const cpId = str(fd, "contactId");
    const [cp] = await db.select().from(contactPoints).where(and(eq(contactPoints.id, cpId), eq(contactPoints.orgId, s.orgId)));
    if (!cp) throw new Error("Contato não encontrado");
    await db.update(contactPoints).set({ permission, consentSource: str(fd, "source") || `Alterado por ${s.user.name}` }).where(eq(contactPoints.id, cp.id));
    if (permission === "opted_out") await db.insert(suppressionList).values({ orgId: s.orgId, value: cp.value, reason: "Marcado manualmente" }).onConflictDoNothing();
    if (permission !== "opted_out") await db.delete(suppressionList).where(and(eq(suppressionList.orgId, s.orgId), eq(suppressionList.value, cp.value)));
    await audit(s.orgId, s.userId, "contact.permission", cp.id, { permission });
    await logLeadEvent(s.orgId, leadId, "consent", `Permissão de contato: ${permission}`, null, s.userId);
    return "Permissão atualizada.";
  });
}
