/**
 * Output DTO validation helper.
 *
 * Wraps Zod's `.parse()` for response-side validation. Output
 * validation differs from request validation:
 *   - Request fails → client bug → 400 VALIDATION_FAILED.
 *   - Response fails → SERVER bug (projection out of sync with
 *     schema) → 500 INTERNAL_ERROR + verbose log so operators can
 *     see exactly which field broke.
 *
 * The default error-handler classifies ZodErrors as 400, which would
 * mis-attribute server-side projection bugs to the client. Wrap
 * every `toPublic()` call with this helper instead.
 */

import { ZodError, type ZodTypeAny, type z } from "zod";
import { InternalError } from "./errors";
import { logger } from "../middleware/logger";

/**
 * Parse `data` against `schema` for an OUTPUT contract.
 * Throws InternalError (not ValidationError) on shape mismatch.
 *
 * `context` becomes the leading log label — pass something
 * recognisable like "companies.toPublic" so the failure points at
 * the projection function.
 */
export function parseDtoOrInternalError<Schema extends ZodTypeAny>(
  schema: Schema,
  data: unknown,
  context: string
): z.infer<Schema> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  logger.error(
    {
      context,
      issues: result.error.issues,
      data
    },
    `[dto-parse] response projection mismatch in ${context}`
  );

  const summary = result.error.issues
    .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

  throw new InternalError(
    `Response DTO mismatch in ${context}: ${summary}`
  );
}

export { ZodError };
