import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Used ONLY to introspect the database and generate TypeScript types (drizzle-kit pull).
// Our migrations stay hand-written SQL in db/migrations.
export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle-pull",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
