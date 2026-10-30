import { getSession } from "@/server/auth";
import { newRedis } from "@/server/redis";
import { channelFor } from "@/server/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const sub = newRedis();
  const enc = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch {}
      };
      sub.on("message", (_ch, msg) => send(msg));
      await sub.subscribe(channelFor(s.orgId));
      send(JSON.stringify({ type: "hello" }));
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 25_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        sub.disconnect();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(ping);
      sub.disconnect();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
