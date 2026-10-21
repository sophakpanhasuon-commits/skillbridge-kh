import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./index";

/**
 * Minimal SQL migration runner.
 *
 * Rules:
 *  - Migrations live in apps/api/db/migrations as NNNN_description.sql and run in name order.
 *  - Each file runs exactly once; applied names are recorded in `schema_migrations`.
 *  - NEVER edit a migration that has already been applied. Add a new numbered file instead.
 *  - Each file wraps itself in BEGIN/COMMIT so a failure leaves the database untouched.
 *
 * Usage:
 *   pnpm db:migrate               apply pending migrations
 *   pnpm db:migrate --baseline    record existing files as applied WITHOUT running them
 *                                 (used once, because 0001 and 0002 were run by hand)
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

async function main(): Promise<void> {
  const baseline = process.argv.includes("--baseline");
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    // Supabase exposes public tables via its REST API, so lock this one down too.
    await client.query("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY");

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;

      if (baseline) {
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        console.log(`baselined  ${file}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`applying   ${file}`);
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    }

    // Safety net: every public table must have Row Level Security enabled (see migration 0002).
    const { rows: open } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity",
    );
    if (open.length > 0) {
      console.error(
        `RLS is OFF for: ${open.map((t) => t.tablename).join(", ")}\n` +
          "Add `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` to a new migration.",
      );
      process.exitCode = 1;
    } else {
      console.log("Migrations up to date. RLS enabled on all public tables.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
