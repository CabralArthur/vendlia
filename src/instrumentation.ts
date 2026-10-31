/**
 * Runs the background workers (search, site generation, WhatsApp sending/receiving) inside the
 * web server, so a single Railway service is enough. Set WORKER_IN_WEB=false when running a
 * separate worker service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKER_IN_WEB === "false" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    console.warn("[vendlia] DATABASE_URL/REDIS_URL ausentes: processamento em segundo plano desligado");
    return;
  }
  const { startWorkers } = await import("./worker/run");
  await startWorkers("web").catch((e) => console.error("[vendlia] falha ao iniciar workers", e));
}
