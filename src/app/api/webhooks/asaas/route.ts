import { env } from "@/server/env";
import { handleAsaasEvent } from "@/server/billing";

export const dynamic = "force-dynamic";

/** Asaas payment/subscription events. Authenticated by the token configured in the Asaas panel. */
export async function POST(req: Request) {
  const token = env().ASAAS_WEBHOOK_TOKEN;
  if (!token || req.headers.get("asaas-access-token") !== token) return new Response("unauthorized", { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    const r = await handleAsaasEvent(body as Parameters<typeof handleAsaasEvent>[0]);
    return Response.json({ ok: true, result: r });
  } catch (e) {
    console.error("[asaas webhook]", e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 }); // Asaas retries
  }
}
