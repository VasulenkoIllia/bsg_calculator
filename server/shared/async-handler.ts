/**
 * Tiny wrapper to forward async controller errors to Express's error
 * middleware chain. Without it, an `await` that throws in a controller
 * leaves the request hanging because Express's default error handling
 * only catches synchronous throws.
 *
 * Usage:
 *   router.post("/login", asyncHandler(authController.login));
 */

import type { NextFunction, Request, Response } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown;

export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
