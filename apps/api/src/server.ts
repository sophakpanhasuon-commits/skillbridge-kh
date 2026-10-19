import { app } from "./app";
import { pool } from "./db";
import { env } from "./env";

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/**
 * Graceful shutdown: hosts like Render send SIGTERM on every deploy.
 * Stop accepting new requests, let in-flight ones finish, close DB connections, then exit.
 */
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    pool
      .end()
      .catch((err: Error) => console.error("Error closing pool:", err.message))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if something hangs
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
