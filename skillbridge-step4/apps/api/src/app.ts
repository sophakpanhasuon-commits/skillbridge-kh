import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { authRouter } from "./auth/auth.routes";
import { pool } from "./db";
import { env } from "./env";
import { AppError } from "./errors";

export const app = express();

app.disable("x-powered-by"); // don't advertise the framework

// Behind Render's load balancer every request appears to come from the proxy's IP.
// Trusting one proxy hop makes req.ip the REAL client, so rate limiting works per user.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet()); // sets secure HTTP headers (NFR-SEC-08)

// Only our own frontend may call the API from a browser; credentials allows httpOnly cookies later.
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use(express.json({ limit: "100kb" })); // cap body size to blunt abuse

// Structured request logs. Redact credentials so they never reach log files (NFR-PRIV-07).
// NOTE: request BODIES are not logged by default, which keeps passwords out of the logs.
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

app.use("/api/v1/auth", authRouter);

// Unknown route -> consistent JSON 404 instead of Express's HTML page.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Route not found" } });
});

/**
 * Global error handler: the ONE place that decides what the client sees.
 * Express recognises error handlers by their 4 parameters, so `_next` must stay.
 */
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // 1. Validation failed (zod) -> 400 with a per-field message map.
  if (err instanceof ZodError) {
    res.status(400).json({
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        fields: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // 2. An error we threw deliberately (AppError) -> its own status and code.
  if (err instanceof AppError) {
    res.status(err.status).json({ data: null, error: { code: err.code, message: err.message } });
    return;
  }

  // 3. Malformed or oversized JSON body (raised by express.json).
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") {
    res.status(400).json({ data: null, error: { code: "INVALID_JSON", message: "Malformed JSON" } });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ data: null, error: { code: "PAYLOAD_TOO_LARGE", message: "Body too large" } });
    return;
  }

  // 4. Anything else is a bug. Log details server-side, reveal nothing to the client.
  req.log.error({ err }, "unhandled error");
  res.status(500).json({ data: null, error: { code: "INTERNAL", message: "Something went wrong" } });
});
