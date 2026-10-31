import { and, asc, eq, inArray, like, not, sql } from "drizzle-orm";
import { db, businesses, conversations, leads, messages, websites, whatsappInstances } from "./db";
import { env } from "./env";
import { isDemoInstance, DEMO_INSTANCE_PREFIX } from "@/lib/demo";

export type SetupStep = {
  id: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: boolean;
  optional?: boolean;
  blockedBy?: string;
};

/** Real setup progress — demo data never counts. */
export async function getSetupProgress(orgId: string): Promise<{ steps: SetupStep[]; done: number; required: number }> {
  const e = env();
  const evoReady = !!(e.EVOLUTION_API_URL && e.EVOLUTION_API_KEY);
  const [inst, [biz], [sites], [sent], [won]] = await Promise.all([
    db.select({ status: whatsappInstances.status, name: whatsappInstances.name }).from(whatsappInstances).where(eq(whatsappInstances.orgId, orgId)),
    db.select({ n: sql<number>`count(*)::int` }).from(businesses).where(and(eq(businesses.orgId, orgId), eq(businesses.isDemo, false))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(websites)
      .innerJoin(leads, eq(leads.id, websites.leadId))
      .innerJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(eq(websites.orgId, orgId), eq(businesses.isDemo, false))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(whatsappInstances, eq(whatsappInstances.id, conversations.instanceId))
      .where(
        and(
          eq(messages.orgId, orgId),
          eq(messages.kind, "outreach"),
          inArray(messages.status, ["sent", "delivered", "read"]),
          not(like(whatsappInstances.name, `${DEMO_INSTANCE_PREFIX}%`)),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(websites)
      .innerJoin(leads, eq(leads.id, websites.leadId))
      .innerJoin(businesses, eq(businesses.id, leads.businessId))
      .where(and(eq(websites.orgId, orgId), eq(websites.status, "published"), eq(businesses.isDemo, false))),
  ]);
  const waOpen = inst.some((i) => i.status === "open" && !isDemoInstance(i.name));

  const steps: SetupStep[] = [
    {
      id: "leads",
      title: "Trazer as primeiras empresas",
      why: "Sem empresas não há para quem vender. Busque por cidade e segmento, importe uma planilha ou cadastre à mão.",
      href: "/discovery",
      cta: "Prospectar",
      done: (biz?.n ?? 0) > 0,
    },
    {
      id: "preview",
      title: "Gerar a primeira demonstração",
      why: "A demonstração é o que faz o empresário responder: ele vê o site dele pronto antes de pagar.",
      href: "/leads",
      cta: "Abrir leads",
      done: (sites?.n ?? 0) > 0,
    },
    {
      id: "whatsapp",
      title: "Conectar um número de WhatsApp",
      why: "Libera o envio automático do primeiro contato e o recebimento das respostas no Inbox. Sem isso, você manda o link da demonstração pelo seu celular.",
      href: "/settings#whatsapp",
      cta: "Conectar",
      done: waOpen,
      blockedBy: evoReady ? undefined : "Falta subir a Evolution API no Railway e preencher EVOLUTION_API_URL / EVOLUTION_API_KEY.",
    },
    {
      id: "contact",
      title: "Enviar o primeiro contato",
      why: "Selecione leads com demonstração e clique em “Enviar 1º contato”. O envio respeita horário comercial e limites do número.",
      href: "/leads?stage=preview_ready",
      cta: "Ver leads prontos",
      done: (sent?.n ?? 0) > 0,
    },
    {
      id: "publish",
      title: "Publicar o primeiro site",
      why: "Cliente fechou e aprovou o conteúdo? Publique no Studio: o site vai ao ar sem a faixa de demonstração.",
      href: "/leads?stage=interested",
      cta: "Ver interessados",
      done: (won?.n ?? 0) > 0,
    },
  ];
  const req = steps.filter((s) => !s.optional);
  return { steps, done: req.filter((s) => s.done).length, required: req.length };
}

export type DemoRefs = { hasDemo: boolean; leadId?: string; siteId?: string; conversationId?: string };

export async function getDemoRefs(orgId: string): Promise<DemoRefs> {
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(eq(leads.orgId, orgId), eq(businesses.isDemo, true), eq(leads.stage, "interested")))
    .limit(1);
  const [any] = lead ? [lead] : await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.orgId, orgId), eq(businesses.isDemo, true))).limit(1);
  if (!any) return { hasDemo: false };
  if (!lead) return { hasDemo: true };
  const [site] = await db.select({ id: websites.id }).from(websites).where(eq(websites.leadId, lead.id)).orderBy(asc(websites.createdAt)).limit(1);
  const [conv] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.leadId, lead.id)).limit(1);
  return { hasDemo: true, leadId: lead.id, siteId: site?.id, conversationId: conv?.id };
}

