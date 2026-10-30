import { Queue, type JobsOptions } from "bullmq";
import { redis } from "./redis";

export const QUEUES = {
  discovery: "discovery",
  sites: "sites",
  outbound: "whatsapp-outbound",
  inbound: "whatsapp-inbound",
  payments: "payments",
  maintenance: "maintenance",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const g = globalThis as unknown as { __vendliaQueues?: Map<string, Queue> };
g.__vendliaQueues ??= new Map();

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export function queue(name: QueueName): Queue {
  let q = g.__vendliaQueues!.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis(), defaultJobOptions });
    g.__vendliaQueues!.set(name, q);
  }
  return q;
}

export async function enqueue(name: QueueName, jobName: string, data: unknown, opts?: JobsOptions) {
  return queue(name).add(jobName, data, opts);
}
