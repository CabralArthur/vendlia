"use server";
import { requireRole } from "@/server/auth";
import { act } from "@/server/action";
import { removeDemo } from "@/server/demo";
import { audit } from "@/server/events";
import { revalidatePath } from "next/cache";

export async function removeDemoAction() {
  const s = await requireRole("owner", "admin");
  return act("/onboarding", async () => {
    const n = await removeDemo(s.orgId);
    await audit(s.orgId, s.userId, "demo.remove", undefined, { businesses: n });
    revalidatePath("/", "layout");
    return "Dados de exemplo removidos. Seus dados reais não foram alterados.";
  });
}
