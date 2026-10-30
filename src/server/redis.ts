import IORedis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __vendliaRedis?: IORedis };

const opts: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true, family: 0 };

/** Shared command connection (not for blocking ops / subscribe). */
export function redis(): IORedis {
  if (!g.__vendliaRedis) g.__vendliaRedis = new IORedis(env().REDIS_URL, opts);
  return g.__vendliaRedis;
}

/** Dedicated connection (BullMQ workers, pub/sub subscribers). */
export function newRedis(): IORedis {
  return new IORedis(env().REDIS_URL, opts);
}
