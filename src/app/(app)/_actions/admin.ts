"use server";
import { eq, sql } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { act, str } from "@/server/action";
import { db, organizations } from "@/server/db";
import { isOwnerEmail } from "@/server/billing";
import { audit } from "@/server/events";

async function requireOwner() {
  const s = await requireSession();
  if (!isOwnerEmail(s.user.email)) throw new Error("Acesso restrito à administração da plataforma");
  return s;
}

export async function adminAccountAction(fd: FormData) {
  const s = await requireOwner();
  return act("/admin", async () => {
    const orgId = str(fd, "orgId");
    const op = str(fd, "op");
    if (op === "extend") {
      await db.update(organizations).set({ trialEndsAt: sql`greatest(coalesce(${organizations.trialEndsAt}, now()), now()) + interval '7 days'`, billingStatus: "trialing" }).where(eq(organizations.id, orgId));
    } else if (op === "unlimited") {
      await db.update(organizations).set({ unlimited: sql`not ${organizations.unlimited}` }).where(eq(organizations.id, orgId));
    } else throw new Error("Ação inválida");
    await audit(s.orgId, s.userId, `admin.${op}`, undefined, { orgId });
    return op === "extend" ? "Teste estendido por mais 7 dias." : "Acesso total alterado.";
  });
}
