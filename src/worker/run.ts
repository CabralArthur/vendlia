import { Worker, DelayedError, type Job } from "bullmq";
import { and, eq, lt } from "drizzle-orm";
import { newRedis, redis } from "../server/redis";
import { QUEUES, queue, enqueue } from "../server/queue";
import { db, messages } from "../server/db";
import { runDiscovery, purgeExpiredSourceData } from "../server/discovery/run";
import { generateSiteForLead } from "../server/sites/service";
import { processProviderEvent, queueDueFollowUps, sendQueuedMessage, syncInstances } from "../server/whatsapp/service";

const log = (msg: string, extra?: unknown) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: "worker", msg, ...(extra ? { extra } : {}) }));

const workers: Worker[] = [];

function make(name: string, concurrency: number, fn: (job: Job, token?: string) => Promise<unknown>) {
  const w = new Worker(name, fn, { connection: newRedis(), concurrency });
  w.on("failed", (job, err) => log("job failed", { queue: name, id: job?.id, attempts: job?.attemptsMade, err: err.message }));
  w.on("error", (err) => log("worker error", { queue: name, err: err.message }));
  workers.push(w);
  return w;
}

let started = false;

/** Starts all BullMQ workers and repeatable jobs. Safe to call once per process. */
export async function startWorkers(where: "worker" | "web") {
  if (started) return;
  started = true;
  make(QUEUES.discovery, 2, async (job) => runDiscovery(job.data.runId));
  make(QUEUES.sites, 3, async (job) => generateSiteForLead(job.data.orgId, job.data.leadId, { template: job.data.template, mode: job.data.mode, instructions: job.data.instructions }));
  make(QUEUES.inbound, 5, async (job) => processProviderEvent(job.data.providerEventId));

  // Outbound uses concurrency 1 per process to keep pacing deterministic.
  make(QUEUES.outbound, 1, async (job, token) => {
    const out = await sendQueuedMessage(job.data.messageId);
    if (out.status === "delay") {
      await job.moveToDelayed(out.until.getTime(), token);
      throw new DelayedError(out.reason);
    }
    return out;
  });

  make(QUEUES.maintenance, 1, async (job) => {
    switch (job.name) {
      case "followups":
        return { queued: await queueDueFollowUps() };
      case "sync-instances":
        return syncInstances();
      case "purge-sources":
        return { purged: await purgeExpiredSourceData() };
      case "requeue-stuck": {
        // Re-enqueue messages left "queued" (e.g. Redis data loss). jobId dedup keeps this idempotent.
        const stuck = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.status, "queued"), lt(messages.createdAt, new Date(Date.now() - 10 * 60_000))))
          .limit(500);
        for (const m of stuck) await enqueue(QUEUES.outbound, "send", { messageId: m.id }, { jobId: `msg-${m.id}` });
        return { requeued: stuck.length };
      }
      case "heartbeat":
        await redis().set("vendlia:worker:heartbeat", Date.now().toString(), "EX", 180);
        return;
    }
  });
  await schedule();
  // Inside the web server, close workers gracefully on deploy (the standalone worker handles its own signals).
  if (where === "web") process.once("SIGTERM", () => void stopWorkers());
  log("worker iniciado", { where, queues: Object.values(QUEUES) });
}

async function schedule() {
  const q = queue(QUEUES.maintenance);
  const opts = { removeOnComplete: 50, removeOnFail: 50 };
  await q.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat", opts });
  await q.upsertJobScheduler("followups", { pattern: "15 * * * *" }, { name: "followups", opts });
  await q.upsertJobScheduler("sync-instances", { every: 5 * 60_000 }, { name: "sync-instances", opts });
  await q.upsertJobScheduler("requeue-stuck", { every: 10 * 60_000 }, { name: "requeue-stuck", opts });
  await q.removeJobScheduler("billing").catch(() => {}); // removed feature (older deploys)
  await q.upsertJobScheduler("purge-sources", { pattern: "30 6 * * *" }, { name: "purge-sources", opts });
  await redis().set("vendlia:worker:heartbeat", Date.now().toString(), "EX", 180);
}

export async function stopWorkers() {
  await Promise.allSettled(workers.map((w) => w.close()));
}
