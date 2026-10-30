import { desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, leads, businesses, LEAD_STAGES } from "@/server/db";
import { PageHeader, STAGE_LABEL } from "@/components/ui";
import { Kanban } from "@/components/kanban";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const s = await requireSession();
  const rows = await db
    .select({ id: leads.id, name: businesses.name, city: businesses.city, score: leads.score, stage: leads.stage, hasSite: sql<boolean>`exists(select 1 from websites w where w.lead_id = ${leads.id})` })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(eq(leads.orgId, s.orgId))
    .orderBy(desc(leads.score))
    .limit(3000);
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Arraste os cards entre as etapas. Mudanças ficam no histórico do lead." />
      <Kanban columns={LEAD_STAGES.map((id) => ({ id, label: STAGE_LABEL[id] }))} cards={rows} />
    </>
  );
}
