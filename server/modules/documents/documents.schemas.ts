/**
 * Zod schemas for the documents API.
 *
 * Mirror the documents.payload shape locked in decisions.md
 * "Pre-Sprint 4 — Documents UX + payload shape + template flow"
 * (Q2): calc snapshot + wizard meta in one JSONB blob.
 *
 * The payload schema is permissive (`.passthrough()`) on the same
 * grounds as calculator-configs: full domain validation lives on
 * the frontend; we only enforce the schemaVersion required field.
 */

import { z } from "zod";

// ─── Scope enum ──────────────────────────────────────────────────────
/**
 * Document type. Matches the CHECK constraint on documents.scope.
 * `offer_and_agreement` = "both" — wizard last step renders 3 buttons
 * when this is selected, but the user saves a SINGLE document with
 * scope=offer_and_agreement that contains both renderings.
 */
export const documentScopeSchema = z.enum([
  "offer",
  "agreement",
  "offer_and_agreement"
]);
export type DocumentScope = z.infer<typeof documentScopeSchema>;

// ─── Payload ────────────────────────────────────────────────────────
/**
 * Permissive check — full validation lives on the frontend's
 * extractCalculatorSnapshot + wizard-meta build helpers. We just need
 * `schemaVersion` to be present so future migration logic can decide
 * whether to re-hydrate via legacy adapters.
 */
const payloadSchema = z
  .object({
    schemaVersion: z.number().int().positive()
  })
  .passthrough();

// ─── Create body ────────────────────────────────────────────────────
/**
 * POST /api/v1/documents body.
 *
 * Three flows produce the same shape; the service decides what each
 * field means contextually:
 *   - Flow A (from calc): caller provides `calculatorConfigId`;
 *     service loads the calc, merges with wizard meta from `payload`.
 *   - Flow B (use as template): the /:number/use-as-template route
 *     calls this internally with `calculatorConfigId=null` —
 *     payload carries the full new snapshot.
 *   - Flow C (direct clone): caller skips calculatorConfigId, posts
 *     the full payload directly. Rare; mostly for import scripts.
 */
export const createDocumentSchema = z.object({
  companyId: z.string().uuid({ message: "companyId must be a UUID" }),
  hubspotDealId: z.string().min(1).max(64).nullable().optional(),
  calculatorConfigId: z.string().uuid().nullable().optional(),
  scope: documentScopeSchema,
  payload: payloadSchema,
  addendum: z.string().trim().max(8_000).nullable().optional()
});
export type CreateDocumentRequest = z.infer<typeof createDocumentSchema>;

// ─── List query ─────────────────────────────────────────────────────
export const listDocumentsQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  hubspotDealId: z.string().min(1).max(64).optional(),
  // Sprint 6.4: filter documents by their source calculator-config id.
  // Powers the "Documents from this calculator" section on /calc/:id —
  // the operator sees every BSG-XXXXX document derived from a specific
  // calc draft.
  calculatorConfigId: z.string().uuid().optional(),
  scope: documentScopeSchema.optional(),
  // Substring search on number ("7100024" matches "BSG-7100024").
  q: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ─── Public DTO ─────────────────────────────────────────────────────
export const documentPublicSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  companyId: z.string().uuid(),
  hubspotDealId: z.string().nullable(),
  calculatorConfigId: z.string().uuid().nullable(),
  scope: documentScopeSchema,
  payload: z.unknown(),
  addendum: z.string().nullable(),
  hubspotSyncState: z.enum(["not_synced", "synced", "failed"]),
  hubspotNoteId: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DocumentPublic = z.infer<typeof documentPublicSchema>;
