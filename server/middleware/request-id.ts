/**
 * Attach a stable correlation id to every request.
 *
 * Honours an incoming `X-Request-Id` header (so upstream proxies /
 * load balancers / tests can pin a known id); otherwise generates a
 * fresh UUID v4. The id is exposed on `req.id` and echoed back in the
 * response's `X-Request-Id` header so clients (and logs from other
 * systems) can correlate.
 */

import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header("x-request-id");
    const id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
