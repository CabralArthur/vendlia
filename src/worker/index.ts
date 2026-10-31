// Standalone worker process (optional). By default the web service already runs the workers;
// use this only if you deploy a separate "worker" service with WORKER_IN_WEB=false on the web.
import { startWorkers, stopWorkers } from "./run";
import { pool } from "../server/db";

startWorkers("worker").catch((e) => {
  console.error("[worker] falha ao iniciar", e);
  process.exit(1);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const force = setTimeout(() => process.exit(1), 25_000);
  await stopWorkers();
  await pool.end().catch(() => {});
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
