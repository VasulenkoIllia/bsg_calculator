/**
 * Zod schemas for the calculator-configs API.
 *
 * Two responsibilities:
 *   1. Validate the request payloads (POST body, PUT body, query params).
 *   2. Project the DB row into a public DTO (drops nothing today, but
 *      kept as a separate type for forward-compatibility with auditing
 *      fields we may add later).
 *
 * The `payload` field is a JSONB blob holding the frontend's
 * CalculatorSnapshotPayload (src/components/calculator/snapshotShape.ts).
 * We DO NOT replicate that snapshot's full Zod schema here — doing so
 * would duplicate ~200 lines of calculator domain types in the backend
 * and create a maintenance trap. Instead we use a permissive structural
 * check (`z.record(z.unknown())`) and rely on the frontend to ship a
 * payload its own types accept. If a malformed shape sneaks through,
 * the calculator hydration will fail loudly on the next load — much
 * easier to debug than a backend Zod failure that doesn't know the
 * calculator's domain rules.
 */

import { z } from "zod";

// ─── Payload (CalculatorSnapshotPayload) ─────────────────────────────
/**
 * Permissive structural check on the JSONB payload. We accept any
 * object — the frontend has full Zod coverage on its own
 * CalculatorSnapshotPayload type. If business rules ever need to be
 * enforced at the API boundary, replace this with a strict mirror.
 *
 * NOTE: we still enforce `version: number` because that one field is
 * how the backend would detect "this row was saved by an older
 * frontend version" if we ever ship migration logic. Cheap insurance.
 */
const payloadSchema = z
  .object({
    version: z.number().int().positive()
  })
  .passthrough();

// ─── Create / update bodies ─────────────────────────────────────────
/**
 * POST /api/v1/calculator-configs body.
 *
 * `companyId` is required (UUID PK on companies table).
 * `hubspotDealId` optional — the NATURAL key on deals (e.g. "498828505295").
 * `title` optional — UI shows an auto-generated placeholder when null.
 */
export const createCalculatorConfigSchema = z.object({
  companyId: z.string().uuid({ message: "companyId must be a UUID" }),
  hubspotDealId: z.string().min(1).max(64).nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  payload: payloadSchema
});
export type CreateCalculatorConfigRequest = z.infer<typeof createCalculatorConfigSchema>;

/**
 * PUT /api/v1/calculator-configs/:id body — full replace of the
 * mutable fields. `companyId` is NOT replaceable (moving a config
 * across companies would invalidate any document that referenced it).
 * To "move" a draft, save it as a new config under the target company.
 */
export const updateCalculatorConfigSchema = z.object({
  hubspotDealId: z.string().min(1).max(64).nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  payload: payloadSchema
});
export type UpdateCalculatorConfigRequest = z.infer<typeof updateCalculatorConfigSchema>;

// ─── List query ─────────────────────────────────────────────────────
/**
 * GET /api/v1/calculator-configs?…filters…
 *
 * Default behaviour (showAll absent or false): filter by `companyId`
 * AND `(hubspot_deal_id IS NULL OR hubspot_deal_id = $dealId)`. This
 * matches the wizard Step 1 picker scope: "configs that could be
 * applied to THIS deal" (deal-pinned configs + company-level drafts).
 *
 * showAll=true drops the deal filter — shows every config for that
 * company. Used by the "Show all my configs" link in the picker.
 */
export const listCalculatorConfigsQuerySchema = z.object({
  companyId: z.string().uuid({ message: "companyId is required" }),
  hubspotDealId: z.string().min(1).max(64).optional(),
  // Coerce because URL params arrive as strings.
  showAll: z.coerce.boolean().optional().default(false),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListCalculatorConfigsQuery = z.infer<typeof listCalculatorConfigsQuerySchema>;

// ─── Public DTO ─────────────────────────────────────────────────────
/**
 * Public-facing calculator-config shape. Identical to the row today
 * but kept as a separate type so we can hide internal columns (e.g.
 * audit metadata) in the future without breaking response contracts.
 */
export const calculatorConfigPublicSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  hubspotDealId: z.string().nullable(),
  title: z.string().nullable(),
  payload: z.unknown(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CalculatorConfigPublic = z.infer<typeof calculatorConfigPublicSchema>;
