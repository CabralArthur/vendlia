import { eq } from "drizzle-orm";
import { db, organizations, type OrgSettings } from "./db";

export const DEFAULT_OUTREACH_TEMPLATE =
  "Olá, {{saudacao}}! Aqui é {{operador}}. Vi a {{empresa}} aqui em {{cidade}} e montei uma demonstração de como poderia ficar um site para vocês: {{link}}\n\nÉ só uma prévia, sem compromisso. Se quiser, te explico como funciona. Caso prefira não receber mensagens, é só responder SAIR.";

export function defaultOrgSettings(): OrgSettings {
  return {
    allowColdOutreach: true,
    autoReplyInformational: true,
    classifierConfidenceThreshold: 0.7,
    businessHoursStart: 9,
    businessHoursEnd: 18,
    outreachTemplate: DEFAULT_OUTREACH_TEMPLATE,
    followUpEnabled: true,
    followUpAfterHours: 48,
    holdingReply: true,
    holdingReplyAfterMinutes: 5,
  };
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const [o] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  return { ...defaultOrgSettings(), ...(o?.settings ?? {}) };
}
