import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../http/asyncHandler";
import { registerSchema } from "./auth.schemas";
import { registerUser } from "./auth.service";

export const authRouter = Router();

// NFR-SEC-06. In-memory counter: resets when the server restarts and is per-instance,
// which is fine for one server. Moving to several servers would need a shared store.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    data: null,
    error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" },
  },
});

authRouter.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body); // throws ZodError -> 400 in the global handler
    const user = await registerUser(input);
    res.status(201).json({ data: { user }, error: null });
  }),
);
