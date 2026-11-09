import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/**
 * One shared connection pool for the whole process. Opening a new Postgres
 * connection per request is slow and would exhaust Supabase's connection limit;
 * a pool reuses a small set of open connections instead.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10, // keep well below the free-tier connection limit
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000, // fail fast instead of hanging forever
  // Supabase requires TLS. This accepts its certificate chain without pinning a CA file.
  // Acceptable for development; for production we will pin Supabase's CA certificate.
  ssl: { rejectUnauthorized: false },
});

// An idle client can error (e.g. network drop). Without this handler Node would crash.
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

/** Typed query builder on top of the same pool. Use this for application queries. */
export const db = drizzle(pool, { schema });
