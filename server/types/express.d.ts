/**
 * Express type augmentations.
 *
 * Loaded via tsconfig.server.json's broad `include`. Adds:
 *   - `req.id`     — request correlation id (set by request-id middleware)
 *   - `req.user`   — authenticated user (set by require-auth middleware)
 *   - `req.log`    — child pino logger with reqId bound (set by logger middleware)
 *
 * Marker fields, NEVER set them on every request. The middleware
 * setting them is responsible for the right ordering.
 */

import type { Logger } from "pino";
import "express";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    user?: {
      id: string;
      email: string;
      isAdmin: boolean;
    };
    log: Logger;
  }
}

export {};
