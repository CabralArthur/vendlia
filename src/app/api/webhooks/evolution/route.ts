import { intakeEvolutionWebhook } from "@/server/whatsapp/service";
import type { EvolutionWebhook } from "@/server/whatsapp/evolution";

export const dynamic = "force-dynamic";

// Evolution may append "/<event-name>" when byEvents is on; both paths are accepted.
export async function POST(req: Request) {
  let body: EvolutionWebhook;
  try {
    body = (await req.json()) as EvolutionWebhook;
  } catch {
    return new Response("json inválido", { status: 400 });
  }
  const token = req.headers.get("x-vendlia-token");
  try {
    const r = await intakeEvolutionWebhook(token, body);
    return new Response(r.body, { status: r.status });
  } catch (e) {
    console.error("[webhook evolution]", e);
    return new Response("erro", { status: 500 }); // provider retries
  }
}
