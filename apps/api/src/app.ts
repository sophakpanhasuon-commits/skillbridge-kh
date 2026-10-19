import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { pool } from "./db";
import { env } from "./env";

export const app = express();

app.disable("x-powered-by"); // don't advertise the framework
app.use(helmet()); // sets secure HTTP headers (NFR-SEC-08)

// Only our own frontend may call the API from a browser; credentials allows httpOnly cookies later.
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use(express.json({ limit: "100kb" })); // cap body size to blunt abuse

// Structured request logs. Redact credentials so they never reach log files (NFR-PRIV-07).
app.use(
  pinoHttp({
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: ["req.headers.authorization", "req.headers.cookie"],
  }),
);

/**
 * Health endpoint (NFR-OBS-02). Reports whether the API AND its database are reachable.
 * Every response uses the same envelope: { data, error }.
 */
app.get("/api/v1/health", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query<{ now: Date }>("SELECT now()");
    res.json({ data: { status: "ok", dbTime: rows[0]?.now ?? null }, error: null });
  } catch (err) {
    req.log.error({ err }, "health check failed");
    res.status(503).json({
      data: null,
      error: { code: "DB_UNAVAILABLE", message: "Database is not reachable" },
    });
  }
});

// Unknown route -> consistent JSON 404 instead of Express's HTML page.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Last-resort error handler. Log details server-side, return nothing sensitive to the client.
// Express recognises error handlers by their 4 parameters, so `_next` must stay.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "unhandled error");
  res.status(500).json({
    data: null,
    error: { code: "INTERNAL", message: "Something went wrong" },
  });
});
