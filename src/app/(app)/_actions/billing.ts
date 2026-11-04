"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { act, str } from "@/server/action";
import { asaasConfigured, buySitePack, cancelSubscription, startCheckout } from "@/server/billing";
import { audit } from "@/server/events";

const errUrl = (back: string, e: unknown) => {
  const msg = e instanceof z.ZodError ? e.issues[0]!.message : e instanceof Error ? e.message : "Erro inesperado";
  return `${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(msg.slice(0, 300))}`;
};

/** Creates the Asaas subscription and sends the customer to the invoice (PIX, boleto or card). */
export async function checkoutAction(fd: FormData) {
  const s = await requireRole("owner", "admin");
  const back = `/planos/assinar?plano=${encodeURIComponent(str(fd, "plan"))}&ciclo=${encodeURIComponent(str(fd, "cycle"))}`;
  let url: string;
  try {
    if (!asaasConfigured()) throw new Error("O pagamento ainda não está configurado. Fale com o suporte.");
    const input = z
      .object({
        plan: z.enum(["inicial", "pro", "agencia"]),
        cycle: z.enum(["monthly", "quarterly", "yearly"]),
        name: z.string().min(3, "Informe o nome completo ou a razão social"),
        email: z.string().email("E-mail inválido"),
        cpfCnpj: z.string().min(11, "Informe o CPF ou o CNPJ"),
        phone: z.string().optional(),
      })
      .parse({ plan: str(fd, "plan"), cycle: str(fd, "cycle"), name: str(fd, "name"), email: str(fd, "email"), cpfCnpj: str(fd, "cpfCnpj"), phone: str(fd, "phone") || undefined });
    url = await startCheckout(s.orgId, input);
    await audit(s.orgId, s.userId, "billing.checkout", undefined, { plan: input.plan, cycle: input.cycle });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[checkout]", e instanceof Error ? e.message : e);
    redirect(errUrl(back, e));
  }
  redirect(url);
}

export async function buyPackAction() {
  const s = await requireRole("owner", "admin");
  let url: string;
  try {
    url = await buySitePack(s.orgId);
  } catch (e) {
    unstable_rethrow(e);
    redirect(errUrl("/planos", e));
  }
  redirect(url);
}

export async function cancelAction() {
  const s = await requireRole("owner", "admin");
  return act("/planos", async () => {
    await cancelSubscription(s.orgId);
    await audit(s.orgId, s.userId, "billing.cancel");
    return "Assinatura cancelada. Você continua com acesso até o fim do período já pago.";
  });
}
