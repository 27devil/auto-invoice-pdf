import { Redis } from "ioredis";

let connection: Redis | null = null;

/** Shared ioredis connection for BullMQ (spec §9, §36). BullMQ requires
 * `maxRetriesPerRequest: null` on the connection it's given. */
export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set. The queue cannot start without Redis — see docs/deployment.md.");
    }
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}
