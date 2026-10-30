import { intakeAsaasWebhook } from "@/server/commerce";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("json inválido", { status: 400 });
  }
  try {
    const r = await intakeAsaasWebhook(req.headers.get("asaas-access-token"), body as never);
    return Response.json({ received: r.status === 200, detail: r.body }, { status: r.status });
  } catch (e) {
    console.error("[webhook asaas]", e);
    return new Response("erro", { status: 500 });
  }
}
