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
 * NOTE: we still enforce `schemaVersion: number` (matches the
 * frontend's `extractCalculatorSnapshot` output) because that field
 * is how the backend would detect "this row was saved by an older
 * frontend version" if we ever ship migration logic. Cheap insurance.
 */
const payloadSchema = z
  .object({
    schemaVersion: z.number().int().positive()
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
 * PUT /api/v1/calculator-configs/:id body — PARTIAL update.
 *
 * `payload` is required on every call (the auto-save path always
 * sends it). `hubspotDealId` and `title` use PATCH semantics:
 *
 *   - field ABSENT from body → leave unchanged on the row
 *   - field PRESENT as `null` → clear the column
 *   - field PRESENT as a string → replace with the new value
 *
 * `companyId` is NOT replaceable (moving a config across companies
 * would invalidate any document that referenced it). To "move" a
 * draft, save it as a new config under the target company.
 *
 * The route is named PUT for backwards-compat with the original
 * Sprint 3 contract; PATCH would be a more honest verb (Sprint 6.7
 * audit flagged this — kept PUT to avoid churning every caller).
 * See service.ts for the resolver that distinguishes undefined
 * vs. null inside the body.
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
 * Three call-site shapes use this endpoint:
 *
 *   1. Wizard Step 1 picker (Sprint 3):
 *        ?companyId=…&hubspotDealId=…&showAll=false
 *      "Configs that could be applied to THIS deal" — deal-pinned
 *      configs + company-level drafts.
 *
 *   2. CompanyDetailPage "Saved calculators" tab (Sprint 6.4):
 *        ?companyId=…&showAll=true
 *      Every config for the company regardless of deal pin.
 *
 *   3. Top-level /calculators list (Sprint 6.6):
 *        ?q=substring (optional)
 *      No companyId — returns every config the operator can see,
 *      optionally substring-filtered on title. Powers the
 *      "Saved Calculators" workspace tab.
 *
 * Sprint 6.6: `companyId` relaxed from required to optional so the
 * top-level discovery view works. When absent, no per-company
 * filter applies; when present, behaviour matches Sprint 3 + 6.4.
 */
export const listCalculatorConfigsQuerySchema = z.object({
  companyId: z.string().uuid({ message: "companyId must be a UUID" }).optional(),
  hubspotDealId: z.string().min(1).max(64).optional(),
  // Coerce because URL params arrive as strings.
  showAll: z.coerce.boolean().optional().default(false),
  // Sprint 6.6: substring search on `title`. Empty / whitespace-only
  // q is treated as absent. LIKE metacharacters are escaped by the
  // repository so `q=%` doesn't match every config.
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListCalculatorConfigsQuery = z.infer<typeof listCalculatorConfigsQuerySchema>;

// ─── Public DTO ─────────────────────────────────────────────────────
/**
 * Public-facing calculator-config shape. Identical to the row today
 * but kept as a separate type so we can hide internal columns (e.g.
 * audit metadata) in the future without breaking response contracts.
 *
 * Sprint 6.7 audit fix (S4): `companyName` is now populated by the
 * LIST endpoint via JOIN companies. The top-level /calculators page
 * needs it so every row identifies its company (previously every
 * row rendered an identical "Open company →" link with no name —
 * useless for disambiguation when an operator has 10 configs from
 * different companies).
 *
 * The field is optional because GET-by-id doesn't JOIN — the
 * /calc/:id consumer (CalculatorPage edit mode) only renders the
 * config's title in the SavedStatusBadge, not the company name.
 */
export const calculatorConfigPublicSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  companyName: z.string().optional(),
  hubspotDealId: z.string().nullable(),
  title: z.string().nullable(),
  payload: z.unknown(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CalculatorConfigPublic = z.infer<typeof calculatorConfigPublicSchema>;
