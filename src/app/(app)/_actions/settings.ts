"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, requireSession, hashPassword } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, organizations, users, memberships, whatsappInstances } from "@/server/db";
import { getOrgSettings } from "@/server/org";
import { env } from "@/server/env";
import { EvolutionClient } from "@/server/whatsapp/evolution";
import { verifyWhatsappNumbers } from "@/server/discovery/run";
import { randomToken } from "@/lib/text";
import { normalizeBrPhone } from "@/lib/phone";
import { audit } from "@/server/events";
import { llmProvider, llmSiteModel, llmText } from "@/server/ai/llm";
import { assertCanAddNumber } from "@/server/billing";

export async function saveOrgSettings(fd: FormData) {
  const s = await requireRole("owner", "admin");
  return act("/settings", async () => {
    const cur = await getOrgSettings(s.orgId);
    const tpl = str(fd, "outreachTemplate");
    if (!tpl.includes("{{link}}")) throw new Error("A mensagem precisa conter {{link}} (a demonstração).");
    if (!/sair|parar/i.test(tpl)) throw new Error("A mensagem precisa oferecer uma forma de sair (ex.: 'responda SAIR').");
    const op = str(fd, "operatorWhatsapp");
    const next = {
      ...cur,
      outreachTemplate: tpl.slice(0, 1000),
      allowColdOutreach: fd.get("allowColdOutreach") === "on",
      autoReplyInformational: fd.get("autoReplyInformational") === "on",
      followUpEnabled: fd.get("followUpEnabled") === "on",
      followUpAfterHours: z.coerce.number().min(24).max(240).parse(str(fd, "followUpAfterHours") || 48),
      businessHoursStart: z.coerce.number().min(6).max(20).parse(str(fd, "businessHoursStart") || 9),
      businessHoursEnd: z.coerce.number().min(8).max(22).parse(str(fd, "businessHoursEnd") || 18),
      classifierConfidenceThreshold: z.coerce.number().min(0.3).max(0.99).parse(str(fd, "threshold") || 0.7),
      operatorWhatsapp: op ? normalizeBrPhone(op) ?? undefined : undefined,
      holdingReply: fd.get("holdingReply") === "on",
      holdingReplyAfterMinutes: z.coerce.number().min(0).max(120).parse(str(fd, "holdingReplyAfterMinutes") || 5),
    };
    if (next.businessHoursEnd <= next.businessHoursStart) throw new Error("Horário final deve ser depois do inicial.");
    await db.update(organizations).set({ settings: next }).where(eq(organizations.id, s.orgId));
    await audit(s.orgId, s.userId, "settings.update");
    return "Configurações salvas.";
  });
}

function webhookUrl() {
  return `${env().APP_URL.replace(/\/$/, "")}/api/webhooks/evolution`;
}

