/**
 * DEVELOPMENT SANDBOX — emulates the subset of Evolution API v2 that Vendlia uses, so the full
 * flow (QR → connected → send → inbound reply → webhook) can be exercised locally without a real
 * WhatsApp number. Never deploy this. Run: pnpm tsx scripts/evolution-sandbox.ts
 *
 * Simulate a lead replying:  curl -XPOST localhost:8089/_simulate -d '{"instance":"<name>","from":"5581999998888","text":"Quanto fica?"}'
 */
import http from "node:http";

const PORT = Number(process.env.SANDBOX_PORT ?? 8089);
const KEY = process.env.EVOLUTION_API_KEY ?? "sandbox-key";
type Inst = { name: string; webhook?: { url: string; headers?: Record<string, string> }; state: string };
const instances = new Map<string, Inst>();
const sent: unknown[] = [];
let seq = 0;
const QR = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function hook(inst: Inst, event: string, data: unknown) {
  if (!inst.webhook) return;
  try {
    await fetch(inst.webhook.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(inst.webhook.headers ?? {}) },
      body: JSON.stringify({ event, instance: inst.name, data, date_time: new Date().toISOString(), sender: "sandbox", apikey: KEY }),
    });
  } catch (e) {
    console.error("[sandbox] webhook falhou", (e as Error).message);
  }
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
  const url = new URL(req.url!, "http://x");
  const send = (code: number, obj: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (url.pathname === "/_simulate") {
    const inst = instances.get(body.instance) ?? [...instances.values()][0];
    if (!inst) return send(404, { error: "no instance" });
    await hook(inst, "messages.upsert", { key: { remoteJid: `${body.from}@s.whatsapp.net`, fromMe: false, id: `SIM${++seq}${Date.now()}` }, pushName: body.name ?? "Cliente", message: { conversation: body.text }, messageType: "conversation", messageTimestamp: Math.floor(Date.now() / 1000) });
    return send(200, { ok: true });
  }
  if (url.pathname === "/_sent") return send(200, sent);
  if (req.headers.apikey !== KEY) return send(401, { error: "unauthorized" });
  const [, group, action, name] = url.pathname.split("/");
  if (group === "instance" && action === "create") {
    const inst: Inst = { name: body.instanceName, webhook: body.webhook, state: "connecting" };
    instances.set(inst.name, inst);
    // Simulate the user scanning the QR a few seconds later.
    setTimeout(async () => {
      inst.state = "open";
      await hook(inst, "connection.update", { instance: inst.name, state: "open", wuid: "5581900000000@s.whatsapp.net", statusReason: 200 });
    }, 4000);
    return send(201, { instance: { instanceName: inst.name, status: "connecting" }, qrcode: { base64: `data:image/png;base64,${QR}` } });
  }
  const inst = name ? instances.get(decodeURIComponent(name)) : undefined;
  if (group === "webhook" && action === "set" && inst) {
    inst.webhook = body.webhook;
    return send(200, { ok: true });
  }
  if (group === "instance" && action === "connect" && inst) return send(200, inst.state === "open" ? { instance: { state: "open" } } : { base64: `data:image/png;base64,${QR}`, code: "x", count: 1 });
  if (group === "instance" && action === "connectionState" && inst) return send(200, { instance: { instanceName: inst.name, state: inst.state } });
  if (group === "instance" && (action === "logout" || action === "delete") && inst) {
    inst.state = "close";
    return send(200, { status: "SUCCESS" });
  }
  if (group === "chat" && action === "whatsappNumbers" && inst) return send(200, (body.numbers as string[]).map((n) => ({ exists: n.length === 13, jid: `${n}@s.whatsapp.net`, number: n })));
  if (group === "message" && action === "sendText" && inst) {
    const id = `SANDBOX${++seq}${Date.now()}`;
    sent.push({ instance: inst.name, ...body, id });
    console.log(`[sandbox] → ${body.number}: ${String(body.text).slice(0, 80).replace(/\n/g, " ")}`);
    setTimeout(() => hook(inst, "messages.update", { keyId: id, remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, status: "DELIVERY_ACK" }), 800);
    return send(201, { key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id }, status: "PENDING" });
  }
  send(404, { error: "not found", path: url.pathname });
});
server.listen(PORT, () => console.log(`[sandbox] Evolution API sandbox em http://localhost:${PORT}`));
