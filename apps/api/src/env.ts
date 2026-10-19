import "dotenv/config";
import { z } from "zod";

/**
 * Validate configuration ONCE at startup. If something is missing or malformed
 * the server refuses to boot ("fail fast") instead of crashing later at 2 a.m.
 * The rest of the app imports `env`, never `process.env`, so every setting is typed.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print which variables are wrong, but never print their values (they may be secrets).
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
