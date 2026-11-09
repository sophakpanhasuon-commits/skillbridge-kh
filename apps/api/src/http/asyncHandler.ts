import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express route handlers that are `async` can reject. On Express 4 a rejection that nobody
 * catches crashes the process; this wrapper forwards it to the global error handler instead.
 * It is harmless on Express 5, so we use it everywhere and never think about the version.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
