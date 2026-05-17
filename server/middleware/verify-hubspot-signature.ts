/**
 * HubSpot webhook signature verification (HMAC SHA-256 v3).
 *
 * Per HubSpot's docs (https://developers.hubspot.com/docs/api/webhooks/validating-requests):
 *   - Source string = HTTP method + request URI + request body + timestamp
 *   - Sign with `HUBSPOT_WEBHOOK_SECRET` using SHA-256
 *   - Compare base64-encoded result with the `X-HubSpot-Signature-v3` header
 *   - Also reject if `X-HubSpot-Request-Timestamp` is more than 5 minutes
 *     in the past (replay-attack defence)
 *
 * Constant-time comparison via `crypto.timingSafeEqual` so a partial
 * match isn't disclosed via response timing.
 *
 * IMPORTANT: Express's body parser MUST be configured to capture the
 * RAW body for this route. The default JSON parser produces an object,
 * but we need the original bytes to feed into the HMAC. The receiver
 * route opts in via `express.raw({ type: "asterisk/asterisk" })` (any
 * Content-Type) before this middleware runs.
 */

import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "./logger";
import { ForbiddenError } from "../shared/errors";

const SIGNATURE_HEADER = "x-hubspot-signature-v3";
const TIMESTAMP_HEADER = "x-hubspot-request-timestamp";
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export function verifyHubspotSignature() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!env.HUBSPOT_WEBHOOK_SECRET) {
      // Production blocks startup if the secret is missing (env
      // superRefine in config/env.ts). In dev a missing secret means
      // webhooks are configurably-off — surface a 403 so a misconfigured
      // dev instance fails loudly.
      throw new ForbiddenError(
        "HUBSPOT_WEBHOOK_SECRET is not configured — cannot verify webhook signatures."
      );
    }

    const signature = req.header(SIGNATURE_HEADER);
    const timestamp = req.header(TIMESTAMP_HEADER);
    if (!signature || !timestamp) {
      logger.warn(
        { hasSig: Boolean(signature), hasTs: Boolean(timestamp) },
        "[hubspot:webhook] missing signature or timestamp header"
      );
      throw new ForbiddenError("Webhook signature missing.");
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new ForbiddenError("Webhook timestamp malformed.");
    }
    // Reject events more than 5 minutes old to defang replay attacks
    // against captured-and-resent payloads.
    const ageMs = Date.now() - ts;
    if (ageMs > MAX_TIMESTAMP_AGE_MS || ageMs < -MAX_TIMESTAMP_AGE_MS) {
      logger.warn({ ageMs }, "[hubspot:webhook] signature timestamp outside accepted window");
      throw new ForbiddenError("Webhook timestamp outside accepted window.");
    }

    // The raw body MUST be a Buffer for HMAC. `express.raw` puts it
    // into `req.body` directly; if anyone wires JSON parser first,
    // this branch will trip immediately and prevent a silent skip.
    if (!Buffer.isBuffer(req.body)) {
      throw new ForbiddenError(
        "Webhook body parser misconfigured — expected raw Buffer, got an object."
      );
    }
    const rawBody = req.body.toString("utf8");

    // Source string per HubSpot v3 spec.
    //
    // SECURITY (Sprint 5.F.1): the URI MUST be reconstructed from a
    // server-trusted constant, NOT from `req.protocol` / `req.get("host")`.
    // Both of those derive from proxy headers (X-Forwarded-Proto,
    // X-Forwarded-Host) when `trust proxy` is configured, which means
    // an attacker on the same network segment as the trusted proxy
    // could (in theory) flip the scheme/host the server uses to verify
    // the HMAC and produce a mismatch on legitimate HubSpot traffic.
    // Using `env.APP_PUBLIC_URL` (which is enforced as a real https
    // origin in prod via the env validator) makes the source string
    // independent of any request-header tampering.
    //
    // Note: the operator MUST register the exact same URL in the
    // HubSpot Private App webhook settings — see
    // docs/hubspot_api_reference.md §14.4 step 3.
    const uri = `${env.APP_PUBLIC_URL.replace(/\/$/, "")}${req.originalUrl}`;
    const sourceString = `${req.method}${uri}${rawBody}${timestamp}`;

    const expected = crypto
      .createHmac("sha256", env.HUBSPOT_WEBHOOK_SECRET)
      .update(sourceString)
      .digest("base64");

    let valid = false;
    try {
      const a = Buffer.from(signature, "base64");
      const b = Buffer.from(expected, "base64");
      // timingSafeEqual rejects different-length buffers — both should
      // be 32 bytes (SHA-256 → base64 → back to 32-byte Buffer).
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      valid = false;
    }
    if (!valid) {
      logger.warn(
        { uri, sigLen: signature.length },
        "[hubspot:webhook] signature mismatch — rejecting"
      );
      throw new ForbiddenError("Webhook signature invalid.");
    }

    // Re-parse the verified raw body into JSON so downstream handlers
    // can use `req.body` as the object it expects. The receiver
    // controller does this defensively too, but doing it here keeps
    // the downstream code style consistent with other JSON endpoints.
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      // Override `req.body` with the parsed object. Express
      // intentionally allows this assignment.
      (req as Request & { body: unknown }).body = parsed;
    } catch {
      throw new ForbiddenError("Webhook body is not valid JSON.");
    }

    next();
  };
}
