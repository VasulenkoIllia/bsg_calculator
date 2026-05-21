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
import type { UserRole } from "../db/schema";
import "express";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    user?: {
      id: string;
      email: string;
      // Phase 8 Stage 1: hierarchical role enum (user ⊂ admin ⊂ super_admin).
      // Replaces the legacy boolean `isAdmin` claim. Gates use the
      // generic `requireRole(min)` middleware instead of branching
      // on a boolean.
      role: UserRole;
    };
    log: Logger;
  }
}

export {};