export async function createInstanceAction(fd: FormData) {
  const s = await requireRole("owner", "admin");
  return act("/settings", async () => {
    await assertCanAddNumber(s.orgId);
    const label = str(fd, "label") || "WhatsApp";
    const name = `vendlia-${s.org.slug.slice(0, 20)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const token = randomToken(24);
    const client = EvolutionClient.fromEnv();
    const created = await client.createInstance(name, webhookUrl(), token);
    await db.insert(whatsappInstances).values({ orgId: s.orgId, name, label, webhookToken: token, status: "connecting", qrBase64: created.qrcode?.base64 ?? null });
    if (!created.qrcode?.base64) {
      const c = await client.connect(name).catch(() => null);
      if (c?.base64) await db.update(whatsappInstances).set({ qrBase64: c.base64 }).where(eq(whatsappInstances.name, name));
    }
    return "Instância criada. Escaneie o QR code com o WhatsApp do número comercial.";
  });
}

async function ownInstance(orgId: string, id: string) {
  const [i] = await db.select().from(whatsappInstances).where(and(eq(whatsappInstances.id, id), eq(whatsappInstances.orgId, orgId)));
  if (!i) throw new Error("Instância não encontrada");
  return i;
}

export async function instanceAction(fd: FormData) {
  const s = await requireRole("owner", "admin");
  return act("/settings", async () => {
    const i = await ownInstance(s.orgId, str(fd, "instanceId"));
    const client = EvolutionClient.fromEnv();
    switch (str(fd, "op")) {
      case "qr": {
        await client.setWebhook(i.name, webhookUrl(), i.webhookToken).catch(() => {});
        const c = await client.connect(i.name);
        if (c.base64) {
          await db.update(whatsappInstances).set({ qrBase64: c.base64, status: "connecting" }).where(eq(whatsappInstances.id, i.id));
          return "Novo QR code gerado.";
        }
        const st = await client.connectionState(i.name);
        await db.update(whatsappInstances).set({ status: st.instance.state as "open" }).where(eq(whatsappInstances.id, i.id));
        return `Estado: ${st.instance.state}`;
      }
      case "refresh": {
        const st = await client.connectionState(i.name);
        await db.update(whatsappInstances).set({ status: st.instance.state as "open", ...(st.instance.state === "open" ? { qrBase64: null } : {}) }).where(eq(whatsappInstances.id, i.id));
        return `Estado: ${st.instance.state}`;
      }
      case "verify": {
        const n = await verifyWhatsappNumbers(s.orgId);
        return `${n} números verificados.`;
      }
      case "pause":
        await db.update(whatsappInstances).set({ paused: !i.paused }).where(eq(whatsappInstances.id, i.id));
        return i.paused ? "Envios retomados." : "Envios frios pausados neste número.";
      case "logout":
        await client.logout(i.name).catch(() => {});
        await db.update(whatsappInstances).set({ status: "close" }).where(eq(whatsappInstances.id, i.id));
        return "Número desconectado.";
      case "delete":
        await client.deleteInstance(i.name).catch(() => {});
        await db.delete(whatsappInstances).where(eq(whatsappInstances.id, i.id));
        return "Instância removida.";
      case "limits": {
        const hourly = z.coerce.number().min(1).max(60).parse(str(fd, "hourlyLimit"));
        const daily = z.coerce.number().min(1).max(500).parse(str(fd, "dailyLimit"));
        await db.update(whatsappInstances).set({ hourlyLimit: hourly, dailyLimit: daily }).where(eq(whatsappInstances.id, i.id));
        return "Limites atualizados.";
      }
    }
    throw new Error("Operação inválida");
  });
}

export async function addMember(fd: FormData) {
  const s = await requireRole("owner", "admin");
  return act("/settings", async () => {
    const data = z
      .object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(["admin", "operator"]) })
      .parse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), password: str(fd, "password"), role: str(fd, "role") });
    let [u] = await db.select().from(users).where(eq(users.email, data.email));
    if (!u) [u] = await db.insert(users).values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password) }).returning();
    await db.insert(memberships).values({ userId: u!.id, orgId: s.orgId, role: data.role }).onConflictDoNothing();
    await audit(s.orgId, s.userId, "team.add", u!.id, { role: data.role });
    return `${data.name} adicionado(a). Compartilhe o e-mail e a senha inicial com a pessoa.`;
  });
}

export async function changePassword(fd: FormData) {
  const s = await requireSession();
  return act("/settings", async () => {
    const pw = str(fd, "password");
    if (pw.length < 8) throw new Error("Senha muito curta.");
    await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, s.userId));
    return "Senha alterada.";
  });
}

/** Short call to the site model so the operator can see whether the AI works (and why not). */
export async function testAiAction() {
  const s = await requireSession();
  return act("/settings#integracoes", async () => {
    const provider = llmProvider();
    if (!provider) throw new Error("Nenhuma chave de IA encontrada no servidor. Confira se OPENROUTER_API_KEY está nas variáveis do serviço web no Railway e faça Redeploy.");
    const model = llmSiteModel(provider);
    let err = "";
    const t0 = Date.now();
    const r = await llmText(s.orgId, "ai_test", { system: "Responda apenas: ok", user: "Teste de conexão.", model, maxTokens: 20, json: false, stream: true, timeoutMs: 60_000, onError: (m) => (err = m) });
    if (!r) {
      if (/\b401\b/.test(err)) throw new Error(`O OpenRouter recusou a chave (401). Crie uma chave nova em openrouter.ai/settings/keys, cole em OPENROUTER_API_KEY no serviço web do Railway e espere o redeploy. Detalhe: ${err}`);
      if (/\b402\b/.test(err)) throw new Error(`Sem créditos no OpenRouter (402). Adicione créditos em openrouter.ai/settings/credits. Detalhe: ${err}`);
      throw new Error(`A IA falhou (${provider}, ${model}): ${err}`);
    }
    return `IA funcionando: ${model} via ${provider} respondeu “${r.text.trim().slice(0, 40)}” em ${((Date.now() - t0) / 1000).toFixed(1)}s.`;
  });
}
