// Runs SQL migrations from ./drizzle with an advisory lock so web replicas never race.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL ausente");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await client.query("SELECT pg_advisory_lock(727274)");
  await migrate(drizzle(client), { migrationsFolder: path.join(dir, "..", "drizzle") });
  console.log("[migrate] ok");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
