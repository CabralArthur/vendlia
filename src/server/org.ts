import { eq } from "drizzle-orm";
import { db, organizations, products, type OrgSettings } from "./db";

export const DEFAULT_OUTREACH_TEMPLATE =
  "Olá, {{saudacao}}! Aqui é {{operador}}. Vi a {{empresa}} aqui em {{cidade}} e montei uma demonstração de como poderia ficar um site para vocês: {{link}}\n\nÉ só uma prévia, sem compromisso. Se quiser, te explico como funciona. Caso prefira não receber mensagens, é só responder SAIR.";

export function defaultOrgSettings(): OrgSettings {
  return {
    allowColdOutreach: true,
    autoReplyInformational: false,
    classifierConfidenceThreshold: 0.7,
    businessHoursStart: 9,
    businessHoursEnd: 18,
    outreachTemplate: DEFAULT_OUTREACH_TEMPLATE,
    followUpEnabled: true,
    followUpAfterHours: 48,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function seedOrgDefaults(tx: Tx | typeof db, orgId: string) {
  await tx.insert(products).values([
    {
      orgId,
      name: "Site Essencial",
      description: "Site one-page com botão de WhatsApp, SEO básico, hospedagem e suporte.",
      features: ["Site one-page responsivo", "Botão direto para WhatsApp", "SEO básico", "Hospedagem com HTTPS", "Ajustes simples mensais"],
      setupPriceCents: 49700,
      monthlyPriceCents: 7900,
    },
    {
      orgId,
      name: "Site Profissional",
      description: "Site completo com domínio próprio, formulários, analytics e manutenção.",
      features: ["Tudo do Essencial", "Domínio próprio configurado", "Formulário de contato", "Relatório de visitas", "Manutenção mensal"],
      setupPriceCents: 99700,
      monthlyPriceCents: 14900,
    },
  ]);
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  return { ...defaultOrgSettings(), ...(o?.settings ?? {}) };
}
