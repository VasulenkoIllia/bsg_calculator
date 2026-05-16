/**
 * UUID path-parameter validation.
 *
 * Without this, passing a non-UUID `:id` (e.g. /users/not-a-uuid)
 * makes Postgres throw "invalid input syntax for type uuid" — which
 * leaks as an unhandled 500 with internal error envelope. With this,
 * the controller surfaces a clean VALIDATION_FAILED 400.
 *
 * Usage:
 *   const id = parseUuidParam(req, "id");
 */

import type { Request } from "express";
import { z } from "zod";
import { ValidationError } from "./errors";

const uuidSchema = z.string().uuid();

export function parseUuidParam(req: Request, paramName: string): string {
  const raw = req.params[paramName];
  const result = uuidSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      [{ path: ["params", paramName], message: "Must be a valid UUID." }],
      `Invalid ${paramName} parameter.`
    );
  }
  return result.data;
}
